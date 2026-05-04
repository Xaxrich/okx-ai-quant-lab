import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const CG_KEY = process.env.COINGLASS_API_KEY || "";
const CG_BASE = "https://open-api-v4.coinglass.com";
const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "coinglass");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "coinglass");

interface ProbeResult { endpoint: string; token: string; status: string; rows: number; usable: boolean; notes: string; }

async function cgGet(path: string): Promise<any> {
  if (!CG_KEY) return { status: "COINGLASS_NOT_CONFIGURED" };
  try {
    const r = await fetch(`${CG_BASE}${path}`, { headers: { "CG-API-KEY": CG_KEY, "Accept": "application/json" } });
    if (r.status === 429) return { status: "RATE_LIMITED" };
    if (!r.ok) return { status: `HTTP_${r.status}` };
    return { status: "OK", data: await r.json() };
  } catch (e: any) { return { status: "ERROR", error: e.message }; }
}

const TOKENS = [
  { sym: "BSB", group: "P0" }, { sym: "LAB", group: "P0" },
  { sym: "UB", group: "P0" }, { sym: "AI", group: "P0" },
  { sym: "PEPE", group: "CONTROL" }, { sym: "WIF", group: "CONTROL" },
  { sym: "BONK", group: "CONTROL" }, { sym: "FLOKI", group: "CONTROL" },
];

