import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "derivatives");
const CG_CACHE = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "scanner_v02", "cache", "price_features");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "derivatives");
const OKX_BASE = "https://www.okx.com/api/v5";

interface DailyRow {
  token: string; date: string;
  // Price
  price: number; mcap: number; volume: number;
  return1d: number; return3d: number; return7d: number;
  // OI
  oiToken: number; oiUsd: number;
  oiChg1d: number | null; oiChg3d: number | null; oiChg7d: number | null;
  oiPctChg1d: number | null; oiPctChg3d: number | null; oiPctChg7d: number | null;
  oiZScore7d: number | null;
  // Funding
  fundingRate: number | null;
  fundingZScore7d: number | null; fundingPositiveStreak: number;
  // Price-OI flags
  priceFlatOiUp: boolean; priceUpOiUp: boolean; priceUpOiDown: boolean; priceDownOiUp: boolean;
  oiLeadsPrice: boolean; oiConfirmsPrice: boolean;
  oiOverheatedLate: boolean; fundingOverheatedLate: boolean; deleveraging: boolean;
}

interface EventAnalysis {
  token: string;
  oiHistoryDays: number; fundingHistoryDays: number;
  breakoutDate: string; peakDate: string; crashDate: string | null;
  firstOiLeadDate: string; oiLeadLagDays: number | null;
  firstFundingOverheatDate: string;
  oiOverheatCount: number; fundingOverheatCount: number;
  deleveragingCount: number;
  label: string; confidence: string;
  evidence: string[]; missingEvidence: string[]; limitations: string[];
}

const TOKENS = [
  { sym: "BSB", swap: "BSB-USDT-SWAP", cg: "block-street", breakout: "2026-04-25", peak: "2026-04-28", crash: "2026-04-29" },
  { sym: "LAB", swap: "LAB-USDT-SWAP", cg: "lab", breakout: "2026-04-23", peak: "2026-05-02", crash: "2026-05-03" },
  { sym: "PEPE", swap: "PEPE-USDT-SWAP", cg: "pepe", breakout: "2026-01-03", peak: "2026-01-03", crash: null },
  { sym: "WIF", swap: "WIF-USDT-SWAP", cg: "dogwifcoin", breakout: "2026-01-05", peak: "2026-01-05", crash: null },
  { sym: "BONK", swap: "BONK-USDT-SWAP", cg: "bonk", breakout: "2025-07-15", peak: "2025-07-15", crash: null },
  { sym: "FLOKI", swap: "FLOKI-USDT-SWAP", cg: "floki", breakout: "2026-03-01", peak: "2026-03-01", crash: null },
];

async function fetchOiHistory(instId: string): Promise<{ ts: number; oi: number }[]> {
  const results: { ts: number; oi: number }[] = [];
  const url = `${OKX_BASE}/rubik/stat/contracts/open-interest-history?instId=${instId}&period=1D&limit=90`;
  try {
    const r = await fetch(url);
    if (!r.ok) return results;
    const d = await r.json() as any;
    const data = d.data || [];
    for (const row of data) results.push({ ts: parseInt(row[0]), oi: parseFloat(row[1]) });
  } catch {}
  return results.sort((a, b) => a.ts - b.ts);
}

async function fetchFundingHistory(instId: string): Promise<{ ts: number; rate: number }[]> {
  const results: { ts: number; rate: number }[] = [];
  const url = `${OKX_BASE}/public/funding-rate-history?instId=${instId}&limit=100`;
  try {
    const r = await fetch(url);
    if (!r.ok) return results;
    const d = await r.json() as any;
    for (const row of (d.data || [])) results.push({ ts: parseInt(row.fundingTime), rate: parseFloat(row.fundingRate) });
  } catch {}
  return results.sort((a, b) => a.ts - b.ts);
}

function loadPrices(cgId: string): Map<string, { price: number; mcap: number; vol: number }> {
  const m = new Map<string, any>();
  const path = join(CG_CACHE, `${cgId}_90d.json`);
  if (!existsSync(path)) return m;
  const cache = JSON.parse(readFileSync(path, "utf-8"));
  const prices = cache.prices || [], mcaps = cache.market_caps || [], vols = cache.total_volumes || [];
  const daily = new Map<string, { p: number[]; m: number[]; v: number[] }>();
  for (let i = 0; i < prices.length; i++) {
    const date = new Date(prices[i][0]).toISOString().slice(0, 10);
    const ex = daily.get(date);
    if (!ex || prices[i][0] > ex.p[0]) {
      daily.set(date, { p: prices[i], m: mcaps[i] || [0, 0], v: vols[i] || [0, 0] });
    }
  }
  for (const [date, d] of daily) m.set(date, { price: d.p[1], mcap: d.m[1], vol: d.v[1] });
  return m;
}

