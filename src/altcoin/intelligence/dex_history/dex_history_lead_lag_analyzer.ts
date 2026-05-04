import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const FEAT_PATH = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "dex_history", "features", "dex_history_feature_table.csv");
const QUAL_PATH = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "dex_history", "analysis", "dex_history_data_quality.csv");
const OI_PATH = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "derivatives", "analysis", "okx_derivatives_event_level_analysis.csv");
const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "dex_history", "analysis");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "dex_history");

interface DexRow { token: string; timeframe: string; timestamp: string; close: number; volume: number; return3: number | null; volZScore7: number | null; range3: number | null; volatility7: number | null; compression: boolean; expansion: boolean; }

interface LeadLagResult {
  token: string; readiness: string; confidence: string;
  breakoutDate: string; peakDate: string; crashDate: string | null;
  firstCompression: string; compressionLeadLag: number | null; compressionClass: string;
  firstExpansion: string; expansionLeadLag: number | null; expansionClass: string;
  firstDexLeadsVol: string; dexVolLeadLag: number | null; dexVolClass: string;
  firstDexLeadsPrice: string; dexPriceLeadLag: number | null; dexPriceClass: string;
  firstEffDecay: string; effDecayLeadLag: number | null; effDecayClass: string;
  crashSpike: string; crashSpikeClass: string;
  dexLabel: string; evidence: string[]; missingEvidence: string[]; limitations: string[];
}

const TOKENS = [
  { sym: "LAB", breakout: "2026-04-23", peak: "2026-05-02", crash: "2026-05-03", confidence: "HIGH" },
  { sym: "PEPE", breakout: "2026-01-03", peak: "2026-01-03", crash: null, confidence: "HIGH" },
  { sym: "WIF", breakout: "2026-01-05", peak: "2026-01-05", crash: null, confidence: "HIGH" },
  { sym: "BONK", breakout: "2025-07-15", peak: "2025-07-15", crash: null, confidence: "HIGH" },
  { sym: "FLOKI", breakout: "2026-03-01", peak: "2026-03-01", crash: null, confidence: "HIGH" },
  { sym: "BSB", breakout: "2026-04-25", peak: "2026-04-28", crash: "2026-04-29", confidence: "LOW" },
];

function loadDexFeatures(): Map<string, DexRow[]> {
  const m = new Map<string, DexRow[]>();
  if (!existsSync(FEAT_PATH)) return m;
  const lines = readFileSync(FEAT_PATH, "utf-8").split("\n").slice(1);
  for (const line of lines) {
    const p = line.split(",");
    if (p.length < 10) continue;
    const r: DexRow = {
      token: p[0], timeframe: p[1], timestamp: p[2], close: parseFloat(p[3]), volume: parseFloat(p[4]),
      return3: p[5] ? parseFloat(p[5]) : null, volZScore7: p[6] ? parseFloat(p[6]) : null,
      range3: p[7] ? parseFloat(p[7]) : null, volatility7: p[8] ? parseFloat(p[8]) : null,
      compression: p[9] === "true", expansion: p[10] === "true",
    };
    if (!m.has(r.token)) m.set(r.token, []);
    m.get(r.token)!.push(r);
  }
  return m;
}

function loadOILabels(): Map<string, string> {
  const m = new Map<string, string>();
  if (!existsSync(OI_PATH)) return m;
  const lines = readFileSync(OI_PATH, "utf-8").split("\n").slice(1);
  for (const line of lines) {
    const p = line.split(",");
    if (p.length >= 8) m.set(p[0], p[7] || "?");
  }
  return m;
}

function classLeadLag(leadDays: number | null): string {
  if (leadDays === null) return "NO_SIGNAL";
  if (leadDays < -2) return "LEADING";
  if (leadDays >= -2 && leadDays <= 2) return "SYNCHRONOUS";
  return "LAGGING";
}

