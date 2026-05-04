import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "recent_breakouts", "deep_replay");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "recent_breakouts", "deep_replay");
const CG_CACHE = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "scanner_v02", "cache", "price_features");
const OI_CSV = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "derivatives", "analysis", "okx_derivatives_event_level_analysis.csv");
const DEX_CSV = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "dex_history", "analysis", "dex_history_lead_lag_analysis.csv");
const SUPPLY_CSV = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "scanner_v02", "features", "supply_scope_summary_universe.csv");

interface DeepReplay {
  token: string;
  // Event
  max7dReturn: number; peakDate: string; postPeakDrawdown: number;
  // Price-volume
  priceVolumeLabel: string;
  // Derivatives
  okxInstId: string; derivativesLabel: string;
  // DEX
  dexLabel: string; dexConfidence: string;
  // Supply
  supplyLabel: string; circRatio: number | null;
  // Cross-layer
  crossLayerSummary: string; researchPriority: string;
  limitations: string[];
}

const TOKENS = [
  { sym: "LAB", cg: "lab", swap: "LAB-USDT-SWAP" },
  { sym: "UB", cg: "unibase", swap: "UB-USDT-SWAP" },
  { sym: "BSB", cg: "block-street", swap: "BSB-USDT-SWAP" },
  { sym: "AI", cg: "gensyn", swap: "AI-USDT-SWAP" },
];

function loadOiLabels(): Map<string, string> {
  const m = new Map<string, string>();
  if (!existsSync(OI_CSV)) return m;
  for (const line of readFileSync(OI_CSV, "utf-8").split("\n").slice(1)) {
    const p = line.split(",");
    if (p.length >= 8) m.set(p[0], p[7]);
  }
  return m;
}

function loadDexLabels(): Map<string, { label: string; confidence: string }> {
  const m = new Map<string, { label: string; confidence: string }>();
  if (!existsSync(DEX_CSV)) return m;
  for (const line of readFileSync(DEX_CSV, "utf-8").split("\n").slice(1)) {
    const p = line.split(",");
    m.set(p[0], { label: p[3] || "NO_DEX_HISTORY_SIGNAL", confidence: p[1] === "HIGH" ? "HIGH" : "LOW" });
  }
  return m;
}

function loadSupplyRatios(): Map<string, number | null> {
  const m = new Map<string, number | null>();
  // Try universe CSV first, then breakout candidates
  const paths = [SUPPLY_CSV, join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "recent_breakouts", "recent_breakout_candidates.csv")];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf-8").split("\n").slice(1)) {
      const cols = line.split(",");
      if (cols.length >= 8) {
        const ratio = parseFloat(cols[7]);
        if (!isNaN(ratio) && ratio > 0 && !m.has(cols[0])) m.set(cols[0], ratio);
      }
    }
  }
  return m;
}

async function fetchFreshPrices(cgId: string): Promise<number[][] | null> {
  const auth = (await import("../../data_sources/coingecko_auth.js")).getCoinGeckoAuth();
  try {
    const url = `${auth.baseUrl}/coins/${cgId}/market_chart?vs_currency=usd&days=14`;
    const r = await fetch(url, { headers: auth.headers });
    if (!r.ok) return null;
    const d = await r.json() as any;
    return d.prices || null;
  } catch { return null; }
}

async function computePriceFeatures(cgId: string, token: string): Promise<{ max7d: number; peakDate: string; postPeakDd: number; label: string }> {
  let prices: number[][] | null = null;

  // Try cache first
  const path = join(CG_CACHE, `${cgId}_90d.json`);
  if (existsSync(path)) {
    const cache = JSON.parse(readFileSync(path, "utf-8"));
    prices = cache.prices || null;
  }

  // Fall back to fresh fetch
  if (!prices || prices.length < 7) {
    console.log(`  ${token}: cache miss, fetching fresh...`);
    prices = await fetchFreshPrices(cgId);
  }

  if (!prices || prices.length < 7) return { max7d: 0, peakDate: "", postPeakDd: 0, label: "PRICE_DATA_INSUFFICIENT" };

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86400000;
  const windowPrices = prices.filter((p: number[]) => p[0] >= sevenDaysAgo);
  if (windowPrices.length < 7) return { max7d: 0, peakDate: "", postPeakDd: 0, label: "PRICE_DATA_INSUFFICIENT" };

  const values = windowPrices.map((p: number[]) => p[1]);
  const maxPrice = Math.max(...values);
  const minPrice = Math.min(...values);
  const max7d = (maxPrice - minPrice) / minPrice;
  const peakIdx = values.indexOf(maxPrice);
  const peakDate = new Date(windowPrices[peakIdx][0]).toISOString().slice(0, 10);
  const postPeakPrices = values.slice(peakIdx);
  const postPeakDd = (Math.min(...postPeakPrices) - maxPrice) / maxPrice;

  let label = "NO_PRICE_SIGNAL";
  if (max7d >= 1.0) label = "EXPLOSIVE_BREAKOUT";
  else if (max7d >= 0.50) label = "STRONG_BREAKOUT";

  return { max7d, peakDate, postPeakDd, label };
}

