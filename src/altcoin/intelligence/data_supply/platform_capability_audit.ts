import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { readCsv, writeCsv } from "../../../utils/csv.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const OUT_DIR = join(ROOT, "data", "altcoin", "intelligence", "data_supply");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "data_supply");
const SMOKE_PATH = join(ROOT, "data", "health", "api_smoke_latest.csv");

interface PlatformSpec {
  platform: string;
  smokeService: string;
  officialMcp: "YES" | "BETA" | "NO_OFFICIAL_FOUND";
  officialMcpUrl: string;
  remoteEndpoint: string;
  globalPackages: string[];
  skillNames: string[];
  projectUsage: string;
  productionRole: string;
  mcpNotes: string;
}

interface AuditRow extends PlatformSpec {
  restStatus: string;
  restConfigured: string;
  activeSkills: string;
  installedPackages: string;
  codexPluginConfigured: string;
  currentAccessVerdict: string;
  nextAction: string;
}

const PLATFORMS: PlatformSpec[] = [
  {
    platform: "OKX CEX",
    smokeService: "OKX_PUBLIC_REST",
    officialMcp: "YES",
    officialMcpUrl: "https://www.okx.com/docs-v5/agent_en/",
    remoteEndpoint: "stdio: okx-trade-mcp --modules market",
    globalPackages: ["@okx_ai/okx-trade-mcp"],
    skillNames: ["okx-cex-market", "okx-cex-trade", "okx-cex-portfolio", "okx-cex-smartmoney"],
    projectUsage: "ticker, order book, funding, open interest, swap availability",
    productionRole: "short executability and CEX market sanity checks",
    mcpNotes: "Use market/read-only modules only before live trading approval.",
  },
  {
    platform: "OKX DEX OnchainOS",
    smokeService: "",
    officialMcp: "YES",
    officialMcpUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-ai-tools-mcp-server",
    remoteEndpoint: "https://web3.okx.com/api/v1/onchainos-mcp",
    globalPackages: ["mcp-remote"],
    skillNames: [],
    projectUsage: "not yet wired; overlaps token price, candles, holders, wallet balances",
    productionRole: "candidate enrichment and on-chain sanity cross-check",
    mcpNotes: "Requires OKX OnchainOS access header; do not hard-code keys.",
  },
  {
    platform: "CoinGlass",
    smokeService: "COINGLASS",
    officialMcp: "BETA",
    officialMcpUrl: "https://docs.coinglass.com/reference/mcp-service",
    remoteEndpoint: "official beta page does not expose a public endpoint in scraped docs",
    globalPackages: [],
    skillNames: [],
    projectUsage: "global OI, funding, liquidation, exchange OI trends",
    productionRole: "whole-market derivatives regime and short crowding",
    mcpNotes: "Keep REST as the production path until beta MCP endpoint/auth details are explicit.",
  },
  {
    platform: "Moralis",
    smokeService: "MORALIS",
    officialMcp: "YES",
    officialMcpUrl: "https://docs.moralis.com/data-api/cortex-api/overview",
    remoteEndpoint: "stdio: moralis-api-mcp",
    globalPackages: ["@moralisweb3/api-mcp-server"],
    skillNames: [],
    projectUsage: "ERC20 transfer windows, holder/transfer sampling",
    productionRole: "on-chain transfer coverage and CEX flow windows",
    mcpNotes: "Cortex page says it is deprecated in favor of Onchain Skills; REST remains the reproducible scanner path.",
  },
  {
    platform: "Arkham",
    smokeService: "ARKHAM",
    officialMcp: "NO_OFFICIAL_FOUND",
    officialMcpUrl: "",
    remoteEndpoint: "",
    globalPackages: [],
    skillNames: [],
    projectUsage: "entity labels, holder identity, segmented transfer features",
    productionRole: "entity attribution and false-positive reduction",
    mcpNotes: "No official MCP found in this pass; keep hardened REST probes and schema guards.",
  },
  {
    platform: "Etherscan V2",
    smokeService: "ETHERSCAN_V2",
    officialMcp: "YES",
    officialMcpUrl: "https://docs.etherscan.io/ai/mcp",
    remoteEndpoint: "https://mcp.etherscan.io/mcp",
    globalPackages: ["mcp-remote"],
    skillNames: [],
    projectUsage: "supply, token transfers, holders, name tags when configured",
    productionRole: "point-in-time chain facts and multichain EVM fallback",
    mcpNotes: "Remote MCP needs Authorization bearer header from ETHERSCAN_API_KEY.",
  },
  {
    platform: "DexScreener",
    smokeService: "DEXSCREENER",
    officialMcp: "NO_OFFICIAL_FOUND",
    officialMcpUrl: "https://docs.dexscreener.com/api/reference",
    remoteEndpoint: "",
    globalPackages: [],
    skillNames: [],
    projectUsage: "DEX pairs, liquidity, token boosts/order checks",
    productionRole: "tradability and DEX venue discovery",
    mcpNotes: "Official REST docs are available; MCP search results are community implementations.",
  },
  {
    platform: "CoinGecko",
    smokeService: "COINGECKO",
    officialMcp: "YES",
    officialMcpUrl: "https://docs.coingecko.com/docs/ai-agent-hub/mcp-server",
    remoteEndpoint: "https://mcp.api.coingecko.com/mcp",
    globalPackages: ["@coingecko/coingecko-mcp", "mcp-remote"],
    skillNames: [],
    projectUsage: "market data, pool discovery, on-chain pools, OHLCV",
    productionRole: "market context and DEX history enrichment",
    mcpNotes: "Public remote is keyless; Pro/BYOK unlocks more tools and rate limits.",
  },
  {
    platform: "CoinMarketCap",
    smokeService: "COINMARKETCAP",
    officialMcp: "YES",
    officialMcpUrl: "https://coinmarketcap.com/api/mcp/",
    remoteEndpoint: "https://mcp.coinmarketcap.com/mcp",
    globalPackages: ["mcp-remote"],
    skillNames: [],
    projectUsage: "metadata, supply, categories, map lookup",
    productionRole: "metadata normalization and narrative context",
    mcpNotes: "Remote MCP is read-only and needs X-CMC-MCP-API-KEY.",
  },
  {
    platform: "BscScan",
    smokeService: "BSCSCAN",
    officialMcp: "NO_OFFICIAL_FOUND",
    officialMcpUrl: "",
    remoteEndpoint: "",
    globalPackages: [],
    skillNames: [],
    projectUsage: "currently not configured; BSC fallback is Moralis plus Arkham labels",
    productionRole: "BSC holder and transfer fallback if key is added",
    mcpNotes: "Set BSCSCAN_API_KEY or route BSC through Etherscan V2 if supported by the account.",
  },
];