async function main() {
  console.log("=== CoinGlass Capability Probe ===\n");
  if (!CG_KEY) { console.log("COINGLASS_NOT_CONFIGURED"); return; }
  console.log("CoinGlass API: CONFIGURED\n");

  if (!existsSync(OUT_DIR + "/probes")) mkdirSync(OUT_DIR + "/probes", { recursive: true });
  if (!existsSync(OUT_DIR + "/analysis")) mkdirSync(OUT_DIR + "/analysis", { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const allResults: ProbeResult[] = [];

  // 1. Supported coins
  const coinsR = await cgGet("/api/futures/supported-coins");
  const coinsOk = coinsR.status === "OK" && coinsR.data?.data?.length > 0;
  console.log(`Supported coins: ${coinsOk ? coinsR.data.data.length + " coins" : coinsR.status}`);
  allResults.push({ endpoint: "supported_coins", token: "ALL", status: coinsR.status, rows: coinsR.data?.data?.length || 0, usable: coinsOk, notes: "" });

  // Check our tokens in supported coins
  if (coinsOk) {
    const coinSet = new Set(coinsR.data.data.map((c: any) => (c.symbol || c.name || "").toUpperCase()));
    for (const t of TOKENS) {
      const found = coinSet.has(t.sym.toUpperCase());
      console.log(`  ${t.sym}: ${found ? "FOUND in supported coins" : "NOT FOUND"}`);
    }
  }

  // 2. Coins markets (get current OI, funding, market cap)
  const marketsR = await cgGet("/api/futures/coins-markets");
  const marketsOk = marketsR.status === "OK" && marketsR.data?.data?.length > 0;
  console.log(`\nCoins markets: ${marketsOk ? marketsR.data.data.length + " coins" : marketsR.status}`);
  allResults.push({ endpoint: "coins_markets", token: "ALL", status: marketsR.status, rows: marketsR.data?.data?.length || 0, usable: marketsOk, notes: "" });

  if (marketsOk) {
    const marketMap = new Map<string, any>();
    for (const m of marketsR.data.data) marketMap.set((m.symbol || "").toUpperCase(), m);
    for (const t of TOKENS) {
      const m = marketMap.get(t.sym.toUpperCase());
      if (m) {
        console.log(`  ${t.sym}: OI=$${((m.openInterestUsd || m.open_interest_usd || 0)/1e6).toFixed(0)}M, funding_oi=${(m.avgFundingRateByOi || m.avg_funding_rate_by_oi || 0).toFixed(4)}%, OI/mcap=${(m.openInterestMarketCapRatio || 0).toFixed(2)}`);
      }
    }
  }

  // 3. Aggregated OI history for a sample (PEPE)
  console.log("\nTesting aggregated OI history (PEPE)...");
  const oiR = await cgGet("/api/futures/open-interest/aggregated-history?symbol=PEPE&interval=1d&limit=30&unit=usd");
  const oiOk = oiR.status === "OK" && oiR.data?.data?.length > 0;
  console.log(`  PEPE OI: ${oiOk ? oiR.data.data.length + " rows" : oiR.status}`);
  allResults.push({ endpoint: "agg_oi_history", token: "PEPE", status: oiR.status, rows: oiR.data?.data?.length || 0, usable: oiOk, notes: "" });

  // 4. Exchange OI list for a sample
  console.log("Testing exchange OI list (PEPE)...");
  const exOiR = await cgGet("/api/futures/open-interest/exchange-list?symbol=PEPE");
  const exOiOk = exOiR.status === "OK" && exOiR.data?.data?.length > 0;
  if (exOiOk) {
    const top3 = exOiR.data.data.slice(0, 3).map((e: any) => `${e.exchangeName || "?"}: ${((e.amountUsd || e.openInterestUsd || 0)/1e6).toFixed(1)}M`);
    console.log(`  Exchange OI: ${exOiR.data.data.length} exchanges | ${top3.join(", ")}`);
  } else {
    console.log(`  Exchange OI: ${exOiR.status}`);
  }
  allResults.push({ endpoint: "exchange_oi_list", token: "PEPE", status: exOiR.status, rows: exOiR.data?.data?.length || 0, usable: exOiOk, notes: "" });

  // 5. Funding rate (OI-weighted) for a sample
  console.log("Testing OI-weighted funding (PEPE)...");
  const fundR = await cgGet("/api/futures/funding-rate/oi-weight-history?symbol=PEPE&interval=1d&limit=30");
  const fundOk = fundR.status === "OK" && fundR.data?.data?.length > 0;
  console.log(`  Funding: ${fundOk ? fundR.data.data.length + " rows" : fundR.status}`);
  allResults.push({ endpoint: "oi_weighted_funding", token: "PEPE", status: fundR.status, rows: fundR.data?.data?.length || 0, usable: fundOk, notes: "" });

  // 6. Liquidation history
  console.log("Testing liquidation history (PEPE)...");
  const liqR = await cgGet("/api/futures/liquidation/aggregated-history?symbol=PEPE&interval=1d&limit=30&exchangeList=Binance,OKX,Bybit");
  const liqOk = liqR.status === "OK" && liqR.data?.data?.length > 0;
  console.log(`  Liquidation: ${liqOk ? liqR.data.data.length + " rows" : liqR.status}`);
  allResults.push({ endpoint: "aggregated_liquidation", token: "PEPE", status: liqR.status, rows: liqR.data?.data?.length || 0, usable: liqOk, notes: "" });

  // Write results
  const csvH = "endpoint,token,status,rows,usable,notes";
  const csvR = [csvH, ...allResults.map(r => `${r.endpoint},${r.token},${r.status},${r.rows},${r.usable},${r.notes}`)];
  writeFileSync(join(OUT_DIR, "probes", "coinglass_capability_probe.csv"), csvR.join("\n"));

  const usableCount = allResults.filter(r => r.usable).length;
  console.log(`\n=== Summary: ${usableCount}/${allResults.length} endpoints usable ===`);

  // Report
  const reportLines = [
    "# CoinGlass Capability Report", "", `Generated: ${new Date().toISOString()}`,
    "", "## 1. API Status", "",
    "API key: CONFIGURED",
    "", "## 2. Endpoint Coverage", "",
    `Supported coins: ${coinsOk ? "✓" : "✗"}`,
    `Coins markets: ${marketsOk ? "✓" : "✗"}`,
    `Aggregated OI history: ${oiOk ? "✓" : "✗"}`,
    `Exchange OI list: ${exOiOk ? "✓" : "✗"}`,
    `OI-weighted funding: ${fundOk ? "✓" : "✗"}`,
    `Aggregated liquidation: ${liqOk ? "✓" : "✗"}`,
    "", "## 3. New Capabilities vs OKX", "",
    "- Multi-exchange aggregated OI (vs OKX single-exchange)",
    "- Exchange-level OI distribution (which exchange dominates)",
    "- OI-weighted funding (more representative than OKX-only funding)",
    "- Cross-exchange liquidation history (didn't exist before)",
    "- Long/short account ratio (to be probed next)",
    "", "## 4. Recommendation", "",
    usableCount >= 5 ? "**COINGLASS_READY_FOR_DERIVATIVES_V2** — upgrade Round 2 with multi-exchange data." : usableCount >= 3 ? "**COINGLASS_PARTIAL_USEFUL** — some endpoints work." : "**NEED_MORE_PROBE**",
    "", "## 5. What This Cannot Prove", "",
    "- Cannot confirm derivatives positioning from OI alone",
    "- Cannot confirm accumulation or distribution",
    "- No trading recommendations",
  ];
  writeFileSync(join(REPORTS_DIR, "coinglass_capability_report.md"), reportLines.join("\n"));
  console.log(`\nReport: ${join(REPORTS_DIR, "coinglass_capability_report.md")}`);
}

main().catch(console.error);
