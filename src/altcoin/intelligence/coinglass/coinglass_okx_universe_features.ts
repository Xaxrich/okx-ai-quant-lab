import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { loadDotenvOnce, projectRoot } from "../../../config/env.js";
import { readCsv, writeCsv } from "../../../utils/csv.js";
import { fetchJsonWithFallback } from "../../../utils/http.js";
import { normalizeCoinGlassTimestamp } from "./coinglass_time.js";
import { ohlcValue, parseOhlcRow, type OhlcValueMode } from "./coinglass_feature_builder.js";

const ROOT = projectRoot();
const OKX_BASE = "https://www.okx.com/api/v5";
const CG_BASE = "https://open-api-v4.coinglass.com";
const OUT_DIR = join(ROOT, "data", "altcoin", "intelligence", "coinglass");
const FEATURES_DIR = join(OUT_DIR, "features");
const ANALYSIS_DIR = join(OUT_DIR, "analysis");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "coinglass");
const ACCUMULATION_PATH = join(ROOT, "data", "altcoin", "intelligence", "accumulation", "okx_accumulation_features_latest.csv");

const CORE_EXCHANGES = "Binance,OKX,Bybit";
let lastCgCallAt = 0;
let lastOkxCallAt = 0;

type Obj = Record<string, string>;

interface Options {
  limit: number;
  minVolumeUsd: number;
  minOiUsd: number;
  includeMajors: boolean;
  source: "okx" | "accumulation";
  withFlow: boolean;
}

interface UniverseRow {
  token: string;
  instId: string;
  volumeUsd: number;
  oiUsd: number;
  source: string;
}

interface CgResponse {
  status: string;
  data: any[];
  raw: unknown;
}

interface SeriesPoint {
  time: number | null;
  date: string | null;
  value: number | null;
  parseStatus: string;
  limitation: string;
}

interface LiquidationPoint {
  time: number | null;
  date: string | null;
  longLiqUsd: number | null;
  shortLiqUsd: number | null;
  totalLiqUsd: number | null;
}

interface FlowPoint {
  time: number | null;
  buyUsd: number | null;
  sellUsd: number | null;
  netUsd: number | null;
  cvd: number | null;
}

export interface CoinGlassOkxUniverseFeature {
  token: string;
  symbol: string;
  observedAt: string;
  instId: string;
  okxVolumeUsd: number;
  okxOiUsd: number;
  fetchStatus: string;
  oiRows: number;
  oiUsdLatest: number | null;
  oiChg1d: number | null;
  oiChg7d: number | null;
  oiAbsChg1d: number | null;
  oiAbsChg7d: number | null;
  oiZ7d: number | null;
  fundingRows: number;
  fundingRateLatest: number | null;
  fundingZ7d: number | null;
  fundingOverheated: boolean;
  liqRows: number;
  liqVolLatest: number | null;
  liqVol24h: number | null;
  longLiqLatest: number | null;
  shortLiqLatest: number | null;
  liqImbalanceLatest: number | null;
  liqZ7d: number | null;
  exchangeRows: number;
  okxOiShare: number | null;
  top3OiShare: number | null;
  growingExchanges1h: number | null;
  shrinkingExchanges1h: number | null;
  takerRows: number;
  takerBuySellRatio: number | null;
  takerNet4hUsd: number | null;
  takerNetZ7d: number | null;
  cvdRows: number;
  cvdLatest: number | null;
  cvdChg24h: number | null;
  readiness: string;
  limitations: string;
}

function parseArgs(): Options {
  const arg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
  };
  const numArg = (name: string, fallback: number): number => {
    const raw = arg(name);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  const source = arg("source") === "accumulation" ? "accumulation" : "okx";
  return {
    limit: Math.max(1, Math.floor(numArg("limit", 25))),
    minVolumeUsd: numArg("min-volume-usd", 2_000_000),
    minOiUsd: numArg("min-oi-usd", 1_000_000),
    includeMajors: process.argv.includes("--include-majors"),
    source,
    withFlow: process.argv.includes("--with-flow"),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function num(value: unknown): number {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pctRatio(latest: number | null, previous: number | null): number | null {
  if (latest === null || previous === null || previous <= 0) return null;
  return (latest - previous) / previous;
}

export function changeRatio(values: (number | null)[], barsBack: number): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (valid.length <= barsBack) return null;
  return pctRatio(valid[valid.length - 1], valid[valid.length - 1 - barsBack]);
}

function absoluteChange(values: (number | null)[], barsBack: number): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (valid.length <= barsBack) return null;
  return valid[valid.length - 1] - valid[valid.length - 1 - barsBack];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values: number[]): number {
  const avg = mean(values);
  if (avg === null) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length);
}

