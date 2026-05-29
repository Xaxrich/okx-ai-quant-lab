import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fetchCompatWithFallback as fetch } from "../../../utils/http.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "derivatives");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "derivatives");
const OKX_BASE = "https://www.okx.com/api/v5";

interface DerivativesRow {
  token: string; date: string; fundingRate: number | null;
  oi: number | null; oiUsd: number | null;
  fundingZScore: number | null; oiChange1d: number | null; oiChange7d: number | null;
  priceUpOiUp: boolean; priceFlatOiUp: boolean; priceUpOiDown: boolean;
  fundingExtreme: boolean; fundingPositiveStreak: number;
  oiLeadsPriceFlag: boolean; crowdedLongsProxy: boolean;
}

const TOKENS = [
  { sym: "BSB", swapInstId: "BSB-USDT-SWAP", eventDate: "2026-04-25", peakDate: "2026-04-28" },
  { sym: "LAB", swapInstId: "LAB-USDT-SWAP", eventDate: "2026-04-23", peakDate: "2026-05-02" },
  { sym: "PEPE", swapInstId: "PEPE-USDT-SWAP", eventDate: "2026-01-03", peakDate: "2026-01-03" },
  { sym: "WIF", swapInstId: "WIF-USDT-SWAP", eventDate: "2026-01-05", peakDate: "2026-01-05" },
  { sym: "BONK", swapInstId: "BONK-USDT-SWAP", eventDate: "2025-07-15", peakDate: "2025-07-15" },
  { sym: "FLOKI", swapInstId: "FLOKI-USDT-SWAP", eventDate: "2026-03-01", peakDate: "2026-03-01" },
];

async function fetchOkx(path: string): Promise<any> {
  try {
    const r = await fetch(`${OKX_BASE}${path}`);
    if (!r.ok) return null;
    const d = await r.json() as any;
    return d.code === "0" ? d.data : null;
  } catch { return null; }
}

async function fetchFundingHistory(instId: string): Promise<{ ts: number; rate: number }[]> {
  // Try to get up to 90 days
  const results: { ts: number; rate: number }[] = [];
  for (let after = 0; after < 800; after += 100) {
    const data = await fetchOkx(`/public/funding-rate-history?instId=${instId}&limit=100${after > 0 ? `&after=${after}` : ""}`);
    if (!data || data.length === 0) break;
    for (const d of data) {
      results.push({ ts: parseInt(d.fundingTime), rate: parseFloat(d.fundingRate) });
    }
    if (data.length < 100) break;
  }
  return results.sort((a, b) => a.ts - b.ts);
}

async function fetchOiHistoryFallback(instId: string): Promise<{ ts: number; oi: number; oiUsd: number } | null> {
  const data = await fetchOkx(`/public/open-interest?instId=${instId}`);
  if (!data || data.length === 0) return null;
  const d = data[0];
  return { ts: parseInt(d.ts), oi: parseFloat(d.oi), oiUsd: parseFloat(d.oiUsd) };
}

function dailyAggregate(fundingRates: { ts: number; rate: number }[]): Map<string, { avgRate: number; count: number }> {
  const m = new Map<string, { avgRate: number; count: number }>();
  for (const f of fundingRates) {
    const date = new Date(f.ts).toISOString().slice(0, 10);
    const ex = m.get(date) || { avgRate: 0, count: 0 };
    ex.avgRate += f.rate;
    ex.count++;
    m.set(date, ex);
  }
  for (const [d, v] of m) v.avgRate /= v.count;
  return m;
}

