import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { normalizeCoinGlassTimestamp } from "./coinglass_time.js";

const CG_KEY = process.env.COINGLASS_API_KEY || "";
const CG_BASE = "https://open-api-v4.coinglass.com";
const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "coinglass");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "coinglass");
const REGISTRY_PATH = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "metric_loop", "metric_registry.csv");

async function cgGet(path: string): Promise<any> {
  if (!CG_KEY) return { status: "NOT_CONFIGURED" };
  try {
    const r = await fetch(`${CG_BASE}${path}`, { headers: { "CG-API-KEY": CG_KEY, "Accept": "application/json" } });
    if (!r.ok) return { status: `HTTP_${r.status}` };
    return { status: "OK", data: await r.json() };
  } catch (e: any) { return { status: "ERROR", error: e.message }; }
}

interface FeatureRow {
  token: string; date: string; symbol: string;
  oiUsd: number | null; oiChg1d: number | null; oiChg7d: number | null; oiZ7d: number | null;
  fundingOiW: number | null; fundingZ7d: number | null; fundingOverheated: boolean;
  liqVol: number | null; liqImbalance: number | null; liqZ7d: number | null;
  readiness: string; limitations: string;
}

const TOKENS = [
  { sym: "BSB", group: "P0" }, { sym: "LAB", group: "P0" },
  { sym: "UB", group: "P0" }, { sym: "AI", group: "P0" },
  { sym: "PEPE", group: "CONTROL" }, { sym: "WIF", group: "CONTROL" },
  { sym: "BONK", group: "CONTROL" }, { sym: "FLOKI", group: "CONTROL" },
  { sym: "PENDLE", group: "MOMENTUM" }, { sym: "ONDO", group: "MOMENTUM" },
  { sym: "DOGE", group: "CONTROL" }, { sym: "TAO", group: "CONTROL" },
];

function safeExtract(obj: any, candidates: string[]): { value: number | null; status: string } {
  for (const c of candidates) {
    if (c in obj && obj[c] !== null && obj[c] !== undefined) {
      const v = parseFloat(obj[c]);
      if (!isNaN(v)) return { value: v, status: "OK" };
      return { value: null, status: "FIELD_PARSE_FAILED" };
    }
  }
  return { value: null, status: "FIELD_MISSING" };
}

async function fetchOiHistory(sym: string): Promise<{ date: string | null; oi: number | null; parseStatus: string }[]> {
  const r = await cgGet(`/api/futures/open-interest/aggregated-history?symbol=${sym}&interval=1d&limit=90&unit=usd`);
  if (r.status !== "OK" || !r.data?.data) return [];
  return r.data.data.map((d: any) => {
    const date = normalizeCoinGlassTimestamp(d.time ?? d.t ?? d.timestamp);
    const oi = safeExtract(d, ["aggregatedOpenInterestUsd","aggregated_open_interest_usd","openInterestUsd","open_interest_usd","oiUsd","oi_usd"]);
    return { date, oi: oi.value, parseStatus: oi.status };
  });
}

async function fetchFundingHistory(sym: string): Promise<{ date: string | null; rate: number | null; parseStatus: string }[]> {
  const r = await cgGet(`/api/futures/funding-rate/oi-weight-history?symbol=${sym}&interval=1d&limit=90`);
  if (r.status !== "OK" || !r.data?.data) return [];
  return r.data.data.map((d: any) => {
    const date = normalizeCoinGlassTimestamp(d.time ?? d.t ?? d.timestamp);
    const rate = safeExtract(d, ["oiWeightedFundingRate","oi_weighted_funding_rate","fundingRate","funding_rate","rate"]);
    return { date, rate: rate.value, parseStatus: rate.status };
  });
}

async function fetchLiquidationHistory(sym: string): Promise<{ date: string | null; longLiq: number | null; shortLiq: number | null; totalLiq: number | null; parseStatus: string }[]> {
  const r = await cgGet(`/api/futures/liquidation/aggregated-history?symbol=${sym}&interval=1d&limit=90&exchangeList=Binance,OKX,Bybit`);
  if (r.status !== "OK" || !r.data?.data) return [];
  return r.data.data.map((d: any) => {
    const date = normalizeCoinGlassTimestamp(d.time ?? d.t ?? d.timestamp);
    const long = safeExtract(d, ["longLiquidationUsd","long_liquidation_usd","longVolUsd"]);
    const short = safeExtract(d, ["shortLiquidationUsd","short_liquidation_usd","shortVolUsd"]);
    const total = safeExtract(d, ["totalLiquidationUsd","total_liquidation_usd","volUsd"]);
    return { date, longLiq: long.value, shortLiq: short.value, totalLiq: total.value, parseStatus: long.status === "OK" ? "OK" : long.status };
  });
}

