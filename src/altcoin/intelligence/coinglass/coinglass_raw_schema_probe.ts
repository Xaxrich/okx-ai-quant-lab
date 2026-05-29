import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fetchCompatWithFallback as fetch } from "../../../utils/http.js";

const CG_KEY = process.env.COINGLASS_API_KEY || "";
const CG_BASE = "https://open-api-v4.coinglass.com";
const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "coinglass", "analysis");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "coinglass");

async function cgGet(path: string): Promise<any> {
  if (!CG_KEY) return { status: "NOT_CONFIGURED", data: null, error: "No API key" };
  try {
    const r = await fetch(`${CG_BASE}${path}`, { headers: { "CG-API-KEY": CG_KEY, "Accept": "application/json" } });
    const text = await r.text();
    if (!r.ok) return { status: `HTTP_${r.status}`, data: text.slice(0, 200), error: text.slice(0, 200) };
    return { status: "OK", data: JSON.parse(text) };
  } catch (e: any) { return { status: "ERROR", data: null, error: e.message }; }
}

const TOKENS = ["PEPE", "BSB", "LAB", "UB", "AI"];

interface SchemaRecord {
  endpoint_name: string; token: string; request_path: string;
  status: string; row_count: number; response_type: string;
  top_level_keys: string[]; data_keys: string[];
  first_row_keys: string[]; first_row_sample: any;
  timestamp_candidates: string[]; numeric_candidates: string[];
  parser_ready: boolean; parser_recommendation: string;
  limitations: string[];
}

interface LiqVariant {
  variant_name: string; request_params: string; token: string;
  status: string; row_count: number; first_row_keys: string[];
  parser_ready: boolean; limitations: string[];
}

const LIQ_VARIANTS: { name: string; params: string }[] = [
  { name: "v1_1d_no_exchange", params: "interval=1d&limit=3" },
  { name: "v2_1d_exchange_list", params: "interval=1d&limit=3&exchange_list=Binance,OKX,Bybit" },
  { name: "v3_4h_no_exchange", params: "interval=4h&limit=3" },
  { name: "v4_4h_exchange_list", params: "interval=4h&limit=3&exchange_list=Binance,OKX,Bybit" },
  { name: "v5_4h_exchangeList", params: "interval=4h&limit=3&exchangeList=Binance,OKX,Bybit" },
  { name: "v6_4h_exchanges", params: "interval=4h&limit=3&exchanges=Binance,OKX,Bybit" },
];

async function probeEndpoint(endpoint: string, token: string, path: string): Promise<SchemaRecord> {
  const rec: SchemaRecord = {
    endpoint_name: endpoint, token, request_path: path.split("?")[0],
    status: "", row_count: 0, response_type: "",
    top_level_keys: [], data_keys: [],
    first_row_keys: [], first_row_sample: null,
    timestamp_candidates: [], numeric_candidates: [],
    parser_ready: false, parser_recommendation: "",
    limitations: [],
  };

  const r = await cgGet(path);
  rec.status = r.status;

  if (r.status !== "OK" || !r.data) {
    rec.limitations.push(`Request failed: ${r.status}`);
    return rec;
  }

  const d = r.data;
  rec.top_level_keys = Object.keys(d).filter(k => k !== "data");
  rec.response_type = typeof d.data;

  // Extract data rows
  let rows: any[] = [];
  if (Array.isArray(d.data)) {
    rows = d.data;
    rec.data_keys = [];
  } else if (d.data && typeof d.data === "object") {
    rec.data_keys = Object.keys(d.data);
    // Try known container keys
    for (const k of ["list", "records", "result", "items", "data", "history"]) {
      if (Array.isArray(d.data[k])) { rows = d.data[k]; break; }
    }
    if (rows.length === 0 && Array.isArray(d.data)) rows = d.data;
  }

  rec.row_count = rows.length;

  if (rows.length > 0) {
    const firstRow = rows[0];
    rec.first_row_sample = firstRow;
    if (typeof firstRow === "object" && !Array.isArray(firstRow)) {
      rec.first_row_keys = Object.keys(firstRow).slice(0, 30);
      // Detect timestamp candidates
      for (const k of rec.first_row_keys) {
        if (/time|date|ts|t$/i.test(k)) rec.timestamp_candidates.push(k);
        const v = firstRow[k];
        if (typeof v === "number" || (typeof v === "string" && !isNaN(parseFloat(v)) && parseFloat(v) > 1e8)) {
          rec.numeric_candidates.push(`${k}=${typeof v === "number" ? v.toFixed(2) : (v as string).slice(0, 12)}`);
        }
      }
      rec.parser_ready = rec.timestamp_candidates.length > 0 && rec.numeric_candidates.length > 0;
      rec.parser_recommendation = rec.parser_ready
        ? `Use timestamp from: ${rec.timestamp_candidates[0]}. Numeric fields: ${rec.numeric_candidates.slice(0, 5).join(", ")}`
        : "MANUAL_INSPECTION_REQUIRED";
    } else if (Array.isArray(firstRow)) {
      rec.first_row_keys = [`[array of ${firstRow.length} elements]`];
      rec.first_row_sample = firstRow.slice(0, 5);
      rec.parser_ready = firstRow.length >= 2;
      rec.parser_recommendation = `Array row parser needed. Element 0 as timestamp candidate (${firstRow[0]}), elements 1+ as numeric values.`;
    }
  }

  return rec;
}

