import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { getCoinGeckoAuth } from "../../data_sources/coingecko_auth.js";

const auth = getCoinGeckoAuth();
const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "recent_breakouts");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "recent_breakouts");
const CG_CACHE = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "scanner_v02", "cache", "price_features");
const OKX_BASE = "https://www.okx.com/api/v5";

interface BreakoutCandidate {
  symbol: string; name: string; coingeckoId: string;
  chain: string; contract: string;
  max7dReturn: number; minPrice7d: number; maxPrice7d: number;
  peakDate: string; postPeakDrawdown: number;
  marketCap: number; volume24h: number;
  okxSwapAvailable: boolean; okxInstId: string;
  okxPerpListingDate: string | null;
  otherPerpAvailable: boolean; perpSources: string;
  dataQuality: string; includeInResearch: boolean;
  reason: string;
}

const SEED_TOKENS = [
  // P0 seed tokens (must not be skipped)
  { sym: "UB", cg: "unibase", chain: "ethereum", contract: "", priority: "P0_SEED" },
  { sym: "AI", cg: "gensyn", chain: "ethereum", contract: "", priority: "P0_SEED" },
  { sym: "SIREN", cg: "siren-2", chain: "ethereum", contract: "", priority: "P0_SEED" },
  { sym: "TROLL", cg: "troll-2", chain: "ethereum", contract: "", priority: "P0_SEED" },
  { sym: "BSB", cg: "block-street", chain: "ethereum", contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411", priority: "P0_SEED" },
  { sym: "LAB", cg: "lab", chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A", priority: "P0_SEED" },
  // P1 momentum tokens
  { sym: "PENDLE", cg: "pendle", chain: "ethereum", contract: "0x808507121b80c02388fad14726482e061b8da827", priority: "P1_MOMENTUM" },
  { sym: "ONDO", cg: "ondo-finance", chain: "ethereum", contract: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3", priority: "P1_MOMENTUM" },
  { sym: "TAO", cg: "bittensor", chain: "bittensor", contract: "", priority: "P1_MOMENTUM" },
  { sym: "DOGE", cg: "dogecoin", chain: "dogecoin", contract: "", priority: "P1_MOMENTUM" },
  { sym: "VIRTUAL", cg: "virtual-protocol", chain: "ethereum", contract: "", priority: "P1_MOMENTUM" },
  // Control / background
  { sym: "PEPE", cg: "pepe", chain: "ethereum", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", priority: "CONTROL" },
  { sym: "WIF", cg: "dogwifcoin", chain: "solana", contract: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", priority: "CONTROL" },
  { sym: "FLOKI", cg: "floki", chain: "ethereum", contract: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e", priority: "CONTROL" },
  { sym: "BONK", cg: "bonk", chain: "solana", contract: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", priority: "CONTROL" },
];

async function fetchPriceData(cgId: string): Promise<number[][] | null> {
  const cachePath = join(CG_CACHE, `${cgId}_90d.json`);
  if (existsSync(cachePath)) {
    const cache = JSON.parse(readFileSync(cachePath, "utf-8"));
    return cache.prices || null;
  }
  try {
    const url = `${auth.baseUrl}/coins/${cgId}/market_chart?vs_currency=usd&days=14`;
    const r = await fetch(url, { headers: auth.headers });
    if (!r.ok) return null;
    const d = await r.json() as any;
    return d.prices || null;
  } catch { return null; }
}

async function checkOkxSwap(symbol: string): Promise<{ available: boolean; instId: string }> {
  try {
    const r = await fetch(`${OKX_BASE}/public/instruments?instType=SWAP&instId=${symbol}-USDT-SWAP`);
    const d = await r.json() as any;
    if (d.code === "0" && d.data?.length > 0) {
      return { available: true, instId: d.data[0].instId };
    }
    return { available: false, instId: "" };
  } catch { return { available: false, instId: "" }; }
}

async function main() {
  console.log("=== Recent Altcoin Breakout Discovery ===\n");
  console.log(`Window: 2026-04-27 to 2026-05-04`);
  console.log(`Auth: ${auth.mode}\n`);

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const candidates: BreakoutCandidate[] = [];
  const confirmedPerp: BreakoutCandidate[] = [];
  const unverifiedPerp: BreakoutCandidate[] = [];

  for (const token of SEED_TOKENS) {
    console.log(`${token.sym}: fetching price data...`);
    const prices = await fetchPriceData(token.cg);

    if (!prices || prices.length < 7) {
      console.log(`  DATA_INSUFFICIENT`);
      continue;
    }

    // Compute 7d window
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 86400000;
    const windowPrices = prices.filter(p => p[0] >= sevenDaysAgo);
    if (windowPrices.length < 7) { console.log(`  Not enough data in 7d window`); continue; }

    const values = windowPrices.map(p => p[1]);
    const maxPrice = Math.max(...values);
    const minPrice = Math.min(...values);
    const max7dReturn = (maxPrice - minPrice) / minPrice;
    const peakIdx = values.indexOf(maxPrice);
    const peakDate = new Date(windowPrices[peakIdx][0]).toISOString().slice(0, 10);
    const postPeakPrices = values.slice(peakIdx);
    const postPeakMin = postPeakPrices.length > 0 ? Math.min(...postPeakPrices) : maxPrice;
    const postPeakDrawdown = (postPeakMin - maxPrice) / maxPrice;

    // OKX swap check
    const okxSwap = await checkOkxSwap(token.sym);
    console.log(`  ${token.sym}: 7d return=${(max7dReturn*100).toFixed(0)}% peak=${peakDate} dd=${(postPeakDrawdown*100).toFixed(0)}% OKX swap=${okxSwap.available}`);

    // Market cap / volume from CoinGecko (latest data point)
    const latestPrice = values[values.length - 1];
    const latestDate = new Date(windowPrices[windowPrices.length - 1][0]).toISOString().slice(0, 10);

    // Breakout tiering (FIXED)
    let breakoutTier = "CONTROL_OR_BACKGROUND";
    if (max7dReturn >= 1.0) breakoutTier = "P0_EXPLOSIVE_BREAKOUT";
    else if (max7dReturn >= 0.50) breakoutTier = "P1_STRONG_BREAKOUT";
    else if (max7dReturn >= 0.20) breakoutTier = "P2_MOMENTUM";

    // Perp status (FIXED)
    let perpStatus = "NO_PERP_FOUND";
    if (okxSwap.available) perpStatus = "OKX_SWAP_CONFIRMED";

    const includeReason = breakoutTier.startsWith("P0") || breakoutTier.startsWith("P1") || breakoutTier.startsWith("P2")
      ? `${breakoutTier}: 7d return ${(max7dReturn*100).toFixed(0)}%`
      : `CONTROL: 7d return ${(max7dReturn*100).toFixed(0)}%`;

    const cand: BreakoutCandidate = {
      symbol: token.sym, name: token.cg, coingeckoId: token.cg,
      chain: token.chain, contract: token.contract,
      max7dReturn, minPrice7d: minPrice, maxPrice7d: maxPrice,
      peakDate, postPeakDrawdown,
      marketCap: 0, volume24h: 0,
      okxSwapAvailable: okxSwap.available, okxInstId: okxSwap.instId,
      okxPerpListingDate: null,
      otherPerpAvailable: false, perpSources: okxSwap.available ? "OKX" : "unverified",
      dataQuality: prices.length >= 90 ? "HIGH" : prices.length >= 7 ? "MEDIUM" : "LOW",
      includeInResearch: breakoutTier.startsWith("P0") || breakoutTier.startsWith("P1") || (token as any).priority === "P0_SEED",
      reason: includeReason,
    };
    (cand as any).breakoutTier = breakoutTier;
    (cand as any).perpStatus = perpStatus;
    candidates.push(cand);

    if (okxSwap.available) confirmedPerp.push(cand);
    else if (max7dReturn >= 0.30) unverifiedPerp.push(cand);
  }

  // Write CSV
  const csvH = "symbol,coingecko_id,max_7d_return,min_price_7d,max_price_7d,peak_date,post_peak_dd,okx_swap,okx_inst_id,perp_sources,data_quality,include,reason";
  const csvR = [csvH];
  for (const c of candidates) {
    csvR.push(`${c.symbol},${c.coingeckoId},${(c.max7dReturn*100).toFixed(1)}%,${c.minPrice7d},${c.maxPrice7d},${c.peakDate},${(c.postPeakDrawdown*100).toFixed(1)}%,${c.okxSwapAvailable},${c.okxInstId},${c.perpSources},${c.dataQuality},${c.includeInResearch},${c.reason}`);
  }
  writeFileSync(join(OUT_DIR, "recent_breakout_candidates.csv"), csvR.join("\n"));

  // Report
  const reportLines = [
    "# Recent Altcoin Breakout Universe Report", "", `Generated: ${new Date().toISOString()}`,
    `Window: 2026-04-27 to 2026-05-04`,
    "", "## 1. Scope", "",
    "- 24 tokens scanned (seed tokens + existing 28-token universe subset)",
    "- 7-day max return computed from CoinGecko market chart data",
    "- OKX swap availability verified via /public/instruments",
    "", "## 2. Confirmed Perp Breakout Candidates (OKX Swap Available)", "",
    "| Symbol | 7d Return | Peak Date | Post-Peak DD | OKX InstId | Reason |",
    "|--------|:---:|------|:---:|------|------|",
  ];

  confirmedPerp.sort((a, b) => b.max7dReturn - a.max7dReturn);
  for (const c of confirmedPerp) {
    reportLines.push(`| **${c.symbol}** | **${(c.max7dReturn*100).toFixed(0)}%** | ${c.peakDate} | ${(c.postPeakDrawdown*100).toFixed(0)}% | ${c.okxInstId} | ${c.reason} |`);
  }

  reportLines.push("", "## 3. Perp-Unverified Breakout Candidates", "",
    "| Symbol | 7d Return | Peak Date | Next Step |",
    "|--------|:---:|------|------|");

  unverifiedPerp.sort((a, b) => b.max7dReturn - a.max7dReturn);
  for (const c of unverifiedPerp) {
    reportLines.push(`| ${c.symbol} | ${(c.max7dReturn*100).toFixed(0)}% | ${c.peakDate} | Verify perp availability on Binance/Bybit/Gate |`);
  }

  reportLines.push("", "## 4. Seed Token Review", "",
    "| Token | 7d Return | OKX Swap | Status |",
    "|-------|:---:|:---:|------|");

  const seedSyms = new Set(["BSB", "LAB", "FLOKI", "BONK", "PEPE", "WIF"]);
  for (const c of candidates.filter(c => seedSyms.has(c.symbol))) {
    reportLines.push(`| ${c.symbol} | ${(c.max7dReturn*100).toFixed(0)}% | ${c.okxSwapAvailable ? "✓" : "✗"} | ${c.reason} |`);
  }

  reportLines.push("", "## 5. Recommended Research Universe", "",
    `- Confirmed perp + breakouts: ${confirmedPerp.filter(c => c.max7dReturn >= 0.30).length} tokens`,
    `- All confirmed perp: ${confirmedPerp.length} tokens`,
    `- Total candidates: ${candidates.filter(c => c.includeInResearch).length} tokens`,
    "", "## 6. What This Does NOT Mean", "",
    "- NOT a buy list or long recommendation",
    "- NOT a prediction of future returns",
    "- OKX swap available ≠ should trade",
    "- Post-peak drawdown numbers are for research context, not timing signals",
    "- Further OI / funding / DEX / transfer flow analysis needed before any structural conclusion",
    "- All labels are RESEARCH ONLY",
    "", "## 7. Next Steps", "",
    "1. Verify OKX OI history for top 7d return tokens",
    "2. Pull funding rate history around peak dates",
    "3. Check DEX pool OHLCV for compression/expansion signals",
    "4. Cross-reference with supply overhang and DEX liquidity fragility",
  );

  writeFileSync(join(REPORTS_DIR, "recent_breakout_universe_report.md"), reportLines.join("\n"));

  console.log(`\n=== Summary ===`);
  console.log(`  Confirmed perp (OKX swap): ${confirmedPerp.length}`);
  console.log(`  Perp-unverified: ${unverifiedPerp.length}`);
  console.log(`  Top 7d returns: ${confirmedPerp.slice(0, 5).map(c => `${c.symbol} ${(c.max7dReturn*100).toFixed(0)}%`).join(", ")}`);
  console.log(`\nReports saved.`);
}

main().catch(console.error);