function loadDotenv(): void {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [name, valueRaw] = line.split(/=(.*)/s);
    if (!name || process.env[name]) continue;
    process.env[name] = (valueRaw || "").trim().replace(/^["']|["']$/g, "");
  }
}

function smokeRows(): Map<string, { status: string; configured: string }> {
  const csv = readCsv(SMOKE_PATH);
  const out = new Map<string, { status: string; configured: string }>();
  if (!csv) return out;
  for (const row of csv.rows) {
    const obj: Record<string, string> = {};
    csv.h.forEach((header, index) => {
      obj[header] = row[index] || "";
    });
    out.set(obj.service || "", { status: obj.status || "", configured: obj.configured || "" });
  }
  return out;
}

function skillInstalled(skillName: string): boolean {
  return existsSync(join(homedir(), ".codex", "skills", skillName, "SKILL.md"));
}

function packageVersion(packageName: string): string {
  const packageParts = packageName.split("/");
  const globalRoots = [
    process.env.APPDATA ? join(process.env.APPDATA, "npm", "node_modules") : "",
    join(homedir(), "AppData", "Roaming", "npm", "node_modules"),
  ].filter(Boolean);
  for (const root of globalRoots) {
    const packageJson = join(root, ...packageParts, "package.json");
    if (!existsSync(packageJson)) continue;
    try {
      return JSON.parse(readFileSync(packageJson, "utf-8")).version || "";
    } catch {
      return "";
    }
  }

  try {
    const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
    const raw = execFileSync(npmBin, ["list", "-g", packageName, "--depth=0", "--json"], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
    const parsed = JSON.parse(raw);
    return parsed.dependencies?.[packageName]?.version || "";
  } catch {
    return "";
  }
}

function codexConfigText(): string {
  const path = join(homedir(), ".codex", "config.toml");
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function decideVerdict(spec: PlatformSpec, restStatus: string, installedPackages: string, activeSkills: string, codexPluginConfigured: string): { verdict: string; nextAction: string } {
  const restOk = restStatus === "OK" || !spec.smokeService;
  const hasSkill = activeSkills !== "";
  const hasPackage = installedPackages !== "";
  if (restOk && (hasSkill || hasPackage) && codexPluginConfigured === "true") {
    return { verdict: "REST_OK_AND_MCP_ACTIVE", nextAction: "Use MCP only for ad-hoc corroboration; keep scanner on REST snapshots." };
  }
  if (restOk && (hasSkill || hasPackage)) {
    return { verdict: "REST_OK_PACKAGE_OR_SKILL_INSTALLED_BUT_NOT_ACTIVE_MCP", nextAction: "Add/restart a Codex MCP plugin if tool-call access is required in-session." };
  }
  if (restOk) {
    return { verdict: "REST_OK_NO_ACTIVE_MCP", nextAction: "Keep REST pipeline; add official MCP only if it adds non-overlapping tools." };
  }
  return { verdict: "DATA_SOURCE_REPAIR_REQUIRED", nextAction: "Fix API key/configuration before allowing formal scan dependency." };
}

function buildReport(rows: AuditRow[]): string {
  const lines = [
    "# Platform Capability Audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This is a scanner-readiness audit, not a trading permission grant. REST snapshots remain the reproducible production path; MCP/skills are for interactive checks unless explicitly cached.",
    "",
    "| platform | REST | official MCP | installed skills/packages | Codex MCP active | production role | verdict |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    const installed = [row.activeSkills, row.installedPackages].filter(Boolean).join(" / ") || "none";
    lines.push(`| ${row.platform} | ${row.restStatus || "n/a"} | ${row.officialMcp} | ${installed} | ${row.codexPluginConfigured} | ${row.productionRole} | ${row.currentAccessVerdict} |`);
  }
  lines.push(
    "",
    "## Sources",
    "",
    ...rows
      .filter((row) => row.officialMcpUrl)
      .map((row) => `- ${row.platform}: ${row.officialMcpUrl}`),
    "",
    "## Next Gate",
    "",
    "Formal chain scanning should require: API smoke OK, CEX flow windows fully covered, entity coverage above threshold, and directional output separated into long-watch and short-watch buckets."
  );
  return lines.join("\n");
}

async function main() {
  loadDotenv();
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const smoke = smokeRows();
  const configText = codexConfigText();
  const rows: AuditRow[] = PLATFORMS.map((spec) => {
    const smokeRow = spec.smokeService ? smoke.get(spec.smokeService) : undefined;
    const activeSkills = spec.skillNames.filter(skillInstalled).join(";");
    const installedPackages = spec.globalPackages
      .map((packageName) => {
        const version = packageVersion(packageName);
        return version ? `${packageName}@${version}` : "";
      })
      .filter(Boolean)
      .join(";");
    const codexPluginConfigured = configText.toLowerCase().includes(spec.platform.toLowerCase().split(" ")[0]) ? "true" : "false";
    const decision = decideVerdict(spec, smokeRow?.status || "", installedPackages, activeSkills, codexPluginConfigured);
    return {
      ...spec,
      restStatus: smokeRow?.status || (spec.smokeService ? "MISSING_SMOKE_ROW" : "N/A"),
      restConfigured: smokeRow?.configured || "",
      activeSkills,
      installedPackages,
      codexPluginConfigured,
      currentAccessVerdict: decision.verdict,
      nextAction: decision.nextAction,
    };
  });

  const outPath = join(OUT_DIR, "platform_capability_audit_latest.csv");
  const reportPath = join(REPORTS_DIR, "platform_capability_audit_latest.md");
  writeCsv(outPath, [
    ["checked_at", "platform", "rest_service", "rest_status", "rest_configured", "official_mcp", "official_mcp_url", "remote_endpoint", "active_skills", "installed_packages", "codex_plugin_configured", "project_usage", "production_role", "mcp_notes", "current_access_verdict", "next_action"],
    ...rows.map((row) => [new Date().toISOString(), row.platform, row.smokeService, row.restStatus, row.restConfigured, row.officialMcp, row.officialMcpUrl, row.remoteEndpoint, row.activeSkills, row.installedPackages, row.codexPluginConfigured, row.projectUsage, row.productionRole, row.mcpNotes, row.currentAccessVerdict, row.nextAction]),
  ]);
  writeFileSync(reportPath, buildReport(rows), "utf-8");

  console.log("=== Platform Capability Audit ===");
  for (const row of rows) {
    console.log(`${row.platform}: REST=${row.restStatus} officialMcp=${row.officialMcp} installed=${row.activeSkills || row.installedPackages || "none"} verdict=${row.currentAccessVerdict}`);
  }
  console.log(`Output: ${outPath}`);
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