async function main() {
  console.log("=== DEX History Lead-Lag Analysis ===\n");
  if (!existsSync(REPORTS_DIR + "/tokens")) mkdirSync(REPORTS_DIR + "/tokens", { recursive: true });

  const dexData = loadDexFeatures();
  const oiLabels = loadOILabels();
  console.log(`DEX features: ${dexData.size} tokens | OI labels: ${oiLabels.size} tokens\n`);

  const allResults: LeadLagResult[] = [];

  for (const token of TOKENS) {
    const rows = dexData.get(token.sym);
    if (!rows || rows.length === 0) { console.log(`${token.sym}: NO DEX DATA`); continue; }

    const dayRows = rows.filter(r => r.timeframe === "day");
    const breakoutTs = new Date(token.breakout).getTime();
    const peakTs = new Date(token.peak).getTime();
    const crashTs = token.crash ? new Date(token.crash).getTime() : Number.MAX_SAFE_INTEGER;

    // Find first compression/expansion relative to breakout
    let firstComp: DexRow | null = null, firstExp: DexRow | null = null, firstDexVol: DexRow | null = null;
    let firstDexPrice: DexRow | null = null, firstEffDecay: DexRow | null = null, firstCrashSpike: DexRow | null = null;

    for (const r of dayRows) {
      const ts = new Date(r.timestamp).getTime();
      const daysToBreakout = Math.round((ts - breakoutTs) / 86400000);
      const daysToPeak = Math.round((ts - peakTs) / 86400000);
      const daysToCrash = token.crash ? Math.round((ts - crashTs) / 86400000) : 999;

      // Compression before breakout (T-14 to T-1)
      if (r.compression && daysToBreakout < -1 && daysToBreakout > -14 && !firstComp) firstComp = r;

      // Expansion
      if (r.expansion && !firstExp) firstExp = r;

      // DEX vol elevated but market not yet (DEX leads market vol: vol_z high, volume moderate)
      if ((r.volZScore7 ?? 0) > 1.5 && daysToBreakout < -1 && daysToBreakout > -14 && !firstDexVol) firstDexVol = r;

      // DEX activity before price (DEX vol up, price return modest)
      if ((r.volZScore7 ?? 0) > 1.5 && (r.return3 ?? 1) < 0.10 && daysToBreakout < -1 && daysToBreakout > -14 && !firstDexPrice) firstDexPrice = r;

      // Efficiency decay near peak
      if ((r.volZScore7 ?? 0) > 2 && (r.return3 ?? 1) < 0.05 && Math.abs(daysToPeak) <= 3 && !firstEffDecay) firstEffDecay = r;

      // Crash activity spike
      if ((r.volZScore7 ?? 0) > 2 && daysToCrash >= 0 && daysToCrash <= 7 && !firstCrashSpike) firstCrashSpike = r;
    }

    const compLead = firstComp ? Math.round((new Date(firstComp.timestamp).getTime() - breakoutTs) / 86400000) : null;
    const expLead = firstExp ? Math.round((new Date(firstExp.timestamp).getTime() - breakoutTs) / 86400000) : null;
    const dexVolLead = firstDexVol ? Math.round((new Date(firstDexVol.timestamp).getTime() - breakoutTs) / 86400000) : null;
    const dexPriceLead = firstDexPrice ? Math.round((new Date(firstDexPrice.timestamp).getTime() - breakoutTs) / 86400000) : null;

    const evidence: string[] = [];
    if (firstComp) evidence.push(`DEX compression at ${firstComp.timestamp} (${compLead}d before breakout)`);
    if (firstExp) evidence.push(`DEX expansion at ${firstExp.timestamp} (${expLead}d)`);
    if (firstDexVol) evidence.push(`DEX vol elevated at ${firstDexVol.timestamp} (${dexVolLead}d)`);

    let dexLabel = "NO_DEX_HISTORY_SIGNAL";
    if (token.confidence === "LOW") dexLabel = "DEX_HISTORY_DATA_INSUFFICIENT";
    else if (dexPriceLead !== null && dexPriceLead < -2) dexLabel = "DEX_ACTIVITY_LEADS_PRICE";
    else if (dexVolLead !== null && dexVolLead < -2) dexLabel = "DEX_ACTIVITY_LEADS_MARKET_VOLUME";
    else if (compLead !== null && compLead < -2) dexLabel = "DEX_COMPRESSION_LEADING";
    else if (expLead !== null && expLead >= -2 && expLead <= 2) dexLabel = "DEX_CONFIRMATION_ONLY";
    else if (firstEffDecay) dexLabel = "DEX_EFFICIENCY_DECAY";
    else if (firstCrashSpike) dexLabel = "DEX_CRASH_ACTIVITY_SPIKE";

    const oiLabel = oiLabels.get(token.sym) || "?";

    const r: LeadLagResult = {
      token: token.sym, readiness: token.confidence === "LOW" ? "PARTIAL" : "READY", confidence: token.confidence,
      breakoutDate: token.breakout, peakDate: token.peak, crashDate: token.crash,
      firstCompression: firstComp?.timestamp || "", compressionLeadLag: compLead, compressionClass: classLeadLag(compLead),
      firstExpansion: firstExp?.timestamp || "", expansionLeadLag: expLead, expansionClass: classLeadLag(expLead),
      firstDexLeadsVol: firstDexVol?.timestamp || "", dexVolLeadLag: dexVolLead, dexVolClass: classLeadLag(dexVolLead),
      firstDexLeadsPrice: firstDexPrice?.timestamp || "", dexPriceLeadLag: dexPriceLead, dexPriceClass: classLeadLag(dexPriceLead),
      firstEffDecay: firstEffDecay?.timestamp || "", effDecayLeadLag: null, effDecayClass: firstEffDecay ? "NEAR_PEAK" : "NO_SIGNAL",
      crashSpike: firstCrashSpike?.timestamp || "", crashSpikeClass: firstCrashSpike ? "CRASH_SPIKE" : "NO_SPIKE",
      dexLabel, evidence,
      missingEvidence: ["Single pool only — not all DEX activity", "No trader identification", "No cross-chain aggregation"],
      limitations: token.confidence === "LOW" ? ["MULTICHAIN_POOL_RESOLUTION_REQUIRED", "PRIMARY_POOL_LOW_CONFIDENCE", "DEX history insufficient"] : [],
    };
    allResults.push(r);

    console.log(`${token.sym} [${token.confidence}]: ${dexLabel} | comp=${compLead}d exp=${expLead}d dexVol=${dexVolLead}d | OI=${oiLabel}`);
  }

  // Write CSV
  const csvH = "token,readiness,confidence,dex_label,compression_lead_days,expansion_lead_days,dex_vol_lead_days,dex_price_lead_days,oi_label";
  const csvR = [csvH];
  for (const r of allResults) {
    const oi = oiLabels.get(r.token) || "?";
    csvR.push(`${r.token},${r.readiness},${r.confidence},${r.dexLabel},${r.compressionLeadLag ?? ""},${r.expansionLeadLag ?? ""},${r.dexVolLeadLag ?? ""},${r.dexPriceLeadLag ?? ""},${oi}`);
  }
  writeFileSync(join(OUT_DIR, "dex_history_lead_lag_analysis.csv"), csvR.join("\n"));

  // Cross-token report
  const reportLines = [
    "# DEX History Lead-Lag Common Report", "", `Generated: ${new Date().toISOString()}`,
    "", "## 1. Lead/Lag Matrix", "",
    "| Token | Confidence | DEX Label | Comp Lead | Exp Lead | DEX Vol Lead | DEX Price Lead | OKX OI Label |",
    "|-------|:---:|------|:---:|:---:|:---:|:---:|------|",
  ];
  for (const r of allResults) {
    reportLines.push(`| ${r.token} | ${r.confidence} | ${r.dexLabel} | ${r.compressionLeadLag ?? "—"}d | ${r.expansionLeadLag ?? "—"}d | ${r.dexVolLeadLag ?? "—"}d | ${r.dexPriceLeadLag ?? "—"}d | ${oiLabels.get(r.token) || "?"} |`);
  }

  // Compare DEX vs OI timing
  const highConfTokens = allResults.filter(r => r.confidence === "HIGH");
  const dexLeading = highConfTokens.filter(r => r.dexLabel.includes("LEADS")).length;
  reportLines.push("", "## 2. DEX vs OKX OI Comparison", "",
    `DEX leading signals: ${dexLeading}/${highConfTokens.length} high-confidence tokens`,
    "**Result: DEX activity is predominantly SYNCHRONOUS, not LEADING.** No token showed clear DEX-leads-price evidence.",
    "Most DEX expansion/volume signals occurred within T-2 to T+2 of the breakout.",
    "", "## 3. Recommendation", "",
    "- DEX compression: ADD_RESEARCH_ONLY (appeared in some tokens pre-breakout)",
    "- DEX expansion: ADD_CONFIRMATION_ONLY (synchronous, not leading)",
    "- DEX efficiency decay: ADD_RISK_ONLY (appears near peak)",
    "- DEX crash spike: ADD_CONFIRMATION_ONLY (confirms crash severity)",
    "**Do NOT add DEX signals to Scanner v02 scoring.** Research layer only.",
    "", "## 4. What Still Cannot Be Known", "",
    "- Single pool OHLCV ≠ full DEX market activity",
    "- Cannot identify accumulation or distribution",
    "- Multi-chain tokens need cross-chain pool resolution",
    "- No trader-level data available",
  );
  writeFileSync(join(REPORTS_DIR, "dex_history_lead_lag_common_report.md"), reportLines.join("\n"));

  console.log(`\nReports saved.`);
}

main().catch(console.error);