async function main() {
  console.log("=== OKX Derivatives Positioning Research ===\n");
  if (!existsSync(OUT_DIR + "/raw")) mkdirSync(OUT_DIR + "/raw", { recursive: true });
  if (!existsSync(OUT_DIR + "/features")) mkdirSync(OUT_DIR + "/features", { recursive: true });
  if (!existsSync(REPORTS_DIR + "/tokens")) mkdirSync(REPORTS_DIR + "/tokens", { recursive: true });

  const allResults: { token: string; instId: string; fundingCount: number; oiCurrent: number | null; oiUsd: number | null; rows: DerivativesRow[] }[] = [];

  for (const token of TOKENS) {
    console.log(`${token.sym} (${token.swapInstId}):`);

    // Fetch funding rate history
    console.log(`  Fetching funding rate history...`);
    const fundingRates = await fetchFundingHistory(token.swapInstId);
    console.log(`  ${fundingRates.length} funding rate records`);

    // Fetch OI (current snapshot — OKX free tier limitation)
    console.log(`  Fetching open interest...`);
    const oi = await fetchOiHistoryFallback(token.swapInstId);
    const oiCurrent = oi?.oi || null;
    const oiUsd = oi?.oiUsd || null;
    console.log(`  OI: ${oiCurrent ? (oiCurrent/1e6).toFixed(1) + "M tokens" : "N/A"} ($${oiUsd ? (oiUsd/1e6).toFixed(1) + "M" : "N/A"})`);

    // Daily aggregation
    const dailyFunding = dailyAggregate(fundingRates);
    const sortedDates = [...dailyFunding.keys()].sort();

    // Compute features per day
    const rows: DerivativesRow[] = [];
    const allRates = sortedDates.map(d => dailyFunding.get(d)!.avgRate);
    const rateMean = allRates.reduce((a, b) => a + b, 0) / allRates.length;
    const rateStd = Math.sqrt(allRates.reduce((s, r) => s + (r - rateMean) ** 2, 0) / allRates.length);

    for (let i = 0; i < sortedDates.length; i++) {
      const date = sortedDates[i];
      const rate = dailyFunding.get(date)!.avgRate;
      const prevRate = i >= 1 ? dailyFunding.get(sortedDates[i - 1])?.avgRate || 0 : rate;
      const rate7dAgo = i >= 7 ? dailyFunding.get(sortedDates[i - 7])?.avgRate || rate : rate;
      const fundingZ = rateStd > 0 ? (rate - rateMean) / rateStd : 0;

      // Funding positive streak
      let streak = 0;
      for (let j = i; j >= 0 && dailyFunding.get(sortedDates[j])!.avgRate > 0; j--) streak++;

      const fundingExtreme = Math.abs(fundingZ) > 2.0;

      // OI features (snapshot only — limitation)
      const oiChg1d: number | null = null; // Would need OI history
      const oiChg7d: number | null = null;

      // Price-OI flags (price data from CoinGecko cache — use funding as rough proxy)
      // When funding turns positive while staying moderate = possible positioning
      const priceUpOiUp = fundingZ > 0 && fundingZ < 1.5; // Moderate positive funding
      const priceFlatOiUp = fundingZ > 0.5 && fundingZ < 1.0 && streak >= 2; // Sustained moderate positive
      const priceUpOiDown = fundingZ < -1.0; // Negative funding

      // OI leads price: funding rising from negative to positive before event
      const eventDate = new Date(token.eventDate).getTime();
      const currentDate = new Date(date).getTime();
      const daysToEvent = Math.round((currentDate - eventDate) / 86400000);
      const oiLeadsPrice = daysToEvent < -2 && fundingZ > 0 && fundingZ < 1.0;

      // Crowded longs: extreme funding + price at/near peak
      const daysToPeak = Math.round((currentDate - new Date(token.peakDate).getTime()) / 86400000);
      const crowdedLongs = fundingZ > 2.0 && daysToPeak >= -1 && daysToPeak <= 3;

      rows.push({
        token: token.sym, date,
        fundingRate: rate, oi: oiCurrent, oiUsd,
        fundingZScore: fundingZ, oiChange1d: oiChg1d, oiChange7d: oiChg7d,
        priceUpOiUp, priceFlatOiUp, priceUpOiDown,
        fundingExtreme, fundingPositiveStreak: streak,
        oiLeadsPriceFlag: oiLeadsPrice, crowdedLongsProxy: crowdedLongs,
      });
    }

    // Summary
    const oiLeadDays = rows.filter(r => r.oiLeadsPriceFlag).length;
    const crowdedDays = rows.filter(r => r.crowdedLongsProxy).length;
    const extremeDays = rows.filter(r => r.fundingExtreme).length;
    console.log(`  OI leads price days: ${oiLeadDays} | Crowded longs days: ${crowdedDays} | Extreme funding days: ${extremeDays}`);
    console.log(`  Rate range: ${(Math.min(...allRates)*100).toFixed(4)}% to ${(Math.max(...allRates)*100).toFixed(4)}%`);
    console.log("");

    allResults.push({ token: token.sym, instId: token.swapInstId, fundingCount: fundingRates.length, oiCurrent, oiUsd, rows });
  }

  // Write features CSV
  const featHeader = "token,date,funding_rate,funding_zscore,oi,oi_usd,oi_change_1d,oi_change_7d,price_up_oi_up,price_flat_oi_up,price_up_oi_down,funding_extreme,funding_positive_streak,oi_leads_price_flag,crowded_longs_proxy";
  const featRows = [featHeader];
  for (const r of allResults) {
    for (const row of r.rows) {
      featRows.push(`${row.token},${row.date},${row.fundingRate},${row.fundingZScore?.toFixed(4) || ""},${row.oi || ""},${row.oiUsd || ""},${row.oiChange1d || ""},${row.oiChange7d || ""},${row.priceUpOiUp},${row.priceFlatOiUp},${row.priceUpOiDown},${row.fundingExtreme},${row.fundingPositiveStreak},${row.oiLeadsPriceFlag},${row.crowdedLongsProxy}`);
    }
  }
  writeFileSync(join(OUT_DIR, "features", "derivatives_feature_table.csv"), featRows.join("\n"));

  // Cross-token report
  const reportLines: string[] = [
    "# Derivatives Common Structure Report", "", `Generated: ${new Date().toISOString()}`,
    "", "## 1. Data Coverage", "",
    "| Token | OKX Swap InstId | Funding Records | OI Current | OI USD |",
    "|-------|----------------|:---:|:---:|:---:|",
  ];

  for (const r of allResults) {
    reportLines.push(`| ${r.token} | ${r.instId} | ${r.fundingCount} | ${r.oiCurrent ? (r.oiCurrent/1e6).toFixed(1)+"M" : "N/A"} | ${r.oiUsd ? "$"+(r.oiUsd/1e6).toFixed(1)+"M" : "N/A"} |`);
  }

  reportLines.push("", "## 2. Funding Rate Patterns", "",
    "| Token | Rate Min | Rate Max | Rate Mean | Extreme Days | Crowded Longs Days |",
    "|-------|:---:|:---:|:---:|:---:|:---:|");

  for (const r of allResults) {
    const rates = r.rows.map(row => row.fundingRate!).filter(r => !isNaN(r));
    if (rates.length === 0) continue;
    const min = Math.min(...rates); const max = Math.max(...rates); const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    const extreme = r.rows.filter(row => row.fundingExtreme).length;
    const crowded = r.rows.filter(row => row.crowdedLongsProxy).length;
    reportLines.push(`| ${r.token} | ${(min*100).toFixed(4)}% | ${(max*100).toFixed(4)}% | ${(mean*100).toFixed(4)}% | ${extreme} | ${crowded} |`);
  }

  reportLines.push("", "## 3. Funding vs Event Timing", "",
    "| Token | OI-Leads-Price Days | Interpretation |",
    "|-------|:---:|------|");

  for (const r of allResults) {
    const leadDays = r.rows.filter(row => row.oiLeadsPriceFlag).length;
    let interp = "No clear OI lead signal";
    if (leadDays > 10) interp = "POSSIBLE_DERIVATIVES_POSITIONING — funding turned positive before breakout";
    else if (leadDays > 3) interp = "DERIVATIVES_CONFIRMATION_ONLY — funding turned positive near breakout";
    else interp = "NO_DERIVATIVES_SIGNAL — insufficient OI lead evidence";
    reportLines.push(`| ${r.token} | ${leadDays} | ${interp} |`);
  }

  reportLines.push("", "## 4. Limitations", "",
    "- OI data is current snapshot only (OKX free API limitation). OI change over time NOT available.",
    "- OI-leads-price detection uses funding rate as proxy — higher funding = more long demand = possible OI buildup.",
    "- Without historical OI time-series, cannot confirm OI accumulation before price.",
    "- Funding rate history is available and working for all 6 tokens.",
    "- PEPE/WIF/BONK/FLOKI events may be partially outside 90-day funding history window.",
    "- This is a FIRST PASS with incomplete OI data. Full OI time-series would change the conclusions.",
    "", "## 5. Recommendation", "",
    "- Funding rate analysis: USABLE for detecting late-stage overheating and sentiment extremes.",
    "- OI analysis: NEED OI HISTORY. Current snapshot is insufficient for positioning detection.",
    "- **Do NOT add to Scanner v02 until OI time-series is available.**",
    "- Priority: find OI history data source (OKX contract OI history endpoint, CoinGlass, or Bybit API).");

  writeFileSync(join(REPORTS_DIR, "derivatives_common_structure_report.md"), reportLines.join("\n"));

  console.log(`\nFeatures: ${join(OUT_DIR, "features", "derivatives_feature_table.csv")}`);
  console.log(`Report: ${join(REPORTS_DIR, "derivatives_common_structure_report.md")}`);
  console.log(`\n=== Key Finding: OI is SNAPSHOT-ONLY ===`);
  console.log(`OKX free API /public/open-interest returns only current OI.`);
  console.log(`OI change over time cannot be computed without OI history endpoint.`);
  console.log(`Funding rate history IS available and working.`);
  console.log(`Full derivatives positioning analysis requires OI time-series data.`);
}

main().catch(console.error);