export function zscoreLatest(values: (number | null)[], lookback = 42): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value)).slice(-lookback);
  if (valid.length < 3) return null;
  const avg = mean(valid);
  const sigma = std(valid);
  if (avg === null || sigma <= 0) return null;
  return (valid[valid.length - 1] - avg) / sigma;
}

function rowsToObjects(path: string): Obj[] {
  const csv = readCsv(path);
  if (!csv) return [];
  return csv.rows.map((row) => {
    const out: Obj = {};
    csv.h.forEach((header, index) => {
      out[header] = row[index] || "";
    });
    return out;
  });
}

function symbolFromInstId(instId: string): string {
  return instId.replace(/-USDT-SWAP$/, "").toUpperCase();
}

function isMajorOrStable(symbol: string): boolean {
  return new Set(["BTC", "ETH", "USDT", "USDC", "DAI", "FDUSD", "TUSD", "USD", "EURT", "USDE"]).has(symbol.toUpperCase());
}

function quoteVolumeUsd(ticker: any, lastPrice: number | null): number | null {
  const direct = numOrNull(ticker?.volCcyQuote ?? ticker?.volQuote24h ?? ticker?.quoteVol24h);
  if (direct !== null) return direct;
  const baseVol = numOrNull(ticker?.volCcy24h);
  return baseVol !== null && lastPrice !== null ? baseVol * lastPrice : null;
}

async function okxGet(path: string): Promise<any[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const elapsed = Date.now() - lastOkxCallAt;
    if (elapsed < 90) await sleep(90 - elapsed);
    lastOkxCallAt = Date.now();
    try {
      const response = await fetchJsonWithFallback(`${OKX_BASE}${path}`, { headers: { Accept: "application/json" } }, 15_000);
      const body = response.body as any;
      if (response.status === 429 || response.status >= 500 || (body?.code && String(body.code) !== "0")) {
        await sleep(250 * (attempt + 1));
        continue;
      }
      if (response.status < 200 || response.status >= 300) return [];
      return Array.isArray(body?.data) ? body.data : [];
    } catch {
      await sleep(250 * (attempt + 1));
    }
  }
  return [];
}

async function cgGet(path: string): Promise<CgResponse> {
  const key = process.env.COINGLASS_API_KEY || "";
  if (!key) return { status: "COINGLASS_NOT_CONFIGURED", data: [], raw: null };

  for (let attempt = 0; attempt < 3; attempt++) {
    const elapsed = Date.now() - lastCgCallAt;
    if (elapsed < 250) await sleep(250 - elapsed);
    lastCgCallAt = Date.now();
    try {
      const response = await fetchJsonWithFallback(`${CG_BASE}${path}`, {
        headers: { "CG-API-KEY": key, Accept: "application/json" },
      }, 20_000);
      const body = response.body as any;
      if (response.status === 429 || response.status >= 500) {
        await sleep(1_000 * (attempt + 1));
        continue;
      }
      if (response.status < 200 || response.status >= 300) return { status: `HTTP_${response.status}`, data: [], raw: body };
      const code = String(body?.code ?? "0");
      const data = Array.isArray(body?.data) ? body.data : [];
      return { status: code === "0" ? "OK" : `COINGLASS_${code}`, data, raw: body };
    } catch (err) {
      if (attempt === 2) return { status: err instanceof Error ? `ERROR_${err.message}` : "ERROR", data: [], raw: null };
      await sleep(1_000 * (attempt + 1));
    }
  }
  return { status: "ERROR_RETRY_EXHAUSTED", data: [], raw: null };
}