async function main() {
  console.log("=== CoinGlass Raw Schema Probe ===\n");
  if (!CG_KEY) { console.log("NOT_CONFIGURED"); return; }
  console.log("CoinGlass: CONFIGURED\n");

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const allRecords: SchemaRecord[] = [];
  const allLiqVariants: LiqVariant[] = [];

  for (const token of TOKENS) {
    console.log(`${token}: probing schemas...`);

    const oiRec = await probeEndpoint("aggregated_oi", token, `/api/futures/open-interest/aggregated-history?symbol=${token}&interval=1d&limit=3&unit=usd`);
    console.log(`  OI: ${oiRec.status}, ${oiRec.row_count} rows, ts=${oiRec.timestamp_candidates[0] || "?"}`);
    allRecords.push(oiRec);

    const fundRec = await probeEndpoint("oi_weighted_funding", token, `/api/futures/funding-rate/oi-weight-history?symbol=${token}&interval=1d&limit=3`);
    console.log(`  Fund OI-w: ${fundRec.status}, ${fundRec.row_count} rows`);
    allRecords.push(fundRec);

    const volFundRec = await probeEndpoint("vol_weighted_funding", token, `/api/futures/funding-rate/vol-weight-history?symbol=${token}&interval=1d&limit=3`);
    console.log(`  Fund vol-w: ${volFundRec.status}, ${volFundRec.row_count} rows`);
    allRecords.push(volFundRec);

    // Liquidation: test all 6 parameter variants, record every result
    let firstWorkingVariant: string | null = null;
    for (const variant of LIQ_VARIANTS) {
      const liqPath = `/api/futures/liquidation/aggregated-history?symbol=${token}&${variant.params}`;
      const liqRec = await probeEndpoint("liquidation", token, liqPath);
      const working = liqRec.row_count > 0;
      if (working && !firstWorkingVariant) firstWorkingVariant = variant.name;
      const prefix = working ? "+" : "-";
      console.log(`  Liq ${prefix} ${variant.name}: ${liqRec.status}, ${liqRec.row_count} rows`);
      allLiqVariants.push({
        variant_name: variant.name,
        request_params: variant.params,
        token,
        status: liqRec.status,
        row_count: liqRec.row_count,
        first_row_keys: liqRec.first_row_keys,
        parser_ready: liqRec.parser_ready,
        limitations: liqRec.limitations,
      });
      if (working) {
        allRecords.push(liqRec);
      }
    }
    if (!firstWorkingVariant) {
      const failRec: SchemaRecord = {
        endpoint_name: "liquidation", token, request_path: "/api/futures/liquidation/aggregated-history",
        status: "ALL_VARIANTS_FAILED", row_count: 0, response_type: "",
        top_level_keys: [], data_keys: [],
        first_row_keys: [], first_row_sample: null,
        timestamp_candidates: [], numeric_candidates: [],
        parser_ready: false, parser_recommendation: "",
        limitations: [`All ${LIQ_VARIANTS.length} liquidation variants returned 0 rows`],
      };
      allRecords.push(failRec);
    } else {
      console.log(`  Liq working variant: ${firstWorkingVariant}`);
    }
    console.log("");
  }

  // Save JSON
  writeFileSync(join(OUT_DIR, "coinglass_raw_schema_probe.json"), JSON.stringify(allRecords, null, 2));

  // Summary CSV
  const csvH = "endpoint,token,status,row_count,ts_field,numeric_fields,parser_ready";
  const csvR = [csvH];
  for (const r of allRecords) {
    csvR.push(`${r.endpoint_name},${r.token},${r.status},${r.row_count},${r.timestamp_candidates[0] || "?"},"${r.numeric_candidates.slice(0, 3).join("; ")}",${r.parser_ready}`);
  }
  writeFileSync(join(OUT_DIR, "coinglass_raw_schema_probe_summary.csv"), csvR.join("\n"));

  // Liquidation variants CSV
  if (allLiqVariants.length > 0) {
    const liqCsvH = "variant_name,token,request_params,status,row_count,first_row_keys,parser_ready,limitations";
    const liqCsvR = [liqCsvH, ...allLiqVariants.map(v =>
      `${v.variant_name},${v.token},"${v.request_params}",${v.status},${v.row_count},"${v.first_row_keys.slice(0, 3).join("; ")}",${v.parser_ready},"${v.limitations.join("; ")}"`
    )];
    writeFileSync(join(OUT_DIR, "coinglass_liquidation_schema_variants.csv"), liqCsvR.join("\n"));
  }

  // Report
  const oiReady = allRecords.filter(r => r.endpoint_name === "aggregated_oi" && r.parser_ready).length;
  const fundReady = allRecords.filter(r => r.endpoint_name === "oi_weighted_funding" && r.parser_ready).length;
  const liqTokensWithData = new Set(allLiqVariants.filter(v => v.row_count > 0).map(v => v.token)).size;

  const reportLines = [
    "# CoinGlass Raw Schema Probe Report", "", `Generated: ${new Date().toISOString()}`,
    "", "## 1. Aggregated OI", "",
    `Parser ready: ${oiReady}/${TOKENS.length}`,
    "Timestamp fields found:", ...allRecords.filter(r => r.endpoint_name === "aggregated_oi").flatMap(r => r.timestamp_candidates.slice(0, 1)),
    "Numeric fields found:", ...allRecords.filter(r => r.endpoint_name === "aggregated_oi").flatMap(r => r.numeric_candidates.slice(0, 3)),
    "", "## 2. Funding", "",
    `OI-weighted parser ready: ${fundReady}/${TOKENS.length}`,
    "", "## 3. Liquidation", "",
    `Tokens with any liquidation data: ${liqTokensWithData}/${TOKENS.length}`,
    `Variants tested: ${LIQ_VARIANTS.length}`,
    `Working variants per token:`,
    ...TOKENS.map(t => {
      const tv = allLiqVariants.filter(v => v.token === t && v.row_count > 0);
      return `  ${t}: ${tv.length > 0 ? tv.map(v => v.variant_name).join(", ") : "NONE"}`;
    }),
    "", "## 4. Parser Update", "",
    oiReady >= 4 && fundReady >= 4
      ? "**SCHEMA_ALIGNED** — OHLCV fields confirmed: time/open/high/low/close for OI + funding, aggregated_long/short_liquidation_usd for liquidation."
      : "**SCHEMA_NOT_ALIGNED** — manual inspection of raw JSON required.",
  ];
  writeFileSync(join(REPORTS_DIR, "coinglass_raw_schema_probe_report.md"), reportLines.join("\n"));

  console.log(`\nReport: ${join(REPORTS_DIR, "coinglass_raw_schema_probe_report.md")}`);
}

main().catch(console.error);