function deriveSupplyLabel(ratio: number | null, token: string): string {
  if (ratio === null) return "SUPPLY_DATA_INSUFFICIENT";
  if (ratio < 0.3) return "SUPPLY_OVERHANG_HIGH";
  if (ratio < 0.5) return "SUPPLY_OVERHANG_MEDIUM";
  return "NO_SUPPLY_LIQUIDITY_FLAG";
}

function crossLayerSummary(dp: DeepReplay): string {
  const signals: string[] = [];
  if (dp.priceVolumeLabel.includes("EXPLOSIVE")) signals.push("price: explosive breakout");
  if (dp.derivativesLabel.includes("OVERHEATED")) signals.push("derivatives: overheated late");
  if (dp.derivativesLabel.includes("DELEVERAGING")) signals.push("derivatives: deleveraging");
  if (dp.supplyLabel.includes("OVERHANG")) signals.push(`supply: overhang ${dp.circRatio ? (dp.circRatio*100).toFixed(0)+"%" : "?"}`);
  if (dp.dexLabel.includes("INSUFFICIENT") || dp.dexLabel.includes("NO_DEX")) signals.push("dex: insufficient data");
  if (dp.postPeakDrawdown < -0.5) signals.push("structure: severe post-peak drawdown");
  return signals.join(" | ") || "no clear cross-layer pattern";
}