async function fetchOkxUniverse(options: Options): Promise<UniverseRow[]> {
  const [instruments, tickers, openInterest] = await Promise.all([
    okxGet("/public/instruments?instType=SWAP"),
    okxGet("/market/tickers?instType=SWAP"),
    okxGet("/public/open-interest?instType=SWAP"),
  ]);
  const tickersByInstId = new Map(tickers.map((row: any) => [String(row.instId || ""), row]));
  const oiByInstId = new Map(openInterest.map((row: any) => [String(row.instId || ""), row]));
  return instruments
    .filter((row: any) => {
      const category = String(row.instCategory || row.category || "");
      return String(row.instId || "").endsWith("-USDT-SWAP") && row.state === "live" && (category === "" || category === "1");
    })
    .map((row: any) => {
      const instId = String(row.instId || "");
      const token = symbolFromInstId(instId);
      const ticker = tickersByInstId.get(instId) || {};
      const oi = oiByInstId.get(instId) || {};
      const last = numOrNull((ticker as any).last);
      return {
        token,
        instId,
        volumeUsd: quoteVolumeUsd(ticker, last) || 0,
        oiUsd: numOrNull((oi as any).oiUsd) || 0,
        source: "okx_live_universe",
      };
    })
    .filter((row) => options.includeMajors || !isMajorOrStable(row.token))
    .filter((row) => row.volumeUsd >= options.minVolumeUsd || row.oiUsd >= options.minOiUsd)
    .sort((a, b) => (b.volumeUsd + b.oiUsd * 0.25) - (a.volumeUsd + a.oiUsd * 0.25))
    .slice(0, options.limit);
}

function fetchAccumulationUniverse(options: Options): UniverseRow[] {
  return rowsToObjects(ACCUMULATION_PATH)
    .map((row) => ({
      token: String(row.token || "").toUpperCase(),
      instId: row.inst_id || `${String(row.token || "").toUpperCase()}-USDT-SWAP`,
      volumeUsd: num(row.volume_quote_24h),
      oiUsd: num(row.oi_usd),
      source: "accumulation_latest",
    }))
    .filter((row) => row.token && (options.includeMajors || !isMajorOrStable(row.token)))
    .filter((row) => row.volumeUsd >= options.minVolumeUsd || row.oiUsd >= options.minOiUsd)
    .slice(0, options.limit);
}

function parseOhlcSeries(rows: any[], mode: OhlcValueMode): SeriesPoint[] {
  return rows
    .map((row) => {
      const parsed = parseOhlcRow(row, mode);
      const value = ohlcValue(parsed, mode);
      return {
        time: parsed.time,
        date: normalizeCoinGlassTimestamp(parsed.time),
        value: value.value,
        parseStatus: value.status,
        limitation: value.limitation,
      };
    })
    .filter((row) => row.time !== null)
    .sort((a, b) => (a.time || 0) - (b.time || 0));
}

function parseLiquidationRows(rows: any[]): LiquidationPoint[] {
  return rows
    .map((row) => {
      const time = numOrNull(row.time ?? row.t ?? row.timestamp);
      const longLiqUsd = numOrNull(row.aggregated_long_liquidation_usd ?? row.longLiquidationUsd ?? row.long_liquidation_usd);
      const shortLiqUsd = numOrNull(row.aggregated_short_liquidation_usd ?? row.shortLiquidationUsd ?? row.short_liquidation_usd);
      const totalLiqUsd = longLiqUsd !== null || shortLiqUsd !== null ? (longLiqUsd ?? 0) + (shortLiqUsd ?? 0) : null;
      return {
        time,
        date: normalizeCoinGlassTimestamp(time),
        longLiqUsd,
        shortLiqUsd,
        totalLiqUsd,
      };
    })
    .filter((row) => row.time !== null)
    .sort((a, b) => (a.time || 0) - (b.time || 0));
}

function fieldNumber(row: any, names: string[]): number | null {
  for (const name of names) {
    const value = numOrNull(row?.[name]);
    if (value !== null) return value;
  }
  return null;
}

function exchangeName(row: any): string {
  return String(row.exchange || row.exchangeName || row.exchange_name || "").toUpperCase();
}

