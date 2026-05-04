import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const FEATURES_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_v02", "features");
const REGISTRY_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_v02", "registry");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "reports", "altcoin", "scanner_v02");
const CG_FEATURES = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_validation", "features", "scanner_feature_table.csv");
const PRICE_FEATURES_PATH = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_v02", "features", "price_volume_features_universe.csv");

import { computeIdentityQuality, computeFeatureCoverage, overallDataQuality, dataQualityLabel } from "./data_quality_score.js";

type Label = "STRUCTURAL_RISK_HIGH" | "WATCH_RISK_HIGH" | "WATCH_RISK" | "WATCH" | "NEED_MORE_DATA" | "INSUFFICIENT_DEEP_DATA" | "NO_CURRENT_FLAG" | "RESEARCH_ONLY";

interface RegistryRow { symbol: string; name: string; category: string; coingecko_id: string; cmc_id: string; primary_chain: string; contract_address: string; is_multichain: string; dex_enabled: string; supply_enabled: string; manual_confirmation_required: string; }

interface DexRow { token: string; totalDexLiquidityUsd: number; totalDexVolume24h: number; totalBuys24h: number; totalSells24h: number; tokenLevelBuySellRatio: number | null; tokenLevelDexTurnover: number | null; liquidityConcentrationScore: number | null; pairCount: number; }

interface SupplyRow { token: string; supply_scope: string; confidence: string; circulating_to_cmc_total_ratio: number | null; circulating_to_single_chain_ratio: number | null; }

interface UniverseScore {
  token: string; category: string;
  label: Label; score: number; confidence: string;
  dataQualityScore: number; identityQualityScore: number; featureCoverageScore: number;
  supplyScore: number; dexLiqScore: number; dexTurnoverScore: number; buySellScore: number;
  relativeStrengthScore: number;
  supplyScope: string; dqLabel: string;
  totalDexLiquidityUsd: number | null; tokenLevelDexTurnover: number | null;
  buySellRatio: number | null;
  triggeredRules: string[]; disabledRules: string[];
  missingRequiredData: string[]; limitations: string[];
}

function loadRegistry(): RegistryRow[] {
  const p = join(REGISTRY_DIR, "token_metadata_registry.csv");
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, "utf-8").split("\n");
  const headers = lines[0].split(",");
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(",");
    const r: any = {};
    headers.forEach((h, j) => r[h.trim()] = vals[j]?.trim() || "");
    rows.push(r as RegistryRow);
  }
  return rows;
}

function loadDex(): Map<string, DexRow> {
  const m = new Map<string, DexRow>();
  let p = join(FEATURES_DIR, "dex_token_level_features_universe.csv");
  if (!existsSync(p)) p = join(FEATURES_DIR, "dex_token_level_features.csv");
  if (!existsSync(p)) return m;
  const lines = readFileSync(p, "utf-8").split("\n");
  const rawHeaders = lines[0].split(",").map(h => h.trim());
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(",");
    const r: any = {};
    rawHeaders.forEach((h, j) => { const v = vals[j]?.trim(); r[h] = v === "" ? null : (isNaN(+v) ? v : +v); });
    // Normalize: pairs_count or pair_count
    r.tokenLevelDexTurnover = r.tokenLevelDexTurnover ?? r.token_level_dex_turnover ?? null;
    r.tokenLevelBuySellRatio = r.tokenLevelBuySellRatio ?? r.token_level_buy_sell_ratio ?? null;
    r.totalDexLiquidityUsd = r.totalDexLiquidityUsd ?? r.total_dex_liquidity_usd ?? 0;
    r.totalDexVolume24h = r.totalDexVolume24h ?? r.total_dex_volume_24h ?? 0;
    r.totalBuys24h = r.totalBuys24h ?? r.total_buys_24h ?? 0;
    r.totalSells24h = r.totalSells24h ?? r.total_sells_24h ?? 0;
    r.liquidityConcentrationScore = r.liquidityConcentrationScore ?? r.primary_pair_liquidity_share ?? null;
    r.pairCount = r.pairCount ?? r.pair_count ?? 0;
    if (!r.token) continue;
    m.set(r.token, r as DexRow);
  }
  return m;
}

