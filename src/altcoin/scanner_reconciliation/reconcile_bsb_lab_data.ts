import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const API_FEATURES = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_validation", "features", "scanner_feature_table.csv");
const RAW_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_validation", "raw");
const RECON_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_reconciliation_v1");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "reports", "altcoin", "scanner_reconciliation_v1");

interface CaseReportData {
  token: string;
  date: string;
  case_price: number | null;
  case_volume: number | null;
  case_market_cap: number | null;
  case_implied_supply: number | null;
  case_note: string;
}

// Manual extraction from v2 case study reports
const BSB_CASE: CaseReportData[] = [
  { token: "BSB", date: "2026-04-18", case_price: 0.217, case_volume: 12.24e6, case_market_cap: 50.41e6, case_implied_supply: 232.3e6, case_note: "Local low, pre-rally" },
  { token: "BSB", date: "2026-04-19", case_price: 0.233, case_volume: 8.31e6, case_market_cap: 46.38e6, case_implied_supply: 199.1e6, case_note: "Volume trough" },
  { token: "BSB", date: "2026-04-25", case_price: 0.743, case_volume: 46.71e6, case_market_cap: 97.79e6, case_implied_supply: 131.6e6, case_note: "NEWS DAY — acquisition announced, +63%" },
  { token: "BSB", date: "2026-04-28", case_price: 0.839, case_volume: 83.20e6, case_market_cap: 157.41e6, case_implied_supply: 187.6e6, case_note: "ATH close" },
  { token: "BSB", date: "2026-04-29", case_price: 0.458, case_volume: 35.49e6, case_market_cap: 180.26e6, case_implied_supply: 393.6e6, case_note: "CRASH -45% + SUPPLY ANOMALY +110%" },
  { token: "BSB", date: "2026-04-30", case_price: 0.611, case_volume: 107.27e6, case_market_cap: 98.64e6, case_implied_supply: 161.4e6, case_note: "EXTREME VOLUME $107M — crash recovery" },
];

const LAB_CASE: CaseReportData[] = [
  { token: "LAB", date: "2026-04-18", case_price: 0.508, case_volume: 30.73e6, case_market_cap: 44.78e6, case_implied_supply: 88.1e6, case_note: "Consolidation start" },
  { token: "LAB", date: "2026-04-22", case_price: 0.575, case_volume: 18.27e6, case_market_cap: 44.15e6, case_implied_supply: 76.8e6, case_note: "MAX COMPRESSION — vol trough" },
  { token: "LAB", date: "2026-04-23", case_price: 0.731, case_volume: 18.97e6, case_market_cap: 44.14e6, case_implied_supply: 60.4e6, case_note: "QUIET BREAKOUT +27%" },
  { token: "LAB", date: "2026-04-25", case_price: 0.847, case_volume: 110.14e6, case_market_cap: 56.60e6, case_implied_supply: 66.9e6, case_note: "Volume spike $110M" },
  { token: "LAB", date: "2026-04-26", case_price: 0.771, case_volume: 110.65e6, case_market_cap: 64.53e6, case_implied_supply: 83.7e6, case_note: "High turnover — effort/result decay" },
  { token: "LAB", date: "2026-04-30", case_price: 0.692, case_volume: 19.69e6, case_market_cap: 52.50e6, case_implied_supply: 75.9e6, case_note: "Pre-spike compression" },
  { token: "LAB", date: "2026-05-01", case_price: 1.20, case_volume: 18.80e6, case_market_cap: 52.98e6, case_implied_supply: 44.2e6, case_note: "SUPPLY ANOMALY — price +73%, mcap +0.9%" },
  { token: "LAB", date: "2026-05-02", case_price: 1.98, case_volume: 45.76e6, case_market_cap: 89.98e6, case_implied_supply: 45.4e6, case_note: "ATH close" },
  { token: "LAB", date: "2026-05-03", case_price: null, case_volume: 399.95e6, case_market_cap: 148.03e6, case_implied_supply: null, case_note: "CRASH — $400M vol, close N/A" },
];