function exchangeStats(rows: any[]): Pick<CoinGlassOkxUniverseFeature, "exchangeRows" | "okxOiShare" | "top3OiShare" | "growingExchanges1h" | "shrinkingExchanges1h"> {
  const exchangeRows = rows.filter((row) => exchangeName(row) && exchangeName(row) !== "ALL");
  const entries = exchangeRows.map((row) => ({
    name: exchangeName(row),
    oiUsd: fieldNumber(row, ["open_interest_usd", "openInterestUsd", "amountUsd", "amount_usd", "open_interest"]),
    change1h: fieldNumber(row, ["open_interest_change_percent_1h", "openInterestChangePercent1h", "changePercent1h"]),
  }));
  const totalFromAll = rows
    .filter((row) => exchangeName(row) === "ALL")
    .map((row) => fieldNumber(row, ["open_interest_usd", "openInterestUsd", "amountUsd", "amount_usd", "open_interest"]))
    .find((value) => value !== null);
  const total = totalFromAll ?? entries.reduce((sum, row) => sum + (row.oiUsd ?? 0), 0);
  const sorted = [...entries].sort((a, b) => (b.oiUsd ?? 0) - (a.oiUsd ?? 0));
  const okx = entries.find((row) => row.name === "OKX");
  return {
    exchangeRows: exchangeRows.length,
    okxOiShare: total > 0 ? (okx?.oiUsd ?? 0) / total : null,
    top3OiShare: total > 0 ? sorted.slice(0, 3).reduce((sum, row) => sum + (row.oiUsd ?? 0), 0) / total : null,
    growingExchanges1h: entries.length > 0 ? entries.filter((row) => (row.change1h ?? 0) > 0).length : null,
    shrinkingExchanges1h: entries.length > 0 ? entries.filter((row) => (row.change1h ?? 0) < 0).length : null,
  };
}

function firstPresentNumber(row: any, names: string[]): number | null {
  for (const name of names) {
    const direct = numOrNull(row?.[name]);
    if (direct !== null) return direct;
  }
  return null;
}

function parseFlowRows(rows: any[]): FlowPoint[] {
  return rows
    .map((row) => {
      if (Array.isArray(row)) {
        const time = numOrNull(row[0]);
        const buyUsd = numOrNull(row[1]);
        const sellUsd = numOrNull(row[2]);
        const cvd = numOrNull(row[4] ?? row[3]);
        const netUsd = buyUsd !== null || sellUsd !== null ? (buyUsd ?? 0) - (sellUsd ?? 0) : null;
        return { time, buyUsd, sellUsd, netUsd, cvd };
      }
      const time = numOrNull(row.time ?? row.t ?? row.timestamp);
      const buyUsd = firstPresentNumber(row, ["buy_volume_usd", "buyVolumeUsd", "taker_buy_volume_usd", "takerBuyVolumeUsd", "buyUsd"]);
      const sellUsd = firstPresentNumber(row, ["sell_volume_usd", "sellVolumeUsd", "taker_sell_volume_usd", "takerSellVolumeUsd", "sellUsd"]);
      const netUsd = firstPresentNumber(row, ["net_volume_usd", "netVolumeUsd", "delta_usd", "deltaUsd"]) ?? (buyUsd !== null || sellUsd !== null ? (buyUsd ?? 0) - (sellUsd ?? 0) : null);
      const cvd = firstPresentNumber(row, ["cvd", "close", "value", "cumulative_volume_delta", "cumulativeVolumeDelta"]);
      return { time, buyUsd, sellUsd, netUsd, cvd };
    })
    .filter((row) => row.time !== null)
    .sort((a, b) => (a.time || 0) - (b.time || 0));
}

async function firstWorking(paths: string[]): Promise<CgResponse> {
  let last: CgResponse = { status: "NOT_REQUESTED", data: [], raw: null };
  for (const path of paths) {
    last = await cgGet(path);
    if (last.status === "OK" && last.data.length > 0) return last;
    if (last.status === "COINGLASS_NOT_CONFIGURED") return last;
  }
  return last;
}