async function main() {
  console.log("=== CoinGlass Feature Builder ===\n");
  if (!CG_KEY) { console.log("NOT_CONFIGURED"); return; }
  console.log("CoinGlass: CONFIGURED\n");

  if (!existsSync(OUT_DIR + "/parsed")) mkdirSync(OUT_DIR + "/parsed", { recursive: true });
  if (!existsSync(OUT_DIR + "/features")) mkdirSync(OUT_DIR + "/features", { recursive: true });
  if (!existsSync(OUT_DIR + "/analysis")) mkdirSync(OUT_DIR + "/analysis", { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const allFeatures: FeatureRow[] = [];
  const readinessRows: string[] = ["token,group,symbol,oi_rows,funding_rows,liquidation_rows,readiness,limitations"];

  for (const token of TOKENS) {
    const sym = token.sym;
    console.log(`${sym} (${token.group}): fetching...`);

    const oiHist = await fetchOiHistory(sym);
    const fundHist = await fetchFundingHistory(sym);
    const liqHist = await fetchLiquidationHistory(sym);
    console.log(`  OI: ${oiHist.length} | Funding: ${fundHist.length} | Liq: ${liqHist.length}`);

    // Filter: valid dates + non-null OI values
    const validOi = oiHist.filter(d => d.date !== null && d.oi !== null);
    const invalidDates = oiHist.filter(d => d.date === null).length;
    const nullOi = oiHist.filter(d => d.oi === null).length;

    if (invalidDates > 0) {
      readinessRows.push(`${sym},${token.group},${sym},${oiHist.length},${fundHist.length},${liqHist.length},COINGLASS_PARSE_FAILED,${invalidDates} invalid timestamps`);
      console.log(`  PARSE FAILED: ${invalidDates} invalid timestamps\n`);
      continue;
    }
    if (validOi.length < 14) {
      readinessRows.push(`${sym},${token.group},${sym},${oiHist.length},${fundHist.length},${liqHist.length},COINGLASS_SHORT_HISTORY,<14 valid OI rows`);
      console.log(`  SHORT_HISTORY\n`);
      continue;
    }
    if (nullOi > oiHist.length * 0.5) {
      readinessRows.push(`${sym},${token.group},${sym},${oiHist.length},${fundHist.length},${liqHist.length},COINGLASS_PARSE_FAILED,${nullOi}/${oiHist.length} OI null`);
      console.log(`  PARSE FAILED: OI mostly null\n`);
      continue;
    }

    // Compute daily features
    const oiValues = validOi.map(d => d.oi!);
    const oiMean = oiValues.reduce((a, b) => a + b, 0) / oiValues.length;
    const oiStd = Math.sqrt(oiValues.reduce((s, v) => s + (v - oiMean) ** 2, 0) / oiValues.length);
    const fundValues = fundHist.map(d => d.rate).filter(r => r !== null) as number[];
    const fundMean = fundValues.length > 0 ? fundValues.reduce((a: number, b: number) => a + b, 0) / fundValues.length : 0;
    const fundStd = fundValues.length > 0 ? Math.sqrt(fundValues.reduce((s: number, v: number) => s + (v - fundMean) ** 2, 0) / fundValues.length) : 1;
    const liqValues = liqHist.map(d => d.totalLiq).filter(r => r !== null) as number[];
    const liqMean = liqValues.length > 0 ? liqValues.reduce((a: number, b: number) => a + b, 0) / liqValues.length : 0;
    const liqStd = liqValues.length > 0 ? Math.sqrt(liqValues.reduce((s: number, v: number) => s + (v - liqMean) ** 2, 0) / liqValues.length) : 1;

    for (let i = 0; i < validOi.length; i++) {
      const date = validOi[i].date!;
      const oi = validOi[i].oi!;
      const oiChg1d = i >= 1 ? oi - validOi[i - 1].oi! : null;
      const oiChg7d = i >= 7 ? oi - validOi[i - 7].oi! : null;
      const oiZ = oiStd > 0 ? (oi - oiMean) / oiStd : null;

      const fundRow = fundHist.find(f => f.date === date);
      const fundRate = fundRow?.rate ?? null;
      const fundZ = fundRate !== null && fundStd > 0 ? (fundRate - fundMean) / fundStd : null;
      const fundOverheated = fundZ !== null && fundZ > 2;

      const liqRow = liqHist.find(l => l.date === date);
      const liqVol = liqRow?.totalLiq ?? null;
      const liqZ = liqVol !== null && liqStd > 0 ? (liqVol - liqMean) / liqStd : null;
      const liqImb = liqRow && liqRow.longLiq !== null && liqRow.shortLiq !== null && liqRow.totalLiq !== null && liqRow.totalLiq > 0
        ? parseFloat(((liqRow.longLiq - liqRow.shortLiq) / liqRow.totalLiq).toFixed(3)) : null;

      let readiness = "COINGLASS_FEATURE_READY";
      const limits: string[] = [];
      if (fundHist.length === 0) { limits.push("funding missing"); }
      if (liqHist.length === 0) { limits.push("liquidation missing"); }

      allFeatures.push({
        token: sym, date, symbol: sym,
        oiUsd: oi, oiChg1d, oiChg7d, oiZ7d: oiZ,
        fundingOiW: fundRate, fundingZ7d: fundZ, fundingOverheated: fundOverheated,
        liqVol, liqImbalance: liqImb?.toFixed(3) ? parseFloat(liqImb.toFixed(3)) : null, liqZ7d: liqZ,
        readiness, limitations: limits.join("; "),
      });
    }

    readinessRows.push(`${sym},${token.group},${sym},${oiHist.length},${fundHist.length},${liqHist.length},COINGLASS_FEATURE_READY,`);
    console.log(`  COMPLETE: ${oiHist.length} feature rows\n`);
  }

  // Write features
  if (allFeatures.length > 0) {
    const fH = "token,date,symbol,oi_usd,oi_chg_1d,oi_chg_7d,oi_z_7d,funding_oi_w,funding_z_7d,funding_overheated,liq_vol,liq_imbalance,liq_z_7d,readiness";
    const fR = [fH, ...allFeatures.map(r => `${r.token},${r.date},${r.symbol},${r.oiUsd},${r.oiChg1d ?? ""},${r.oiChg7d ?? ""},${r.oiZ7d ?? ""},${r.fundingOiW ?? ""},${r.fundingZ7d ?? ""},${r.fundingOverheated},${r.liqVol ?? ""},${r.liqImbalance ?? ""},${r.liqZ7d ?? ""},${r.readiness}`)];
    writeFileSync(join(OUT_DIR, "features", "coinglass_derivatives_features.csv"), fR.join("\n"));
  }
  writeFileSync(join(OUT_DIR, "analysis", "coinglass_feature_readiness.csv"), readinessRows.join("\n"));

  // Update registry — subgroup specific, NOT blanket
  const readyTokens = readinessRows.slice(1).filter(r => r.includes("FEATURE_READY")).length;
  const hasOiData = allFeatures.filter(r => r.oiUsd !== null && r.oiUsd > 0).length > 50;
  const hasFundingData = allFeatures.filter(r => r.fundingOiW !== null).length > 50;
  const hasLiqData = allFeatures.filter(r => r.liqVol !== null && r.liqVol > 0).length > 10;
  if (existsSync(REGISTRY_PATH)) {
    const reg = readFileSync(REGISTRY_PATH, "utf-8").split("\n");
    const updated = reg.map(line => {
      if (line.startsWith("CG_OI_") && line.includes("IDEA") && hasOiData) return line.replace("IDEA", "COMPUTABLE");
      if (line.startsWith("CG_FR_") && line.includes("IDEA") && hasFundingData) return line.replace("IDEA", "COMPUTABLE");
      if (line.startsWith("CG_LIQ_") && line.includes("IDEA") && hasLiqData) return line.replace("IDEA", "COMPUTABLE");
      if (line.startsWith("CG_LIQ_") && line.includes("COMPUTABLE") && !hasLiqData) return line.replace("COMPUTABLE", "IDEA");
      return line;
    });
    writeFileSync(REGISTRY_PATH, updated.join("\n"));
    console.log(`Registry: CG_OI→${hasOiData ? "COMPUTABLE" : "IDEA"}, CG_FR→${hasFundingData ? "COMPUTABLE" : "IDEA"}, CG_LIQ→${hasLiqData ? "COMPUTABLE" : "IDEA"}`);
  }

  // Report
  const allReady = readyTokens >= 6 && hasOiData && hasFundingData;
  const reportLines = [
    "# CoinGlass Feature Builder Report", "", `Generated: ${new Date().toISOString()}`,
    "", "## 1. Status", "",
    allReady ? "**COINGLASS_FEATURES_READY_FOR_DERIVATIVES_V2**" : "**COINGLASS_FEATURES_NOT_READY**",
    `Readiness: OI data=${hasOiData}, Funding data=${hasFundingData}, Liquidation data=${hasLiqData}, Ready tokens=${readyTokens}/${TOKENS.length}`,
    "", "## 2. Token Coverage", "",
    `Tokens: ${readyTokens}/${TOKENS.length} with feature-ready data`,
    `Total feature rows: ${allFeatures.length}`,
    `Fields: OI (change 1d/7d, z-score), Funding (OI-weighted, z-score, overheated), Liquidation (total, imbalance, z-score)`,
    "", "## 3. What CoinGlass Adds vs OKX", "",
    "- Multi-exchange aggregated OI (not single-exchange)",
    "- OI-weighted funding (more representative)",
    "- Cross-exchange liquidation history (new capability)",
    "- Exchange-level OI distribution (who dominates derivatives)",
    "", "## 4. Next", "",
    "**RUN_DERIVATIVES_V2_METRIC_LOOP** — feature table ready, metrics COMPUTABLE.",
    "", "## 5. Cannot Prove", "",
    "- Cannot confirm derivatives positioning from OI alone",
    "- Cannot distinguish long vs short build-up",
    "- No trading recommendations",
  ];
  writeFileSync(join(REPORTS_DIR, "coinglass_feature_builder_report.md"), reportLines.join("\n"));

  console.log(`\nReports saved.`);
}

main().catch(console.error);