function loadSupply(): Map<string, SupplyRow> {
  const m = new Map<string, SupplyRow>();
  let p = join(FEATURES_DIR, "supply_scope_summary_universe.csv");
  if (!existsSync(p)) p = join(FEATURES_DIR, "supply_scope_summary.csv");
  if (!existsSync(p)) return m;
  const lines = readFileSync(p, "utf-8").split("\n");
  const rawHeaders = lines[0].split(",").map(h => h.trim());
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(",");
    const r: any = {};
    rawHeaders.forEach((h, j) => { const v = vals[j]?.trim(); r[h] = v === "" ? null : (isNaN(+v) ? v : +v); });
    // Normalize field names
    r.circulating_to_cmc_total_ratio = r.circulating_to_cmc_total_ratio ?? r.circulating_to_cmc_total_supply_ratio ?? null;
    r.circulating_to_single_chain_ratio = r.circulating_to_single_chain_ratio ?? r.circulating_to_onchain_supply_ratio ?? null;
    r.supply_scope = r.supply_scope ?? "INSUFFICIENT_SUPPLY_SCOPE";
    r.confidence = r.confidence ?? r.supply_confidence ?? "LOW";
    if (!r.token) continue;
    m.set(r.token, r as SupplyRow);
  }
  return m;
}

function loadCgFeatures(): Map<string, { price_return_3d: number; price_return_7d: number; volume_zscore_7d: number }> {
  const m = new Map<string, any>();
  if (!existsSync(CG_FEATURES)) return m;
  const lines = readFileSync(CG_FEATURES, "utf-8").split("\n");
  const headers = lines[0].split(",");
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(",");
    const r: any = {};
    headers.forEach((h, j) => { const v = vals[j]?.trim(); r[h.trim()] = v === "" ? null : (isNaN(+v) ? v : +v); });
    // Get latest row per symbol
    const key = r.symbol;
    const existing = m.get(key);
    if (!existing || (r.date > existing.date)) m.set(key, r);
  }
  return m;
}

function loadPriceFeatures(): Map<string, any> {
  const m = new Map<string, any>();
  if (!existsSync(PRICE_FEATURES_PATH)) {
    // Fall back to old CG features
    if (existsSync(CG_FEATURES)) {
      const lines = readFileSync(CG_FEATURES, "utf-8").split("\n");
      const headers = lines[0].split(",");
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const vals = lines[i].split(",");
        const r: any = {};
        headers.forEach((h, j) => { const v = vals[j]?.trim(); r[h.trim()] = v === "" ? null : (isNaN(+v) ? v : +v); });
        const key = r.symbol;
        const existing = m.get(key);
        if (!existing || (r.date && r.date > existing.date)) m.set(key, r);
      }
    }
    return m;
  }
  const lines = readFileSync(PRICE_FEATURES_PATH, "utf-8").split("\n");
  const headers = lines[0].split(",");
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(",");
    const r: any = {};
    headers.forEach((h, j) => { const v = vals[j]?.trim(); r[h.trim()] = v === "" ? null : (isNaN(+v) ? v : +v); });
    m.set(r.token, r);
  }
  return m;
}