async function fetchOptionalFlow(symbol: string, enabled: boolean): Promise<{
  taker: CgResponse;
  cvd: CgResponse;
  takerRows: FlowPoint[];
  cvdRows: FlowPoint[];
}> {
  if (!enabled) {
    const skipped = { status: "SKIPPED_WITHOUT_FLOW_FLAG", data: [], raw: null };
    return { taker: skipped, cvd: skipped, takerRows: [], cvdRows: [] };
  }
  const encodedSymbol = encodeURIComponent(symbol);
  const encodedOkx = encodeURIComponent("OKX");
  const taker = await firstWorking([
    `/api/futures/v2/taker-buy-sell-volume/history?symbol=${encodedSymbol}&exchange=${encodedOkx}&interval=4h&limit=42`,
    `/api/futures/v2/taker-buy-sell-volume/history?symbol=${encodedSymbol}&exchange_list=${encodedOkx}&interval=4h&limit=42`,
    `/api/futures/taker-buy-sell-volume/history?symbol=${encodedSymbol}&exchange=${encodedOkx}&interval=4h&limit=42`,
  ]);
  const cvd = await firstWorking([
    `/api/futures/aggregated-cvd/history?symbol=${encodedSymbol}&interval=4h&limit=42&exchange_list=${encodedOkx}`,
    `/api/futures/cvd/history?symbol=${encodedSymbol}&exchange=${encodedOkx}&interval=4h&limit=42`,
    `/api/futures/cvd/history?symbol=${encodedSymbol}&interval=4h&limit=42&exchange=${encodedOkx}`,
  ]);
  return { taker, cvd, takerRows: parseFlowRows(taker.data), cvdRows: parseFlowRows(cvd.data) };
}

export function classifyCoinGlassFeatureReadiness(input: {
  oiRows: number;
  fundingRows: number;
  liqRows: number;
  oiUsdLatest: number | null;
  fundingRateLatest: number | null;
}): string {
  if (input.oiRows >= 8 && input.fundingRows >= 3 && input.oiUsdLatest !== null && input.fundingRateLatest !== null) {
    return input.liqRows > 0 ? "COINGLASS_OKX_FEATURE_READY" : "COINGLASS_OKX_FEATURE_PARTIAL_LIQ_MISSING";
  }
  if (input.oiRows > 0 || input.fundingRows > 0 || input.liqRows > 0) return "COINGLASS_OKX_SHORT_HISTORY";
  return "COINGLASS_OKX_UNAVAILABLE";
}

function summarizeFlow(rows: FlowPoint[]): Pick<CoinGlassOkxUniverseFeature, "takerRows" | "takerBuySellRatio" | "takerNet4hUsd" | "takerNetZ7d" | "cvdRows" | "cvdLatest" | "cvdChg24h"> {
  const latest = rows[rows.length - 1];
  const netValues = rows.map((row) => row.netUsd);
  const buy = latest?.buyUsd ?? null;
  const sell = latest?.sellUsd ?? null;
  return {
    takerRows: rows.length,
    takerBuySellRatio: buy !== null && sell !== null && sell > 0 ? buy / sell : null,
    takerNet4hUsd: latest?.netUsd ?? null,
    takerNetZ7d: zscoreLatest(netValues, 42),
    cvdRows: 0,
    cvdLatest: null,
    cvdChg24h: null,
  };
}

function summarizeCvd(rows: FlowPoint[]): Pick<CoinGlassOkxUniverseFeature, "cvdRows" | "cvdLatest" | "cvdChg24h"> {
  const latest = rows[rows.length - 1]?.cvd ?? null;
  const previous = rows.length > 6 ? rows[rows.length - 7]?.cvd ?? null : null;
  return {
    cvdRows: rows.length,
    cvdLatest: latest,
    cvdChg24h: latest !== null && previous !== null ? latest - previous : null,
  };
}