function loadApiFeatures(): Map<string, { price: number; volume: number; market_cap: number; implied_supply: number }> {
  const map = new Map<string, any>();
  if (!existsSync(API_FEATURES)) return map;

  const csv = readFileSync(API_FEATURES, "utf-8");
  const lines = csv.split("\n");
  const headers = lines[0].split(",");

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(",");
    const row: any = {};
    headers.forEach((h, j) => { row[h.trim()] = isNaN(+vals[j]) ? vals[j] : +vals[j]; });

    const key = `${row.symbol}_${row.date}`;
    map.set(key, {
      price: row.price || 0,
      volume: row.volume || 0,
      market_cap: row.market_cap || 0,
      implied_supply: row.implied_supply || 0,
    });
  }

  return map;
}

function pctDiff(caseVal: number | null, apiVal: number): string {
  if (caseVal === null || apiVal === 0) return "N/A";
  return ((apiVal - caseVal) / caseVal * 100).toFixed(1) + "%";
}

async function main() {
  console.log("=== BSB/LAB Data Reconciliation ===\n");

  if (!existsSync(RECON_DIR)) mkdirSync(RECON_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const apiFeatures = loadApiFeatures();
  console.log(`API features loaded: ${apiFeatures.size} rows\n`);

  const allCases = [...BSB_CASE, ...LAB_CASE];
  const comparisons: string[][] = [[
    "token", "date", "case_price", "api_price", "case_volume", "api_volume",
    "case_mcap", "api_mcap", "case_implied_supply", "api_implied_supply",
    "price_diff_pct", "volume_diff_pct", "mcap_diff_pct", "supply_diff_pct",
    "case_note", "found_in_api"
  ]];

  for (const c of allCases) {
    const key = `${c.token}_${c.date}`;
    const api = apiFeatures.get(key);

    if (!api || api.price === 0) {
      comparisons.push([
        c.token, c.date,
        c.case_price?.toString() || "N/A", "NOT_FOUND",
        c.case_volume?.toString() || "N/A", "NOT_FOUND",
        c.case_market_cap?.toString() || "N/A", "NOT_FOUND",
        c.case_implied_supply?.toString() || "N/A", "NOT_FOUND",
        "N/A", "N/A", "N/A", "N/A",
        c.case_note, "NO"
      ]);
      console.log(`  ${c.token} ${c.date}: NOT FOUND in API data`);
      continue;
    }

    comparisons.push([
      c.token, c.date,
      c.case_price?.toFixed(6) || "N/A", api.price.toFixed(6),
      c.case_volume ? (c.case_volume / 1e6).toFixed(2) + "M" : "N/A", (api.volume / 1e6).toFixed(2) + "M",
      c.case_market_cap ? (c.case_market_cap / 1e6).toFixed(2) + "M" : "N/A", (api.market_cap / 1e6).toFixed(2) + "M",
      c.case_implied_supply ? (c.case_implied_supply / 1e6).toFixed(1) + "M" : "N/A", (api.implied_supply / 1e6).toFixed(1) + "M",
      pctDiff(c.case_price, api.price),
      pctDiff(c.case_volume, api.volume),
      pctDiff(c.case_market_cap, api.market_cap),
      pctDiff(c.case_implied_supply, api.implied_supply),
      c.case_note, "YES"
    ]);

    const priceDiff = c.case_price !== null ? Math.abs(api.price - c.case_price) / c.case_price * 100 : 999;
    const mcapDiff = c.case_market_cap !== null ? Math.abs(api.market_cap - c.case_market_cap) / c.case_market_cap * 100 : 999;
    console.log(`  ${c.token} ${c.date}: price diff=${priceDiff.toFixed(1)}%, mcap diff=${mcapDiff.toFixed(1)}%`);
  }

  // Save CSV
  const csv = comparisons.map(row => row.join(",")).join("\n");
  const allPath = join(RECON_DIR, "BSB_LAB_case_vs_api.csv");
  writeFileSync(allPath, csv);
  console.log(`\nSaved: ${allPath}`);

  // Analysis
  const notFound = comparisons.filter(r => r[15] === "NO");
  const found = comparisons.filter(r => r[15] === "YES");
  console.log(`\nFound in API: ${found.length}/${comparisons.length - 1}`);
  console.log(`Not found: ${notFound.length}`);

  if (notFound.length > 0) {
    console.log("\nMissing dates in API data:");
    for (const r of notFound) {
      console.log(`  ${r[0]} ${r[1]}: ${r[14]}`);
    }
  }

  // Root cause analysis
  console.log("\n=== Root Cause Analysis ===\n");
  console.log("Why scanner rules may have 0 triggers for BSB/LAB:");

  // Check: are the key event dates IN the API data window?
  const apiDates = new Set<string>();
  for (const [key] of apiFeatures) {
    const date = key.split("_").pop() || "";
    apiDates.add(date);
  }
  const apiDateList = [...apiDates].sort();
  console.log(`\nAPI data date range: ${apiDateList[0] || "N/A"} to ${apiDateList[apiDateList.length - 1] || "N/A"}`);

  // Check BSB/LAB key dates
  const keyDates = [
    "BSB 2026-04-25 (event)", "BSB 2026-04-28 (peak)", "BSB 2026-04-29 (crash+supply anomaly)",
    "LAB 2026-04-22 (compression)", "LAB 2026-04-23 (breakout)", "LAB 2026-05-01 (supply anomaly)",
    "LAB 2026-05-02 (ATH)", "LAB 2026-05-03 (crash)"
  ];
  for (const kd of keyDates) {
    const [token, date] = kd.split(" ");
    const key = `${token}_${date}`;
    const present = apiFeatures.has(key);
    console.log(`  ${kd}: ${present ? "PRESENT in API" : "MISSING from API"}`);
  }

  // Now check if the API values would trigger the rules
  console.log("\n=== Rule Trigger Check (API Values) ===\n");

  for (const c of allCases) {
    const key = `${c.token}_${c.date}`;
    const api = apiFeatures.get(key);
    if (!api || api.price === 0) continue;

    // Check supply anomaly rule: abs(supply_change_1d) > 0.30
    const prevDate = new Date(new Date(c.date).getTime() - 86400000).toISOString().slice(0, 10);
    const prevKey = `${c.token}_${prevDate}`;
    const prevApi = apiFeatures.get(prevKey);

    if (prevApi && prevApi.implied_supply > 0) {
      const supplyChg = (api.implied_supply - prevApi.implied_supply) / prevApi.implied_supply;
      if (Math.abs(supplyChg) > 0.30) {
        console.log(`  P0_SUPPLY_ANOMALY WOULD TRIGGER for ${c.token} on ${c.date}: supply_chg=${(supplyChg * 100).toFixed(1)}%`);
      }
    }

    // Check price/cap divergence
    const prevDayApi = apiFeatures.get(prevKey);
    if (prevDayApi && prevDayApi.price > 0 && prevDayApi.market_cap > 0 && api.market_cap > 0) {
      const priceRet = (api.price - prevDayApi.price) / prevDayApi.price;
      const mcapRet = (api.market_cap - prevDayApi.market_cap) / prevDayApi.market_cap;
      if ((priceRet > 0.30 && mcapRet < 0.05) || (priceRet < -0.20 && mcapRet > 0)) {
        console.log(`  P0_PRICE_CAP_DIVERGENCE WOULD TRIGGER for ${c.token} on ${c.date}: price_ret=${(priceRet*100).toFixed(1)}%, mcap_ret=${(mcapRet*100).toFixed(1)}%`);
      }
    }
  }
}

main().catch(console.error);