function scoreOne(reg: RegistryRow, dex: DexRow | undefined, supply: SupplyRow | undefined, cg: any): UniverseScore {
  const missing: string[] = [];
  const disabled: string[] = [];
  const triggered: string[] = [];
  const limitations: string[] = [];

  if (!reg.cmc_id) { missing.push("cmc_id"); disabled.push("P0_SUPPLY_OVERHANG (no CMC ID)"); }
  if (!reg.contract_address || reg.contract_address.length < 5) { missing.push("contract_address"); disabled.push("P0_ONCHAIN_SUPPLY (no contract)"); }
  if (!dex || dex.totalDexLiquidityUsd === 0) { missing.push("dex_data"); disabled.push("P0_DEX_LIQUIDITY (no DEX data)"); }

  // New: identity + feature coverage split
  const idQuality = computeIdentityQuality({
    coingecko_id: reg.coingecko_id, cmc_id: reg.cmc_id, symbol: reg.symbol,
    primary_chain: reg.primary_chain, contract_address: reg.contract_address,
    manual_confirmation_required: reg.manual_confirmation_required,
  });

  const isNative = ["BTC", "ETH", "SOL", "DOGE", "TAO", "SEI", "SUI", "TIA"].includes(reg.symbol);
  const hasDex = dex !== undefined && dex.totalDexLiquidityUsd > 0;
  const hasSupply = supply !== undefined && supply.supply_scope !== "INSUFFICIENT_SUPPLY_SCOPE" && supply.supply_scope !== "CMC_ONLY";
  const supplyIsNative = supply?.supply_scope === "NATIVE_ASSET_SUPPLY_MODEL";

  // For native assets: DEX not required for coverage, supply model is well-understood
  const effectiveDexCoverage = isNative ? true : hasDex;
  const effectiveSupplyCoverage = isNative ? true : hasSupply;
  const hasPrice = cg !== undefined && cg.price_return_3d !== undefined && cg.price_return_3d !== null;
  const hasCmcSupply = supply !== undefined && supply.circulating_to_cmc_total_ratio !== null;
  const hasBuySell = dex !== undefined && dex.tokenLevelBuySellRatio !== null;

  const featCoverage = computeFeatureCoverage({ hasPriceFeatures: hasPrice, hasDexAggregation: effectiveDexCoverage, hasSupplyScope: effectiveSupplyCoverage, hasCmcSupply, hasBuySellTxns: hasBuySell || isNative });
  const dq = overallDataQuality(idQuality.score, featCoverage.score);
  const dqLabel = dataQualityLabel(idQuality.score, featCoverage.score);

  // ── Supply score ──
  let supplyScore = 0;
  if (supply && reg.cmc_id && supply.circulating_to_cmc_total_ratio !== null && supply.circulating_to_cmc_total_ratio > 0 && supply.circulating_to_cmc_total_ratio < 0.3) {
    const mult = supply.supply_scope === "MULTICHAIN_PARTIAL" ? 0.7 : supply.supply_scope === "SINGLE_CHAIN_ONLY" ? 0.5 : 1.0;
    supplyScore = Math.round(20 * mult);
    triggered.push("SUPPLY_OVERHANG");
    limitations.push(`Supply overhang: circ/total ${(supply.circulating_to_cmc_total_ratio*100).toFixed(0)}%. Scope: ${supply.supply_scope}.`);
  }

  // ── DEX scores ── (skip for native assets)
  let dexLiqScore = 0, dexTurnoverScore = 0, buySellScore = 0;
  if (dex && !isNative) {
    if (dex.totalDexLiquidityUsd < 50000) { dexLiqScore = 15; triggered.push("DEX_LIQUIDITY_CRITICAL"); }
    else if (dex.totalDexLiquidityUsd < 100000) { dexLiqScore = 10; triggered.push("DEX_LIQUIDITY_LOW"); }
    if (dex.tokenLevelDexTurnover !== null && dex.tokenLevelDexTurnover > 25) { dexTurnoverScore = 15; triggered.push("DEX_TURNOVER_EXTREME"); }
    else if (dex.tokenLevelDexTurnover !== null && dex.tokenLevelDexTurnover > 10) { dexTurnoverScore = 10; triggered.push("DEX_TURNOVER_HIGH"); }
    if (dex.tokenLevelBuySellRatio !== null && dex.tokenLevelBuySellRatio < 0.7) { buySellScore = 10; triggered.push("DEX_SELL_PRESSURE"); }
  }

  // ── Relative strength ──
  let rsScore = 0;
  if (cg && cg.price_return_3d > 0.25 && cg.volume_zscore_7d > 1.0 && cg.volume_zscore_7d < 2.0) {
    rsScore = 20; triggered.push("EARLY_RELATIVE_STRENGTH");
    limitations.push(`Strong 3d return (${(cg.price_return_3d*100).toFixed(0)}%) with moderate volume (z=${cg.volume_zscore_7d?.toFixed(1)}).`);
  }

  const totalScore = supplyScore + dexLiqScore + dexTurnoverScore + buySellScore + rsScore;

  // ── Label ──
  let label: Label; let confidence = supply?.confidence || "MEDIUM";

  if (dqLabel === "NEED_MORE_DATA") {
    label = "NEED_MORE_DATA";
    limitations.push(`Identity data missing: ${idQuality.missing.join(", ")}`);
  } else if (dqLabel === "INSUFFICIENT_DEEP_DATA") {
    label = "INSUFFICIENT_DEEP_DATA" as Label;
    limitations.push(`Feature coverage insufficient (${(featCoverage.score*100).toFixed(0)}%). Missing: ${featCoverage.missing.join(", ")}.`);
  } else if (totalScore >= 60 && dq >= 0.6) {
    label = "STRUCTURAL_RISK_HIGH";
  } else if (totalScore >= 40) {
    label = "WATCH_RISK_HIGH";
  } else if (totalScore >= 25) {
    label = "WATCH_RISK";
  } else if (totalScore >= 10) {
    label = "WATCH";
  } else {
    label = "NO_CURRENT_FLAG";
  }

  return {
    token: reg.symbol, category: reg.category, label, score: totalScore,
    confidence, dataQualityScore: dq,
    identityQualityScore: idQuality.score, featureCoverageScore: featCoverage.score,
    dqLabel,
    supplyScore, dexLiqScore, dexTurnoverScore, buySellScore, relativeStrengthScore: rsScore,
    supplyScope: supply?.supply_scope || "INSUFFICIENT_SUPPLY_SCOPE",
    totalDexLiquidityUsd: dex?.totalDexLiquidityUsd || null,
    tokenLevelDexTurnover: dex?.tokenLevelDexTurnover || null,
    buySellRatio: dex?.tokenLevelBuySellRatio || null,
    triggeredRules: triggered, disabledRules: disabled,
    missingRequiredData: missing, limitations,
  };
}