async function buildFeature(row: UniverseRow, options: Options): Promise<CoinGlassOkxUniverseFeature> {
  const symbol = row.token.toUpperCase();
  const encodedSymbol = encodeURIComponent(symbol);
  const oiResponse = await cgGet(`/api/futures/open-interest/aggregated-history?symbol=${encodedSymbol}&interval=1d&limit=45&unit=usd`);
  const fundingResponse = await cgGet(`/api/futures/funding-rate/oi-weight-history?symbol=${encodedSymbol}&interval=1d&limit=45`);
  const liqResponse = await cgGet(`/api/futures/liquidation/aggregated-history?symbol=${encodedSymbol}&interval=4h&limit=42&exchange_list=${encodeURIComponent(CORE_EXCHANGES)}`);
  const exchangeResponse = await cgGet(`/api/futures/open-interest/exchange-list?symbol=${encodedSymbol}`);
  const flow = await fetchOptionalFlow(symbol, options.withFlow);

  const oi = parseOhlcSeries(oiResponse.data, "close");
  const funding = parseOhlcSeries(fundingResponse.data, "close");
  const liquidation = parseLiquidationRows(liqResponse.data);
  const oiValues = oi.map((point) => point.value);
  const fundingValues = funding.map((point) => point.value);
  const liqValues = liquidation.map((point) => point.totalLiqUsd);
  const latestLiq = liquidation[liquidation.length - 1];
  const liq24h = liquidation.slice(-6).reduce((sum, point) => sum + (point.totalLiqUsd ?? 0), 0);
  const exchange = exchangeStats(exchangeResponse.data);
  const takerSummary = summarizeFlow(flow.takerRows);
  const cvdSummary = summarizeCvd(flow.cvdRows);

  const latestFunding = fundingValues[fundingValues.length - 1] ?? null;
  const latestOi = oiValues[oiValues.length - 1] ?? null;
  const fundingZ = zscoreLatest(fundingValues, 30);
  const limitations = new Set<string>();
  const statuses = [oiResponse.status, fundingResponse.status, liqResponse.status, exchangeResponse.status];
  if (oiResponse.status !== "OK") limitations.add(`oi=${oiResponse.status}`);
  if (fundingResponse.status !== "OK") limitations.add(`funding=${fundingResponse.status}`);
  if (liqResponse.status !== "OK") limitations.add(`liquidation=${liqResponse.status}`);
  if (exchangeResponse.status !== "OK") limitations.add(`exchange_oi=${exchangeResponse.status}`);
  if (options.withFlow) {
    if (flow.taker.status !== "OK") limitations.add(`taker=${flow.taker.status}`);
    if (flow.cvd.status !== "OK") limitations.add(`cvd=${flow.cvd.status}`);
  } else {
    limitations.add("optional_taker_cvd_not_requested");
  }
  for (const point of [...oi, ...funding]) {
    if (point.limitation) limitations.add(point.limitation);
  }
  const readiness = classifyCoinGlassFeatureReadiness({
    oiRows: oi.length,
    fundingRows: funding.length,
    liqRows: liquidation.length,
    oiUsdLatest: latestOi,
    fundingRateLatest: latestFunding,
  });

  return {
    token: symbol,
    symbol,
    observedAt: new Date().toISOString(),
    instId: row.instId,
    okxVolumeUsd: row.volumeUsd,
    okxOiUsd: row.oiUsd,
    fetchStatus: statuses.join("|"),
    oiRows: oi.length,
    oiUsdLatest: latestOi,
    oiChg1d: changeRatio(oiValues, 1),
    oiChg7d: changeRatio(oiValues, 7),
    oiAbsChg1d: absoluteChange(oiValues, 1),
    oiAbsChg7d: absoluteChange(oiValues, 7),
    oiZ7d: zscoreLatest(oiValues, 30),
    fundingRows: funding.length,
    fundingRateLatest: latestFunding,
    fundingZ7d: fundingZ,
    fundingOverheated: Math.abs(fundingZ ?? 0) > 2.5 || (fundingZ === null && latestFunding !== null && Math.abs(latestFunding) > 0.02),
    liqRows: liquidation.length,
    liqVolLatest: latestLiq?.totalLiqUsd ?? null,
    liqVol24h: liq24h > 0 ? liq24h : null,
    longLiqLatest: latestLiq?.longLiqUsd ?? null,
    shortLiqLatest: latestLiq?.shortLiqUsd ?? null,
    liqImbalanceLatest: latestLiq?.totalLiqUsd && latestLiq.totalLiqUsd > 0
      ? ((latestLiq.longLiqUsd ?? 0) - (latestLiq.shortLiqUsd ?? 0)) / latestLiq.totalLiqUsd
      : null,
    liqZ7d: zscoreLatest(liqValues, 42),
    exchangeRows: exchange.exchangeRows,
    okxOiShare: exchange.okxOiShare,
    top3OiShare: exchange.top3OiShare,
    growingExchanges1h: exchange.growingExchanges1h,
    shrinkingExchanges1h: exchange.shrinkingExchanges1h,
    takerRows: takerSummary.takerRows,
    takerBuySellRatio: takerSummary.takerBuySellRatio,
    takerNet4hUsd: takerSummary.takerNet4hUsd,
    takerNetZ7d: takerSummary.takerNetZ7d,
    cvdRows: cvdSummary.cvdRows,
    cvdLatest: cvdSummary.cvdLatest,
    cvdChg24h: cvdSummary.cvdChg24h,
    readiness,
    limitations: Array.from(limitations).join(";"),
  };
}