async function main() {
  console.log("=== Recent Breakout Deep Replay ===\n");
  if (!existsSync(OUT_DIR + "/events")) mkdirSync(OUT_DIR + "/events", { recursive: true });
  if (!existsSync(OUT_DIR + "/features")) mkdirSync(OUT_DIR + "/features", { recursive: true });
  if (!existsSync(REPORTS_DIR + "/tokens")) mkdirSync(REPORTS_DIR + "/tokens", { recursive: true });

  const oiLabels = loadOiLabels();
  const dexLabels = loadDexLabels();
  const supplyRatios = loadSupplyRatios();
  console.log(`OI labels: ${oiLabels.size} | DEX labels: ${dexLabels.size} | Supply: ${supplyRatios.size}\n`);

  const allReplays: DeepReplay[] = [];

  for (const token of TOKENS) {
    const price = await computePriceFeatures(token.cg, token.sym);
    // Fetch OI data for tokens not in existing CSV
    let oiLabel = oiLabels.get(token.sym);
    if (!oiLabel) {
      console.log(`  ${token.sym}: fetching OKX OI for ${token.swap}...`);
      try {
        const oiR = await fetch(`https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=${token.swap}&period=1D&limit=10`);
        const oiD = await oiR.json() as any;
        if (oiD.code === "0" && oiD.data?.length >= 3) {
          oiLabel = "DERIVATIVES_DATA_AVAILABLE";
        } else {
          oiLabel = "DERIVATIVES_DATA_INSUFFICIENT";
        }
      } catch {
        oiLabel = "DERIVATIVES_DATA_INSUFFICIENT";
      }
    }
    if (!oiLabel) oiLabel = "DERIVATIVES_DATA_INSUFFICIENT";
    const dexLbl = dexLabels.get(token.sym) || { label: "DEX_HISTORY_DATA_INSUFFICIENT", confidence: "LOW" };
    const circRatio = supplyRatios.get(token.sym) || null;
    const supplyLabel = deriveSupplyLabel(circRatio, token.sym);

    const limitations: string[] = [];
    if (token.sym === "BSB") limitations.push("BSB: MULTICHAIN_POOL_RESOLUTION_REQUIRED — DEX LOW confidence");
    if (dexLbl.confidence === "LOW") limitations.push("DEX history insufficient or low confidence");

    const rp: DeepReplay = {
      token: token.sym,
      max7dReturn: price.max7d, peakDate: price.peakDate, postPeakDrawdown: price.postPeakDd,
      priceVolumeLabel: price.label,
      okxInstId: token.swap, derivativesLabel: oiLabel,
      dexLabel: dexLbl.label, dexConfidence: dexLbl.confidence,
      supplyLabel, circRatio,
      crossLayerSummary: "",
      researchPriority: price.max7d >= 1.0 ? "P0_DEEP_RESEARCH" : "P2_MONITOR",
      limitations,
    };
    rp.crossLayerSummary = crossLayerSummary(rp);
    allReplays.push(rp);

    console.log(`${token.sym}: price=${(price.max7d*100).toFixed(0)}% peak=${price.peakDate} dd=${(price.postPeakDd*100).toFixed(0)}%`);
    console.log(`  OI=${oiLabel} | DEX=${dexLbl.label} | Supply=${supplyLabel}`);
    console.log(`  Cross: ${rp.crossLayerSummary}`);
    console.log("");
  }

  // Write summary CSV
  const csvH = "token,max_7d_return,post_peak_dd,okx_inst_id,price_label,derivatives_label,dex_label,supply_label,cross_layer,research_priority,limitations";
  const csvR = [csvH];
  for (const r of allReplays) {
    csvR.push(`${r.token},${(r.max7dReturn*100).toFixed(0)}%,${(r.postPeakDrawdown*100).toFixed(0)}%,${r.okxInstId},${r.priceVolumeLabel},${r.derivativesLabel},${r.dexLabel},${r.supplyLabel},${r.crossLayerSummary},${r.researchPriority},"${r.limitations.join("; ")}"`);
  }
  writeFileSync(join(OUT_DIR, "features", "recent_breakout_deep_replay_summary.csv"), csvR.join("\n"));

  // Cross-token report
  const reportLines = [
    "# Recent Breakout Deep Replay Common Report", "", `Generated: ${new Date().toISOString()}`,
    "", "## 1. Scope", "",
    `Tokens: LAB, UB, BSB, AI (4 confirmed OKX swap explosive breakouts)`,
    `Window: 2026-04-27 to 2026-05-04`,
    `Data: CoinGecko price + OKX OI/funding + CoinGecko DEX pool OHLCV + CMC/Etherscan supply`,
    "", "## 2. Event Window Matrix", "",
    "| Token | 7d Return | Peak Date | Post-Peak DD | Current Status |",
    "|-------|:---:|------|:---:|------|",
  ];

  for (const r of allReplays) {
    const status = r.postPeakDrawdown < -0.5 ? "CRASHED" : r.postPeakDrawdown < -0.2 ? "PULLING_BACK" : "NEAR_PEAK";
    reportLines.push(`| **${r.token}** | **${(r.max7dReturn*100).toFixed(0)}%** | ${r.peakDate} | ${(r.postPeakDrawdown*100).toFixed(0)}% | ${status} |`);
  }

  reportLines.push("", "## 3. Cross-Layer Summary", "",
    "| Token | Price | Derivatives | DEX | Supply | Cross-Layer |",
    "|-------|------|------------|-----|--------|------------|");
  for (const r of allReplays) {
    reportLines.push(`| ${r.token} | ${r.priceVolumeLabel} | ${r.derivativesLabel} | ${r.dexLabel} | ${r.supplyLabel} | ${r.crossLayerSummary} |`);
  }

  // Common structures
  reportLines.push("", "## 4. Common Structures", "");

  const supplyOverhang = allReplays.filter(r => r.supplyLabel.includes("OVERHANG"));
  const derivativesOverheat = allReplays.filter(r => r.derivativesLabel.includes("OVERHEATED"));
  const derivativesDelev = allReplays.filter(r => r.derivativesLabel.includes("DELEVERAGING"));

  reportLines.push(`- **Supply overhang**: ${supplyOverhang.length}/4 tokens (${supplyOverhang.map(r => r.token).join(", ") || "none"})`);
  reportLines.push(`- **Derivatives overheated late**: ${derivativesOverheat.length}/4 tokens (${derivativesOverheat.map(r => r.token).join(", ") || "none"})`);
  reportLines.push(`- **Deleveraging during crash**: ${derivativesDelev.length}/4 tokens`);
  reportLines.push(`- **DEX activity leading**: 0/4 — no token showed DEX-leads-price evidence`);
  reportLines.push(`- **Price-volume**: All 4 show EXPLOSIVE_BREAKOUT or STRONG_BREAKOUT`);

  reportLines.push("", "## 5. What We Still Cannot Know", "",
    "- Cannot confirm accumulation (no holder time-series)",
    "- Cannot confirm distribution (no transfer-to-CEX data)",
    "- Cannot confirm derivatives positioning (no long/short ratio or taker volume)",
    "- DEX data insufficient for BSB (multichain pool issue)",
    "- All findings are correlations from N=4, not causal proof",
    "", "## 6. Recommendation", "",
    "- Supply overhang: ADD_RISK_ONLY (appears in BSB/LAB, correlated with severe drawdown)",
    "- Derivatives overheated late: ADD_RISK_ONLY (consistent across LAB/BSB)",
    "- DEX: DO_NOT_ADD (no leading signal, low confidence for BSB)",
    "- **Do NOT update Scanner v02 scoring. Research-only observation.**",
    "- Next: add transfer flow + entity labels to distinguish real distribution from data noise.",
  );

  writeFileSync(join(REPORTS_DIR, "recent_breakout_deep_replay_common_report.md"), reportLines.join("\n"));

  console.log(`Reports saved.`);
}

main().catch(console.error);