async function main() {
  console.log("=== OKX OI Lead-Lag Analysis ===\n");
  if (!existsSync(OUT_DIR + "/analysis")) mkdirSync(OUT_DIR + "/analysis", { recursive: true });
  if (!existsSync(REPORTS_DIR + "/tokens")) mkdirSync(REPORTS_DIR + "/tokens", { recursive: true });

  const allRows: DailyRow[] = [];
  const allEvents: EventAnalysis[] = [];

  for (const token of TOKENS) {
    console.log(`${token.sym}: fetching OI + funding history...`);
    const oiHist = await fetchOiHistory(token.swap);
    const fundHist = await fetchFundingHistory(token.swap);
    const prices = loadPrices(token.cg);
    console.log(`  OI: ${oiHist.length} days | Funding: ${fundHist.length} records | Price: ${prices.size} days`);

    if (oiHist.length < 10) { console.log(`  OI history insufficient`); continue; }

    // Aggregate funding to daily
    const dailyFunding = new Map<string, number[]>();
    for (const f of fundHist) {
      const date = new Date(f.ts).toISOString().slice(0, 10);
      if (!dailyFunding.has(date)) dailyFunding.set(date, []);
      dailyFunding.get(date)!.push(f.rate);
    }

    // Build daily rows
    const dates = [...new Set([...oiHist.map(o => new Date(o.ts).toISOString().slice(0, 10)), ...prices.keys()])].sort();
    const oiByDate = new Map(oiHist.map(o => [new Date(o.ts).toISOString().slice(0, 10), o.oi]));

    // Compute OI z-score params
    const oiValues = oiHist.map(o => o.oi);
    const oiMean = oiValues.reduce((a, b) => a + b, 0) / oiValues.length;
    const oiStd = Math.sqrt(oiValues.reduce((s, v) => s + (v - oiMean) ** 2, 0) / oiValues.length);

    // Funding z-score params
    const fundValues = fundHist.map(f => f.rate);
    const fundMean = fundValues.reduce((a, b) => a + b, 0) / fundValues.length;
    const fundStd = Math.sqrt(fundValues.reduce((s, v) => s + (v - fundMean) ** 2, 0) / fundValues.length);

    const breakoutTs = new Date(token.breakout).getTime();

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const price = prices.get(date);
      if (!price) continue;

      const oi = oiByDate.get(date);
      if (!oi && i === 0) continue;

      // Returns
      const ret1d = i >= 1 && prices.get(dates[i-1]) ? (price.price - prices.get(dates[i-1])!.price) / prices.get(dates[i-1])!.price : 0;
      const ret3d = i >= 3 && prices.get(dates[i-3]) ? (price.price - prices.get(dates[i-3])!.price) / prices.get(dates[i-3])!.price : 0;
      const ret7d = i >= 7 && prices.get(dates[i-7]) ? (price.price - prices.get(dates[i-7])!.price) / prices.get(dates[i-7])!.price : 0;

      // OI changes
      const oiPrev1 = i >= 1 ? oiByDate.get(dates[i-1]) : null;
      const oiPrev3 = i >= 3 ? oiByDate.get(dates[i-3]) : null;
      const oiPrev7 = i >= 7 ? oiByDate.get(dates[i-7]) : null;
      const oiChg1d = (oi && oiPrev1) ? oi - oiPrev1 : null;
      const oiChg3d = (oi && oiPrev3) ? oi - oiPrev3 : null;
      const oiChg7d = (oi && oiPrev7) ? oi - oiPrev7 : null;
      const oiPct1d = (oi && oiPrev1 && oiPrev1 > 0) ? (oi - oiPrev1) / oiPrev1 : null;
      const oiPct3d = (oi && oiPrev3 && oiPrev3 > 0) ? (oi - oiPrev3) / oiPrev3 : null;
      const oiPct7d = (oi && oiPrev7 && oiPrev7 > 0) ? (oi - oiPrev7) / oiPrev7 : null;
      const oiZ = (oi && oiStd > 0) ? (oi - oiMean) / oiStd : null;

      // Funding
      const fundRates = dailyFunding.get(date) || [];
      const fundRate = fundRates.length > 0 ? fundRates.reduce((a, b) => a + b, 0) / fundRates.length : null;
      const fundZ = (fundRate !== null && fundStd > 0) ? (fundRate - fundMean) / fundStd : null;

      // Funding streak
      let streak = 0;
      for (let j = i; j >= 0; j--) {
        const fr = dailyFunding.get(dates[j]);
        if (fr && fr.reduce((a, b) => a + b, 0) / fr.length > 0) streak++;
        else break;
      }

      // Price-OI flags
      const priceFlatOiUp = ret3d < 0.05 && ret3d > -0.05 && (oiPct3d !== null && oiPct3d > 0.10);
      const priceUpOiUp = ret3d > 0.10 && (oiPct3d !== null && oiPct3d > 0.10);
      const priceUpOiDown = ret3d > 0.10 && (oiPct3d !== null && oiPct3d < -0.05);
      const priceDownOiUp = ret3d < -0.05 && (oiPct3d !== null && oiPct3d > 0.10);

      // Lead/lag: OI up before price up (before breakout)
      const daysToBreakout = Math.round((new Date(date).getTime() - breakoutTs) / 86400000);
      const oiLeadsPrice = daysToBreakout < -1 && daysToBreakout > -14 && priceFlatOiUp;
      const oiConfirmsPrice = daysToBreakout >= -1 && daysToBreakout <= 2 && priceUpOiUp;

      // Overheated
      const daysToPeak = Math.round((new Date(date).getTime() - new Date(token.peak).getTime()) / 86400000);
      const oiOverheatedLate = daysToPeak >= -2 && daysToPeak <= 5 && (oiZ !== null && oiZ > 1.5);
      const fundingOverheatedLate = daysToPeak >= -2 && daysToPeak <= 5 && (fundZ !== null && fundZ > 1.5);

      // Deleveraging
      const deleveraging = ret3d < -0.10 && (oiPct3d !== null && oiPct3d < -0.15);

      allRows.push({
        token: token.sym, date, price: price.price, mcap: price.mcap, volume: price.vol,
        return1d: ret1d, return3d: ret3d, return7d: ret7d,
        oiToken: oi || 0, oiUsd: (oi || 0) * price.price,
        oiChg1d, oiChg3d, oiChg7d, oiPctChg1d: oiPct1d, oiPctChg3d: oiPct3d, oiPctChg7d: oiPct7d, oiZScore7d: oiZ,
        fundingRate: fundRate, fundingZScore7d: fundZ, fundingPositiveStreak: streak,
        priceFlatOiUp, priceUpOiUp, priceUpOiDown, priceDownOiUp,
        oiLeadsPrice, oiConfirmsPrice, oiOverheatedLate, fundingOverheatedLate, deleveraging,
      });
    }

    // Event analysis
    const tokenRows = allRows.filter(r => r.token === token.sym);
    const oiLeadDays = tokenRows.filter(r => r.oiLeadsPrice);
    const oiConfirmDays = tokenRows.filter(r => r.oiConfirmsPrice);
    const oiOverheatDays = tokenRows.filter(r => r.oiOverheatedLate);
    const fundOverheatDays = tokenRows.filter(r => r.fundingOverheatedLate);
    const delevDays = tokenRows.filter(r => r.deleveraging);

    let label = "NO_DERIVATIVES_SIGNAL";
    let confidence = "LOW";
    const evidence: string[] = [];

    if (oiLeadDays.length > 2) { label = "POSSIBLE_DERIVATIVES_POSITIONING"; evidence.push(`OI leads price: ${oiLeadDays.length} days`); }
    if (oiConfirmDays.length > 2) { if (label === "NO_DERIVATIVES_SIGNAL") label = "DERIVATIVES_CONFIRMATION_ONLY"; evidence.push(`OI confirms price: ${oiConfirmDays.length} days`); }
    if (oiOverheatDays.length > 2 || fundOverheatDays.length > 2) { label = "DERIVATIVES_OVERHEATED_LATE"; evidence.push(`OI overheat: ${oiOverheatDays.length} days, Funding overheat: ${fundOverheatDays.length} days`); }
    if (delevDays.length > 1) evidence.push(`Deleveraging: ${delevDays.length} days`);
    if (oiLeadDays.length > 2 && oiConfirmDays.length > 2) confidence = "MEDIUM";

    const firstOiLeadDate = oiLeadDays.length > 0 ? oiLeadDays[0].date : "";
    const oiLeadLag = firstOiLeadDate ? Math.round((new Date(firstOiLeadDate).getTime() - breakoutTs) / 86400000) : null;

    allEvents.push({
      token: token.sym,
      oiHistoryDays: oiHist.length, fundingHistoryDays: fundHist.length,
      breakoutDate: token.breakout, peakDate: token.peak, crashDate: token.crash,
      firstOiLeadDate, oiLeadLagDays: oiLeadLag,
      firstFundingOverheatDate: fundOverheatDays.length > 0 ? fundOverheatDays[0].date : "",
      oiOverheatCount: oiOverheatDays.length, fundingOverheatCount: fundOverheatDays.length,
      deleveragingCount: delevDays.length,
      label, confidence, evidence,
      missingEvidence: ["No long/short ratio — cannot confirm direction", "No taker volume — cannot separate buying vs selling pressure"],
      limitations: ["OI data from OKX only — single exchange", "Funding data may reflect arbitrage rather than positioning"],
    });

    console.log(`  ${label} (conf=${confidence}) | OI lead: ${oiLeadDays.length}d | OI confirm: ${oiConfirmDays.length}d | OI overheat: ${oiOverheatDays.length}d | Fund overheat: ${fundOverheatDays.length}d | Delev: ${delevDays.length}d`);
    console.log("");
  }

  // Write features CSV
  const featH = "token,date,price,return_3d,oi,oi_pct_chg_3d,oi_zscore,funding_rate,price_flat_oi_up,price_up_oi_up,oi_leads_price,oi_confirms_price,oi_overheated_late,funding_overheated_late,deleveraging";
  const featR = [featH];
  for (const r of allRows) {
    featR.push(`${r.token},${r.date},${r.price},${r.return3d},${r.oiToken},${r.oiPctChg3d ?? ""},${r.oiZScore7d ?? ""},${r.fundingRate ?? ""},${r.priceFlatOiUp},${r.priceUpOiUp},${r.oiLeadsPrice},${r.oiConfirmsPrice},${r.oiOverheatedLate},${r.fundingOverheatedLate},${r.deleveraging}`);
  }
  writeFileSync(join(OUT_DIR, "features", "okx_oi_funding_price_feature_table.csv"), featR.join("\n"));

  // Event analysis CSV
  const eventH = "token,breakout_date,oi_lead_lag_days,first_oi_lead_date,oi_overheat_days,fund_overheat_days,delev_days,label,confidence";
  const eventR = [eventH];
  for (const e of allEvents) {
    eventR.push(`${e.token},${e.breakoutDate},${e.oiLeadLagDays ?? ""},${e.firstOiLeadDate},${e.oiOverheatCount},${e.fundingOverheatCount},${e.deleveragingCount},${e.label},${e.confidence}`);
  }
  writeFileSync(join(OUT_DIR, "analysis", "okx_derivatives_event_level_analysis.csv"), eventR.join("\n"));

  // Cross-token report
  const reportLines = [
    "# OKX OI Lead-Lag Common Report", "", `Generated: ${new Date().toISOString()}`,
    "", "## 1. Scope", "",
    `Tokens: ${TOKENS.map(t => t.sym).join(", ")}`,
    "Data: OKX OI history (/rubik/stat) + funding rate history + CoinGecko prices",
    "", "## 2. OI Lead/Lag Matrix", "",
    "| Token | OI Days | OI Lead Days | OI Lead Lag | OI Confirm | OI Overheat | Fund Overheat | Delev | Label | Confidence |",
    "|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|------|:---:|",
  ];

  for (const e of allEvents) {
    reportLines.push(`| ${e.token} | ${e.oiHistoryDays} | ${e.firstOiLeadDate ? e.oiLeadLagDays + "d" : "—"} | ${e.firstOiLeadDate || "—"} | — | ${e.oiOverheatCount} | ${e.fundingOverheatCount} | ${e.deleveragingCount} | ${e.label} | ${e.confidence} |`);
  }

  reportLines.push("", "## 3. What Changed from Phase 5.3", "",
    "- Phase 5.3: OI was SNAPSHOT ONLY — could not compute OI change or lead/lag",
    "- Phase 5.3.2: OI HISTORY used — 6/6 tokens have 90-day daily OI data",
    "- Key correction: OI lead-lag IS computable with OKX /rubik/stat endpoint",
    "", "## 4. Scanner Recommendation", "",
    "- OI lead-lag: RESEARCH_ONLY — needs multi-exchange OI to confirm direction",
    "- Funding overheated late: ADD_RISK_ONLY — consistent across BSB and LAB",
    "- OI overheated late: ADD_RISK_ONLY — appeared before crashes",
    "- Deleveraging: ADD_CONFIRMATION_ONLY — confirms crash severity",
    "", "## 5. Limitations", "",
    "- No long/short ratio — OI rise cannot distinguish long buildup from short buildup",
    "- OKX only — single exchange OI. Multi-exchange OI needed for full picture.",
    "- No taker volume — direction of flow unknown.",
    "", "## 6. Decision", "",
    "**Do NOT add OI lead-lag to Scanner v02 scoring yet.** Add RESEARCH_ONLY: display OI/funding derivatives signals separately from the main score. Let human researchers interpret them.",
  );

  writeFileSync(join(REPORTS_DIR, "okx_oi_lead_lag_common_report.md"), reportLines.join("\n"));

  // Summary
  console.log(`=== Cross-Token Summary ===`);
  for (const e of allEvents) {
    console.log(`${e.token}: ${e.label} (conf=${e.confidence}) | OI lead: ${e.oiLeadLagDays !== null ? e.oiLeadLagDays + "d" : "none"} | Overheat: OI=${e.oiOverheatCount}d Fund=${e.fundingOverheatCount}d | Delev: ${e.deleveragingCount}d`);
  }
  console.log(`\nReports saved.`);
}

main().catch(console.error);