function featureRow(row: CoinGlassOkxUniverseFeature): (string | number | null | undefined)[] {
  return [
    row.observedAt,
    row.token,
    row.symbol,
    row.instId,
    row.okxVolumeUsd,
    row.okxOiUsd,
    row.fetchStatus,
    row.oiRows,
    row.oiUsdLatest,
    row.oiChg1d,
    row.oiChg7d,
    row.oiAbsChg1d,
    row.oiAbsChg7d,
    row.oiZ7d,
    row.fundingRows,
    row.fundingRateLatest,
    row.fundingZ7d,
    String(row.fundingOverheated),
    row.liqRows,
    row.liqVolLatest,
    row.liqVol24h,
    row.longLiqLatest,
    row.shortLiqLatest,
    row.liqImbalanceLatest,
    row.liqZ7d,
    row.exchangeRows,
    row.okxOiShare,
    row.top3OiShare,
    row.growingExchanges1h,
    row.shrinkingExchanges1h,
    row.takerRows,
    row.takerBuySellRatio,
    row.takerNet4hUsd,
    row.takerNetZ7d,
    row.cvdRows,
    row.cvdLatest,
    row.cvdChg24h,
    row.readiness,
    row.limitations,
  ];
}

const FEATURE_HEADER = [
  "observed_at",
  "token",
  "symbol",
  "inst_id",
  "okx_volume_usd",
  "okx_oi_usd",
  "fetch_status",
  "oi_rows",
  "oi_usd_latest",
  "oi_chg_1d",
  "oi_chg_7d",
  "oi_abs_chg_1d",
  "oi_abs_chg_7d",
  "oi_z_7d",
  "funding_rows",
  "funding_rate_latest",
  "funding_z_7d",
  "funding_overheated",
  "liq_rows",
  "liq_vol_latest",
  "liq_vol_24h",
  "long_liq_latest",
  "short_liq_latest",
  "liq_imbalance_latest",
  "liq_z_7d",
  "exchange_rows",
  "okx_oi_share",
  "top3_oi_share",
  "growing_exchanges_1h",
  "shrinking_exchanges_1h",
  "taker_rows",
  "taker_buy_sell_ratio",
  "taker_net_4h_usd",
  "taker_net_z_7d",
  "cvd_rows",
  "cvd_latest",
  "cvd_chg_24h",
  "readiness",
  "limitations",
];

function money(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function pct(value: number | null): string {
  return value === null ? "" : `${(value * 100).toFixed(2)}%`;
}

function buildReport(rows: CoinGlassOkxUniverseFeature[], options: Options, snapshotId: string): string {
  const ready = rows.filter((row) => row.readiness === "COINGLASS_OKX_FEATURE_READY").length;
  const partial = rows.filter((row) => row.readiness !== "COINGLASS_OKX_UNAVAILABLE").length;
  const displayed = [...rows]
    .sort((a, b) => ((b.oiChg7d ?? -99) + (b.okxOiShare ?? 0) * 0.2) - ((a.oiChg7d ?? -99) + (a.okxOiShare ?? 0) * 0.2))
    .slice(0, 15);
  return [
    "# CoinGlass OKX Universe Feature Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Snapshot: ${snapshotId}`,
    `Universe source: ${options.source}`,
    `Optional taker/CVD requested: ${options.withFlow}`,
    "",
    "Research-only output. These derivatives features do not authorize order placement.",
    "",
    "## Coverage",
    "",
    `- Feature-ready tokens: ${ready}/${rows.length}`,
    `- Partial or better tokens: ${partial}/${rows.length}`,
    `- Core exchanges for liquidation: ${CORE_EXCHANGES}`,
    "",
    "## Top OI Expansion Context",
    "",
    "| token | readiness | OI 7d | OI latest | funding | funding z | liq z | OKX OI share | top3 share | limits |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...displayed.map((row) =>
      `| ${row.token} | ${row.readiness} | ${pct(row.oiChg7d)} | ${row.oiUsdLatest === null ? "" : money(row.oiUsdLatest)} | ${pct(row.fundingRateLatest)} | ${row.fundingZ7d === null ? "" : row.fundingZ7d.toFixed(2)} | ${row.liqZ7d === null ? "" : row.liqZ7d.toFixed(2)} | ${pct(row.okxOiShare)} | ${pct(row.top3OiShare)} | ${row.limitations} |`
    ),
    "",
    "## Interpretation",
    "",
    "- Rising OI with non-overheated funding is treated as supportive context, not proof of accumulation.",
    "- Liquidation spikes are a risk overlay because they can indicate forced positioning rather than patient absorption.",
    "- Exchange OI share helps detect whether OKX is representative or merely a small tail of global derivatives activity.",
  ].join("\n");
}

