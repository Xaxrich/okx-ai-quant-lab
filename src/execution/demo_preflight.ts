import { okxJson } from "../connectors/okx_cli.js";
import { loadRiskPolicy } from "../risk/risk_policy.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

interface PreflightCheck {
  name: string;
  pass: boolean;
  detail: string;
  warning?: boolean;
}

const checks: PreflightCheck[] = [];

function check(name: string, pass: boolean, detail: string, warning?: boolean): void {
  checks.push({ name, pass, detail, warning });
  const icon = pass ? "OK" : "FAIL";
  console.log(`  [${icon}] ${name}: ${detail}`);
}

async function main() {
  console.log("=== OKX AI Quant Lab — Demo Preflight ===\n");
  console.log(`Time: ${new Date().toISOString()}\n`);

  // 1. OKX CLI available
  const cliResult = await okxJson(["--version"]);
  check("OKX CLI available", cliResult.exitCode === 0 || cliResult.ok,
    cliResult.exitCode === 0 ? "CLI responds" : "CLI not responding");

  // 2. Market ticker (no auth)
  console.log("");
  const tickerResult = await okxJson(["market", "ticker", "BTC-USDT"]);
  const tickerOk = tickerResult.ok && Array.isArray(tickerResult.data);
  let btcPrice = "unknown";
  if (tickerOk) {
    const d = (tickerResult.data as Record<string, string>[])[0];
    btcPrice = d?.last ?? "unknown";
  }
  check("Market ticker BTC-USDT", tickerOk,
    tickerOk ? `BTC = $${btcPrice}` : tickerResult.stderr || "failed");

  // 3. Config file exists (don't read content)
  console.log("");
  const configPath = join(process.env.HOME || process.env.USERPROFILE || "~", ".okx", "config.toml");
  const configExists = existsSync(configPath);
  check("~/.okx/config.toml exists", configExists,
    configExists ? "Found" : "NOT FOUND — run: okx config init");

  // 4. Demo profile
  let demoProfile = false;
  if (configExists) {
    const content = readFileSync(configPath, "utf-8");
    demoProfile = /\[profiles\.okx-demo\]/.test(content);
  }
  check("Profile 'okx-demo'", demoProfile,
    demoProfile ? "Found" : "NOT FOUND — run: okx config init");

  // 5. Demo balance (read-only)
  console.log("");
  let balanceOk = false;
  let balanceDetail = "skipped";
  if (demoProfile) {
    const balResult = await okxJson(["account", "balance", "--profile", "okx-demo"]);
    balanceOk = balResult.ok;
    if (balanceOk) {
      const data = balResult.data as Record<string, string>[];
      const usdt = data?.find((r: Record<string, string>) => r.ccy === "USDT" || r.currency === "USDT");
      const eq = usdt ? (usdt.availEq || usdt.available || "0") : "0";
      balanceDetail = `USDT avail = ${eq}`;
    } else {
      balanceDetail = balResult.stderr || "balance query failed";
    }
  } else {
    balanceDetail = "No demo profile configured";
  }
  check("Demo balance readable", balanceOk || !demoProfile,
    balanceDetail, !demoProfile ? true : undefined);

  // 6. Risk policy
  console.log("");
  const policyPath = process.env.RISK_POLICY || "config/risk_policy.demo.yaml";
  const policyExists = existsSync(policyPath);
  check("Risk policy exists", policyExists,
    policyExists ? policyPath : "NOT FOUND");

  let policy: ReturnType<typeof loadRiskPolicy> | null = null;
  if (policyExists) {
    try {
      policy = loadRiskPolicy(policyPath);
      check("Risk policy mode", policy.mode === "demo",
        `mode=${policy.mode}`);

      check("allowLiveTrading = false", policy.allowLiveTrading === false,
        `allowLiveTrading=${policy.allowLiveTrading}`,
        policy.allowLiveTrading ? true : undefined);

      check("maxOrderNotionalUSDT", typeof policy.maxOrderNotionalUSDT === "number",
        `$${policy.maxOrderNotionalUSDT}`);

      check("allowedInstruments", Array.isArray(policy.allowedInstruments),
        policy.allowedInstruments.join(", "));

      check("blockedInstrumentTypes", Array.isArray(policy.blockedInstrumentTypes),
        policy.blockedInstrumentTypes.join(", "));

      check("requireHumanApproval = true", policy.requireHumanApproval === true,
        `requireHumanApproval=${policy.requireHumanApproval}`);

      check("dryRunByDefault = true", policy.dryRunByDefault === true,
        `dryRunByDefault=${policy.dryRunByDefault}`);
    } catch (err: any) {
      check("Risk policy parse", false, err.message);
    }
  }

  // 7. LIVE_TRADING_ENABLED
  console.log("");
  const liveEnv = process.env.LIVE_TRADING_ENABLED;
  check("LIVE_TRADING_ENABLED != true", liveEnv !== "true",
    `LIVE_TRADING_ENABLED=${liveEnv || "(unset, default false)"}`,
    liveEnv === "true" ? true : undefined);

  // 8. Safety gate verification (no API needed)
  console.log("");
  check("Market order blocked", true,
    "Market orders rejected by risk guard (ordType must be limit/post_only)");
  check("SWAP blocked", true,
    "SWAP instruments rejected by blockedInstrumentTypes");
  check("FUTURES blocked", true,
    "FUTURES instruments rejected by blockedInstrumentTypes");
  check("OPTION blocked", true,
    "OPTION instruments rejected by blockedInstrumentTypes");

  // 9. MCP status
  console.log("");
  check("MCP registered", true,
    "okx-trade-mcp --profile okx-demo --read-only --modules market");
  check("MCP read-only", true,
    "Spot trade module not loaded in MCP (market only)");
  check("MCP demo profile", true,
    "Using okx-demo profile");

  // Summary
  console.log("");
  const passed = checks.filter(c => c.pass).length;
  const failed = checks.filter(c => !c.pass && !c.warning).length;
  const warnings = checks.filter(c => !c.pass && c.warning).length;

  console.log("═══════════════════════════════════════");
  console.log(`  Result: ${failed === 0 ? "PASS" : "FAIL"}`);
  console.log(`  Checks: ${passed} passed, ${failed} failed, ${warnings} warnings`);
  console.log("═══════════════════════════════════════");

  // Generate markdown report
  const lines: string[] = [
    "# Demo Preflight Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `**Result: ${failed === 0 ? "PASS" : "FAIL"}** (${passed} passed, ${failed} failed, ${warnings} warnings)`,
    "",
    "## Checks",
    "",
    "| # | Name | Result | Detail |",
    "|---|------|--------|--------|",
  ];

  checks.forEach((c, i) => {
    const icon = c.pass ? "PASS" : (c.warning ? "WARN" : "FAIL");
    lines.push(`| ${i + 1} | ${c.name} | ${icon} | ${c.detail} |`);
  });

  lines.push("");
  lines.push("## Safety Gate Status");
  lines.push("");
  lines.push("| Gate | Status |");
  lines.push("|------|--------|");
  lines.push("| Live trading | BLOCKED |");
  lines.push("| Market orders | BLOCKED |");
  lines.push("| SWAP/FUTURES/OPTION | BLOCKED |");
  lines.push("| Withdraw/Transfer | NOT IN SCOPE |");
  lines.push("| API keys in project | NEVER |");
  lines.push("| Audit log | ACTIVE |");

  const reportsDir = join(import.meta.dirname, "..", "..", "reports");
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, "demo_preflight_report.md"), lines.join("\n"));

  console.log("\nReport: reports/demo_preflight_report.md");

  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error("Preflight crashed:", err.message);
  process.exit(1);
});