async function main() {
  console.log("=== Scanner Universe Scoring (28 tokens) ===\n");
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const registry = loadRegistry();
  const dexMap = loadDex();
  const supplyMap = loadSupply();
  const priceMap = loadPriceFeatures();
  const cgMap = loadCgFeatures();
  // Merge: priceMap has priority, cgMap as fallback
  // CG features from old pipeline have more coverage; priceMap from new cache supplements
  const mergedPriceMap = new Map(cgMap);
  for (const [k, v] of priceMap) { if (!mergedPriceMap.has(k) || (v && v.data_points_count > 2)) mergedPriceMap.set(k, v); }
  console.log(`Registry: ${registry.length} | DEX: ${dexMap.size} | Supply: ${supplyMap.size} | Price: ${mergedPriceMap.size}\n`);

  const scores: UniverseScore[] = [];
  for (const reg of registry) {
    const s = scoreOne(reg, dexMap.get(reg.symbol), supplyMap.get(reg.symbol), mergedPriceMap.get(reg.symbol));
    scores.push(s);
    const icon = s.label.startsWith("STRUCTURAL") ? "🔴" : s.label.startsWith("WATCH_RISK") ? "⚠️" : s.label === "WATCH" ? "👁" : s.label === "NO_CURRENT_FLAG" ? "—" : "?";
    console.log(`${icon} ${s.token} [${s.label}] score=${s.score} dq=${s.dataQualityScore} supply=${s.supplyScore} dexLiq=${s.dexLiqScore} dexTurn=${s.dexTurnoverScore} buySell=${s.buySellScore} rs=${s.relativeStrengthScore}`);
  }

  // Stats
  const byLabel: Record<string, UniverseScore[]> = {};
  const byCat: Record<string, UniverseScore[]> = {};
  for (const s of scores) {
    (byLabel[s.label] = byLabel[s.label] || []).push(s);
    (byCat[s.category] = byCat[s.category] || []).push(s);
  }

  // Save scores CSV
  const csvH = "token,category,label,score,confidence,data_quality_score,supply_score,dex_liq_score,dex_turnover_score,buy_sell_score,relative_strength_score,supply_scope,total_dex_liquidity_usd,token_level_dex_turnover,buy_sell_ratio,triggered_rules,disabled_rules,missing_required_data";
  const csvR = [csvH, ...scores.map(s => `${s.token},${s.category},${s.label},${s.score},${s.confidence},${s.dataQualityScore},${s.supplyScore},${s.dexLiqScore},${s.dexTurnoverScore},${s.buySellScore},${s.relativeStrengthScore},${s.supplyScope},${s.totalDexLiquidityUsd ?? ""},${s.tokenLevelDexTurnover ?? ""},${s.buySellRatio ?? ""},"${s.triggeredRules.join(";")}","${s.disabledRules.join(";")}","${s.missingRequiredData.join(";")}"`)];
  writeFileSync(join(FEATURES_DIR, "scanner_v02_universe_scores.csv"), csvR.join("\n"));

  // Generate universe report
  const report: string[] = [
    "# Scanner Universe Report", "", `Generated: ${new Date().toISOString()}`, `Tokens: ${scores.length}`,
    "", "## 1. Summary",
    `| Label | Count |`, `|-------|:---:|`,
  ];
  const allLabels = ["STRUCTURAL_RISK_HIGH", "WATCH_RISK_HIGH", "WATCH_RISK", "WATCH", "NEED_MORE_DATA", "INSUFFICIENT_DEEP_DATA", "NO_CURRENT_FLAG", "RESEARCH_ONLY"];
  for (const l of allLabels) report.push(`| ${l} | ${(byLabel[l] || []).length} |`);
  report.push("", "## 2. Results by Label", "");
  for (const l of allLabels) {
    const tokens = byLabel[l] || [];
    if (tokens.length === 0) continue;
    report.push(`### ${l} (${tokens.length})`, "");
    for (const s of tokens) report.push(`- **${s.token}** (${s.category}): score=${s.score}, dq=${s.dataQualityScore}. ${s.limitations[0] || s.triggeredRules.join(",") || "No flags triggered."}`);
    report.push("");
  }
  report.push("## 3. Results by Category", "");
  for (const [cat, tokens] of Object.entries(byCat)) {
    const avgScore = Math.round(tokens.reduce((a, s) => a + s.score, 0) / tokens.length);
    const avgDq = (tokens.reduce((a, s) => a + s.dataQualityScore, 0) / tokens.length).toFixed(2);
    report.push(`- **${cat}** (${tokens.length}): avg score=${avgScore}, avg dq=${avgDq}`);
  }
  report.push("", "## 4. Data Quality Matrix", "",
    "| Token | CG ID | CMC ID | Contract | DEX Pairs | Supply | DQ Score |",
    "|-------|:---:|:---:|:---:|:---:|:---:|:---:|");
  for (const s of scores) {
    const reg = registry.find(r => r.symbol === s.token)!;
    report.push(`| ${s.token} | ${reg.coingecko_id ? "✅" : "❌"} | ${reg.cmc_id ? "✅" : "❌"} | ${reg.contract_address.length > 5 ? "✅" : "❌"} | ${s.totalDexLiquidityUsd ? "✅" : "❌"} | ${s.supplyScope !== "INSUFFICIENT_SUPPLY_SCOPE" ? "✅" : "❌"} | ${s.dataQualityScore} |`);
  }
  // ── Research Layers (READ-ONLY, unified) ──
  const { loadAllResearchLayers } = await import("../intelligence/research_layers/research_layer_signal.js");
  const researchSignals = loadAllResearchLayers();
  if (researchSignals.length > 0) {
    report.push("", "## 6. Research Layers (READ-ONLY)", "",
      "**Research layers do NOT affect the main score or label. These are observational signals, not trading recommendations.**",
      "", "| Token | Layer | Label | Confidence | Key Evidence | Limitations |",
      "|-------|-------|------|:---:|------|------|");
    for (const s of researchSignals) {
      report.push(`| ${s.token} | ${s.layer} | ${s.label} | ${s.confidence} | ${s.evidence.slice(0, 2).join("; ")} | ${s.limitations[0] || "—"} |`);
    }
    report.push("", "**Interpretation:** Research signals are proxy indicators. They do NOT confirm whale positioning, accumulation, or distribution. OKX is single-exchange. No long/short or taker volume data available.");
  }
  report.push("", "## 5. Scanner Status", "",
    "**LIMITED_SNAPSHOT_SCANNER**",
    "", `- ${scores.length} tokens scored. DEX: ${dexMap.size}. Supply: ${supplyMap.size}.`,
    "- No historical DEX/supply tracking. No on-chain holder data. No social data.",
    "", "## 7. Disclaimer", "", "RESEARCH ONLY. No trading recommendations. Labels are risk indicators, not predictions.");

  writeFileSync(join(REPORTS_DIR, "scanner_universe_report.md"), report.join("\n"));

  // Daily snapshot
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const daily: string[] = [
    "# Daily Altcoin Snapshot Scanner Report", "", `Generated: ${new Date().toISOString()}`,
    "", "## Summary",
    `| Tokens scanned | ${scores.length} |`,
    `| STRUCTURAL_RISK_HIGH | ${(byLabel["STRUCTURAL_RISK_HIGH"] || []).length} |`,
    `| WATCH_RISK / WATCH_RISK_HIGH | ${(byLabel["WATCH_RISK"] || []).length + (byLabel["WATCH_RISK_HIGH"] || []).length} |`,
    `| WATCH | ${(byLabel["WATCH"] || []).length} |`,
    `| NEED_MORE_DATA | ${(byLabel["NEED_MORE_DATA"] || []).length} |`,
    `| NO_CURRENT_FLAG | ${(byLabel["NO_CURRENT_FLAG"] || []).length} |`,
    "", "## Disclaimer", "", "This is research-only. No trading recommendation. Labels are risk indicators, not predictions.",
  ];
  writeFileSync(join(REPORTS_DIR, `daily_snapshot_report_${today}.md`), daily.join("\n"));

  // Console summary
  console.log(`\n=== Summary ===`);
  for (const l of allLabels) console.log(`  ${l}: ${(byLabel[l] || []).length}`);
  console.log(`\nReports saved.`);
}

main().catch(console.error);