function readyCountFromCsv(path: string): number {
  return rowsToObjects(path).filter((row) => row.readiness === "COINGLASS_OKX_FEATURE_READY").length;
}

function hasRateLimit(rows: CoinGlassOkxUniverseFeature[]): boolean {
  return rows.some((row) => row.fetchStatus.includes("429") || row.limitations.includes("429"));
}

async function main(): Promise<void> {
  loadDotenvOnce();
  const options = parseArgs();
  const snapshotId = new Date().toISOString().replace(/[:.]/g, "-");
  if (!existsSync(FEATURES_DIR)) mkdirSync(FEATURES_DIR, { recursive: true });
  if (!existsSync(ANALYSIS_DIR)) mkdirSync(ANALYSIS_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  console.log("=== CoinGlass OKX Universe Features ===");
  console.log(`limit=${options.limit} source=${options.source} withFlow=${options.withFlow}`);
  if (!process.env.COINGLASS_API_KEY) {
    console.log("COINGLASS_NOT_CONFIGURED");
    return;
  }

  const universe = options.source === "accumulation" ? fetchAccumulationUniverse(options) : await fetchOkxUniverse(options);
  console.log(`Universe selected: ${universe.length}`);

  const rows: CoinGlassOkxUniverseFeature[] = [];
  for (let i = 0; i < universe.length; i++) {
    const item = universe[i];
    console.log(`[${i + 1}/${universe.length}] ${item.token}: fetching CoinGlass derivatives...`);
    rows.push(await buildFeature(item, options));
  }

  const latestPath = join(FEATURES_DIR, "coinglass_okx_universe_features_latest.csv");
  const snapshotPath = join(FEATURES_DIR, `coinglass_okx_universe_features_${snapshotId}.csv`);
  const readinessLatestPath = join(ANALYSIS_DIR, "coinglass_okx_universe_readiness_latest.csv");
  const readinessAttemptPath = join(ANALYSIS_DIR, "coinglass_okx_universe_readiness_last_attempt.csv");
  const reportLatestPath = join(REPORTS_DIR, "coinglass_okx_universe_features_latest.md");
  const reportAttemptPath = join(REPORTS_DIR, "coinglass_okx_universe_features_last_attempt.md");
  const featureRows = rows.map(featureRow);
  const readinessRows = [
    ["token", "readiness", "oi_rows", "funding_rows", "liq_rows", "exchange_rows", "taker_rows", "cvd_rows", "limitations"],
    ...rows.map((row) => [row.token, row.readiness, row.oiRows, row.fundingRows, row.liqRows, row.exchangeRows, row.takerRows, row.cvdRows, row.limitations]),
  ];
  const report = buildReport(rows, options, snapshotId);
  const ready = rows.filter((row) => row.readiness === "COINGLASS_OKX_FEATURE_READY").length;
  const previousReady = readyCountFromCsv(latestPath);
  const preserveLatest = hasRateLimit(rows) && previousReady > ready;

  writeCsv(snapshotPath, [
    FEATURE_HEADER,
    ...featureRows,
  ]);
  writeCsv(readinessAttemptPath, readinessRows);
  writeFileSync(reportAttemptPath, report, "utf-8");

  if (!preserveLatest) {
    writeCsv(latestPath, [
      FEATURE_HEADER,
      ...featureRows,
    ]);
    writeCsv(readinessLatestPath, readinessRows);
    writeFileSync(reportLatestPath, report, "utf-8");
  } else {
    console.log(`Preserved previous latest because this attempt hit rate limits and ready count fell ${previousReady} -> ${ready}.`);
  }

  console.log(`Feature rows: ${rows.length} | ready=${ready}`);
  console.log(`Output: ${preserveLatest ? latestPath + " (preserved)" : latestPath}`);
  console.log(`Report: ${preserveLatest ? reportLatestPath + " (preserved)" : reportLatestPath}`);
}

const isMain = process.argv[1]?.includes("coinglass_okx_universe_features");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
