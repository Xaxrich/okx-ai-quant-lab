import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { loadDotenvOnce, projectRoot } from "../../../config/env.js";
import { readCsv, writeCsv } from "../../../utils/csv.js";
import { fetchJsonWithFallback } from "../../../utils/http.js";
import { detectAccumulationPattern, type AccumulationDecision, type AccumulationEvidenceInput } from "./accumulation_pattern.js";

const ROOT = projectRoot();
const OKX_BASE = "https://www.okx.com/api/v5";
const OUT_DIR = join(ROOT, "data", "altcoin", "intelligence", "accumulation");
const OKX_OUT_DIR = join(ROOT, "data", "altcoin", "intelligence", "okx");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "accumulation");

const SCANNER_PATH = join(ROOT, "data", "altcoin", "scanner_v02", "features", "scanner_v02_universe_scores.csv");
const SCORE_SPLIT_PATH = join(ROOT, "data", "altcoin", "intelligence", "validation", "score_decomposition_latest.csv");
const DEX_HISTORY_PATH = join(ROOT, "data", "altcoin", "intelligence", "dex_history", "features", "dex_history_feature_table.csv");
const COINGLASS_OKX_UNIVERSE_PATH = join(ROOT, "data", "altcoin", "intelligence", "coinglass", "features", "coinglass_okx_universe_features_latest.csv");
const COINGLASS_PATH = join(ROOT, "data", "altcoin", "intelligence", "coinglass", "features", "coinglass_derivatives_features.csv");
const COINGECKO_OKX_UNIVERSE_PATH = join(ROOT, "data", "altcoin", "intelligence", "coingecko", "okx_universe", "coingecko_okx_universe_enrichment_latest.csv");
const OKX_DERIVATIVES_PATH = join(ROOT, "data", "altcoin", "intelligence", "derivatives", "features", "derivatives_feature_table.csv");
const HOLDER_PATH = join(ROOT, "data", "altcoin", "intelligence", "arkham", "features", "arkham_holder_entity_features.csv");
const DIRECTIONAL_PATH = join(ROOT, "data", "altcoin", "intelligence", "onchain", "directional_chain_scan_latest.csv");
let lastOkxCallAt = 0;

type Obj = Record<string, string>;

export type OkxAccumulationState =
  | "READY_TO_WATCH"
  | "WAIT_CONFIRMATION"
  | "DISTRIBUTION_RISK"
  | "MARKET_DATA_GAP"
  | "NO_EDGE";

export type TargetCap = "all" | "small-mid" | "micro-small" | "mid-large" | "large";
export type CexFlowGate = "SUPPORTED" | "MISSING_OR_WEAK" | "BLOCKED";

interface Options {
  limit: number;
  minVolumeUsd: number;
  minOiUsd: number;
  includeMajors: boolean;
  targetCap: TargetCap;
}

interface OkxInstrument {
  instId?: string;
  state?: string;
  category?: string;
  instCategory?: string;
  listTime?: string;
  lever?: string;
}

interface MarketMaps {
  instruments: OkxInstrument[];
  tickersByInstId: Map<string, any>;
  openInterestByInstId: Map<string, any>;
}

interface OkxMarketFeatures {
  token: string;
  instId: string;
  listAgeDays: number | null;
  lastPrice: number | null;
  spreadBps: number | null;
  return1h: number | null;
  return4h: number | null;
  return24h: number | null;
  return3d: number | null;
  return7d: number | null;
  range3d: number | null;
  volatility7d: number | null;
  volumeQuote24h: number | null;
  volumeZ7d: number | null;
  volumeAcceleration: number | null;
  oiUsd: number | null;
  oiChange1d: number | null;
  oiChange7d: number | null;
  oiZScore: number | null;
  fundingLatest: number | null;
  fundingZScore: number | null;
  dataQuality: number;
  limitations: string[];
}

export interface CoinGeckoContext {
  coingeckoId: string;
  resolutionStatus: string;
  primaryCategory: string;
  marketCapBucket: string;
  marketCap: number | null;
  fdvToMcap: number | null;
  volumeToMcap: number | null;
  marketCapRank: number | null;
  trendingRank: number | null;
  limitations: string[];
}

export interface OkxAccumulationReview {
  token: string;
  instId: string;
  state: OkxAccumulationState;
  accumulationScore: number;
  riskScore: number;
  executionScore: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  decision: AccumulationDecision;
  market: OkxMarketFeatures;
  coinGecko: CoinGeckoContext;
  contextPenalty: number;
  cexFlowGate: CexFlowGate;
  cexFlowAdjustment: number;
  thesis: string;
  invalidation: string;
  nextAction: string;
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
  return {
    limit: Math.max(1, Math.floor(numArg("limit", 40))),
    minVolumeUsd: numArg("min-volume-usd", 2_000_000),
    minOiUsd: numArg("min-oi-usd", 1_000_000),
    includeMajors: process.argv.includes("--include-majors"),
    targetCap: normalizeTargetCap(arg("target-cap")),
  };
}

export function normalizeTargetCap(value: string | undefined): TargetCap {
  if (value === "small-mid" || value === "micro-small" || value === "mid-large" || value === "large") return value;
  return "all";
}

export function targetUniverseLimit(options: Pick<Options, "limit" | "targetCap">): number {
  if (options.targetCap === "all") return options.limit;
  if (options.targetCap === "large") return Math.min(250, Math.max(options.limit, options.limit * 2));
  if (options.targetCap === "mid-large") return Math.min(250, Math.max(80, options.limit * 4));
  return Math.min(250, Math.max(120, options.limit * 6));
}

export function targetReviewLimit(options: Pick<Options, "limit" | "targetCap">): number {
  if (options.targetCap === "all") return options.limit;
  return Math.min(targetUniverseLimit(options), Math.max(60, options.limit * 3));
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

function mapByToken(rows: Obj[]): Map<string, Obj> {
  return new Map(rows.filter((row) => row.token).map((row) => [row.token.toUpperCase(), row]));
}

function mergeTokenMaps(primaryRows: Obj[], fallbackRows: Obj[]): Map<string, Obj> {
  const merged = mapByToken(fallbackRows);
  for (const [token, row] of mapByToken(primaryRows)) merged.set(token, row);
  return merged;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function bool(value: string | undefined): boolean | null {
  if (!value) return null;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return null;
}

export function coinGeckoContextFromRow(row?: Obj): CoinGeckoContext {
  return {
    coingeckoId: row?.coingecko_id || "",
    resolutionStatus: row?.resolution_status || "COINGECKO_NOT_AVAILABLE",
    primaryCategory: row?.primary_category || row?.registry_category || "",
    marketCapBucket: row?.market_cap_bucket || "UNKNOWN_MCAP",
    marketCap: numOrNull(row?.market_cap),
    fdvToMcap: numOrNull(row?.fdv_to_mcap),
    volumeToMcap: numOrNull(row?.volume_to_mcap),
    marketCapRank: numOrNull(row?.market_cap_rank),
    trendingRank: numOrNull(row?.trending_rank),
    limitations: (row?.limitations || "").split(";").filter(Boolean),
  };
}

export function computeCoinGeckoContextPenalty(context: Pick<CoinGeckoContext, "resolutionStatus" | "marketCapBucket" | "fdvToMcap" | "volumeToMcap">): number {
  let penalty = 0;
  if (context.resolutionStatus === "UNRESOLVED") penalty += 4;
  if (context.marketCapBucket === "LARGE_CAP_TOP30" || context.marketCapBucket === "LARGE_CAP_10B_PLUS") penalty += 8;
  if (context.fdvToMcap !== null && context.fdvToMcap >= 8) penalty += 12;
  else if (context.fdvToMcap !== null && context.fdvToMcap >= 4) penalty += 6;
  if (context.volumeToMcap !== null && context.volumeToMcap >= 1.5) penalty += 6;
  return clamp(penalty, 0, 24);
}

export function targetCapMatches(targetCap: TargetCap, context: Pick<CoinGeckoContext, "marketCapBucket">): boolean {
  if (targetCap === "all") return true;
  const bucket = context.marketCapBucket;
  if (targetCap === "small-mid") return bucket === "SMALL_CAP_10M_100M" || bucket === "MID_CAP_100M_1B";
  if (targetCap === "micro-small") return bucket === "MICRO_CAP_UNDER_10M" || bucket === "SMALL_CAP_10M_100M";
  if (targetCap === "mid-large") return bucket === "MID_CAP_100M_1B" || bucket === "MID_LARGE_1B_10B";
  return bucket === "LARGE_CAP_TOP30" || bucket === "LARGE_CAP_10B_PLUS";
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

export function symbolFromInstId(instId: string): string {
  return instId.replace(/-USDT-SWAP$/, "").toUpperCase();
}

export function isMajorOrStable(symbol: string): boolean {
  return new Set(["BTC", "ETH", "USDT", "USDC", "DAI", "FDUSD", "TUSD", "USD", "EURT", "USDE"]).has(symbol.toUpperCase());
}

function isCryptoUsdtSwap(row: OkxInstrument): boolean {
  const category = String(row.instCategory || row.category || "");
  return Boolean(row.instId?.endsWith("-USDT-SWAP") && row.state === "live" && (category === "" || category === "1"));
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

async function fetchMarketMaps(): Promise<MarketMaps> {
  const [instruments, tickers, openInterest] = await Promise.all([
    okxGet("/public/instruments?instType=SWAP"),
    okxGet("/market/tickers?instType=SWAP"),
    okxGet("/public/open-interest?instType=SWAP"),
  ]);
  return {
    instruments,
    tickersByInstId: new Map(tickers.map((row: any) => [String(row.instId || ""), row])),
    openInterestByInstId: new Map(openInterest.map((row: any) => [String(row.instId || ""), row])),
  };
}

function quoteVolumeUsd(ticker: any, lastPrice: number | null): number | null {
  const direct = numOrNull(ticker?.volCcyQuote ?? ticker?.volQuote24h ?? ticker?.quoteVol24h);
  if (direct !== null) return direct;
  const baseVol = numOrNull(ticker?.volCcy24h);
  if (baseVol !== null && lastPrice !== null) return baseVol * lastPrice;
  return null;
}

function preliminaryUniverse(maps: MarketMaps, options: Options): { token: string; instId: string; volumeUsd: number; oiUsd: number; listAgeDays: number | null }[] {
  const now = Date.now();
  return maps.instruments
    .filter(isCryptoUsdtSwap)
    .map((row) => {
      const instId = String(row.instId || "");
      const token = symbolFromInstId(instId);
      const ticker = maps.tickersByInstId.get(instId) || {};
      const oi = maps.openInterestByInstId.get(instId) || {};
      const last = numOrNull(ticker.last);
      const volumeUsd = quoteVolumeUsd(ticker, last) || 0;
      const oiUsd = numOrNull(oi.oiUsd) || 0;
      const listTime = numOrNull(row.listTime);
      const listAgeDays = listTime ? Math.max(0, (now - listTime) / 86_400_000) : null;
      return { token, instId, volumeUsd, oiUsd, listAgeDays };
    })
    .filter((row) => options.includeMajors || !isMajorOrStable(row.token))
    .filter((row) => row.volumeUsd >= options.minVolumeUsd || row.oiUsd >= options.minOiUsd)
    .sort((a, b) => (b.volumeUsd + b.oiUsd * 0.25) - (a.volumeUsd + a.oiUsd * 0.25))
    .slice(0, options.limit);
}

function writeOkxUniverse(universe: { token: string; instId: string; volumeUsd: number; oiUsd: number; listAgeDays: number | null }[], snapshotId: string): void {
  if (!existsSync(OKX_OUT_DIR)) mkdirSync(OKX_OUT_DIR, { recursive: true });
  const rows = [
    ["snapshot_id", "observed_at", "token", "inst_id", "volume_quote_24h", "oi_usd", "list_age_days"],
    ...universe.map((row) => [
      snapshotId,
      new Date().toISOString(),
      row.token,
      row.instId,
      row.volumeUsd,
      row.oiUsd,
      row.listAgeDays ?? "",
    ]),
  ];
  writeCsv(join(OKX_OUT_DIR, "okx_contract_universe_latest.csv"), rows);
  writeCsv(join(OKX_OUT_DIR, `okx_contract_universe_${snapshotId}.csv`), rows);
}

async function concurrentMap<T, U>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<U>): Promise<U[]> {
  const out = new Array<U>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

function parseCandles(rows: any[]): { ts: number; open: number; high: number; low: number; close: number; quoteVol: number }[] {
  return rows
    .map((row: any[]) => ({
      ts: num(row[0]),
      open: num(row[1]),
      high: num(row[2]),
      low: num(row[3]),
      close: num(row[4]),
      quoteVol: num(row[7] || row[6] || row[5]),
    }))
    .filter((row) => row.ts > 0 && row.close > 0)
    .sort((a, b) => a.ts - b.ts);
}

function returnFrom(candles: { close: number }[], barsBack: number): number | null {
  if (candles.length <= barsBack) return null;
  const last = candles[candles.length - 1]?.close;
  const prev = candles[candles.length - 1 - barsBack]?.close;
  if (!last || !prev) return null;
  return (last - prev) / prev;
}

function rangeFrom(candles: { high: number; low: number; close: number }[], barsBack: number): number | null {
  const recent = candles.slice(-barsBack);
  if (recent.length < Math.max(4, Math.floor(barsBack / 3))) return null;
  const high = Math.max(...recent.map((row) => row.high));
  const low = Math.min(...recent.map((row) => row.low));
  const last = recent[recent.length - 1]?.close;
  if (!last || high <= 0 || low <= 0) return null;
  return (high - low) / last;
}

function realizedVolatility(candles: { close: number }[], barsBack: number): number | null {
  const recent = candles.slice(-barsBack);
  if (recent.length < Math.max(8, Math.floor(barsBack / 2))) return null;
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].close;
    const current = recent[i].close;
    if (prev > 0 && current > 0) returns.push((current - prev) / prev);
  }
  return returns.length > 0 ? std(returns) : null;
}

function volumeZ(candles4h: { quoteVol: number }[]): number | null {
  const volumes = candles4h.map((row) => row.quoteVol).filter((value) => value > 0);
  if (volumes.length < 12) return null;
  const baseline = volumes.slice(0, -1);
  const avg = mean(baseline);
  const sigma = std(baseline);
  if (avg === null || sigma <= 0) return null;
  return (volumes[volumes.length - 1] - avg) / sigma;
}

function volumeAcceleration(candles4h: { quoteVol: number }[]): number | null {
  const lastDay = candles4h.slice(-6);
  const prev = candles4h.slice(-24, -6);
  if (lastDay.length < 3 || prev.length < 6) return null;
  const current = lastDay.reduce((sum, row) => sum + row.quoteVol, 0);
  const previousDailyAvg = prev.reduce((sum, row) => sum + row.quoteVol, 0) / Math.max(1, prev.length / 6);
  return previousDailyAvg > 0 ? current / previousDailyAvg : null;
}

function parseOiHistory(rows: any[]): { ts: number; oi: number }[] {
  return rows
    .map((row: any) => ({
      ts: num(Array.isArray(row) ? row[0] : row.ts),
      oi: num(Array.isArray(row) ? row[1] : row.oiUsd ?? row.oi),
    }))
    .filter((row) => row.ts > 0 && row.oi > 0)
    .sort((a, b) => a.ts - b.ts);
}

function oiChange(rows: { oi: number }[], barsBack: number): number | null {
  if (rows.length <= barsBack) return null;
  const last = rows[rows.length - 1].oi;
  const prev = rows[rows.length - 1 - barsBack].oi;
  return prev > 0 ? (last - prev) / prev : null;
}

function oiZScore(rows: { oi: number }[]): number | null {
  if (rows.length < 8) return null;
  const values = rows.map((row) => row.oi);
  const avg = mean(values);
  const sigma = std(values);
  if (avg === null || sigma <= 0) return null;
  return (values[values.length - 1] - avg) / sigma;
}

function parseFundingHistory(rows: any[]): { ts: number; rate: number }[] {
  return rows
    .map((row: any) => ({
      ts: num(row.fundingTime),
      rate: num(row.fundingRate),
    }))
    .filter((row) => row.ts > 0 && Number.isFinite(row.rate))
    .sort((a, b) => a.ts - b.ts);
}

function fundingZScore(rates: number[]): number | null {
  if (rates.length < 8) return null;
  const avg = mean(rates);
  const sigma = std(rates);
  if (avg === null || sigma <= 0) return null;
  return (rates[rates.length - 1] - avg) / sigma;
}

function spreadBps(bookRows: any[]): number | null {
  const row = bookRows[0] || {};
  const ask = num(row.asks?.[0]?.[0]);
  const bid = num(row.bids?.[0]?.[0]);
  if (ask <= 0 || bid <= 0) return null;
  const mid = (ask + bid) / 2;
  return ((ask - bid) / mid) * 10_000;
}

async function fetchMarketFeatures(item: { token: string; instId: string; listAgeDays: number | null }, maps: MarketMaps): Promise<OkxMarketFeatures> {
  const ticker = maps.tickersByInstId.get(item.instId) || {};
  const oi = maps.openInterestByInstId.get(item.instId) || {};
  const [candles1hRaw, candles4hRaw, oiRaw, fundingRaw, booksRaw, fundingLatestRaw, oiFallbackRaw] = await Promise.all([
    okxGet(`/market/candles?instId=${encodeURIComponent(item.instId)}&bar=1H&limit=73`),
    okxGet(`/market/candles?instId=${encodeURIComponent(item.instId)}&bar=4H&limit=50`),
    okxGet(`/rubik/stat/contracts/open-interest-history?instId=${encodeURIComponent(item.instId)}&period=1D&limit=30`),
    okxGet(`/public/funding-rate-history?instId=${encodeURIComponent(item.instId)}&limit=30`),
    okxGet(`/market/books?instId=${encodeURIComponent(item.instId)}&sz=5`),
    okxGet(`/public/funding-rate?instId=${encodeURIComponent(item.instId)}`),
    oi.oiUsd ? Promise.resolve([]) : okxGet(`/public/open-interest?instId=${encodeURIComponent(item.instId)}`),
  ]);

  const candles1h = parseCandles(candles1hRaw);
  const candles4h = parseCandles(candles4hRaw);
  const oiRows = parseOiHistory(oiRaw);
  const fundingRows = parseFundingHistory(fundingRaw);
  const fundingRates = fundingRows.map((row) => row.rate);
  const lastPrice = candles1h[candles1h.length - 1]?.close || numOrNull(ticker.last);
  const open24h = numOrNull(ticker.open24h);
  const high24h = numOrNull(ticker.high24h);
  const low24h = numOrNull(ticker.low24h);
  const fallbackReturn24h = lastPrice !== null && open24h !== null && open24h > 0 ? (lastPrice - open24h) / open24h : null;
  const fallbackRange24h = lastPrice !== null && high24h !== null && low24h !== null && high24h > 0 && low24h > 0 ? (high24h - low24h) / lastPrice : null;
  const volumeUsd = quoteVolumeUsd(ticker, lastPrice);
  const oiFallback = oiFallbackRaw[0] || {};
  const oiUsd = numOrNull(oi.oiUsd) ?? numOrNull(oiFallback.oiUsd);
  const fundingLatest = fundingRows[fundingRows.length - 1]?.rate ?? numOrNull(fundingLatestRaw[0]?.fundingRate);

  const qualitySignals = [
    candles1h.length >= 24 || fallbackReturn24h !== null,
    candles4h.length >= 18,
    oiRows.length >= 8 || oiUsd !== null,
    fundingRows.length >= 8 || fundingLatest !== null,
    spreadBps(booksRaw) !== null,
  ];
  const limitations: string[] = [];
  if (candles1h.length < 24) limitations.push("okx_1h_candle_history_short");
  if (candles4h.length < 18) limitations.push("okx_4h_candle_history_short");
  if (oiRows.length < 8 && oiUsd === null) limitations.push("okx_oi_history_missing");
  if (fundingRows.length < 8 && fundingLatest === null) limitations.push("okx_funding_history_missing");
  if (spreadBps(booksRaw) === null) limitations.push("okx_orderbook_spread_missing");

  return {
    token: item.token,
    instId: item.instId,
    listAgeDays: item.listAgeDays,
    lastPrice,
    spreadBps: spreadBps(booksRaw),
    return1h: returnFrom(candles1h, 1),
    return4h: returnFrom(candles1h, 4),
    return24h: returnFrom(candles1h, 24) ?? fallbackReturn24h,
    return3d: returnFrom(candles1h, 72),
    return7d: returnFrom(candles4h, 42),
    range3d: rangeFrom(candles1h, 72) ?? fallbackRange24h,
    volatility7d: realizedVolatility(candles4h, 42),
    volumeQuote24h: volumeUsd,
    volumeZ7d: volumeZ(candles4h),
    volumeAcceleration: volumeAcceleration(candles4h),
    oiUsd,
    oiChange1d: oiChange(oiRows, 1),
    oiChange7d: oiChange(oiRows, 7),
    oiZScore: oiZScore(oiRows),
    fundingLatest,
    fundingZScore: fundingZScore(fundingRates),
    dataQuality: qualitySignals.filter(Boolean).length / qualitySignals.length,
    limitations,
  };
}

function parseCgOiChange(value: string | undefined): number | null {
  const parsed = numOrNull(value);
  if (parsed === null) return null;
  if (Math.abs(parsed) > 10_000) return null;
  return parsed;
}

function buildAccumulationInput(
  market: OkxMarketFeatures,
  scanner: Obj | undefined,
  split: Obj | undefined,
  dex: Obj | undefined,
  coinglass: Obj | undefined,
  okxDerivatives: Obj | undefined,
  holder: Obj | undefined,
  directional: Obj | undefined,
): AccumulationEvidenceInput {
  return {
    token: market.token,
    observedAt: new Date().toISOString(),
    price: {
      return3d: market.return3d ?? numOrNull(dex?.return_3),
      range3d: market.range3d ?? numOrNull(dex?.range_3),
      volatility7d: market.volatility7d ?? numOrNull(dex?.volatility_7),
      compression: market.range3d !== null && market.range3d <= 0.14 ? true : bool(dex?.compression),
      expansion: market.return3d !== null && market.return3d > 0.25 ? true : bool(dex?.expansion),
      volumeZ7d: market.volumeZ7d ?? numOrNull(dex?.vol_zscore_7),
    },
    dex: {
      liquidityUsd: numOrNull(scanner?.total_dex_liquidity_usd),
      turnoverRatio: numOrNull(scanner?.token_level_dex_turnover),
      demandSupplyRatio: numOrNull(scanner?.buy_sell_ratio),
      poolVolumeZ: market.volumeZ7d ?? numOrNull(dex?.vol_zscore_7),
    },
    holders: {
      holderCoverage: numOrNull(holder?.holder_entity_coverage) ?? numOrNull(holder?.labeled_holder_ratio),
      top1Share: numOrNull(holder?.top1_holder_share),
      top10Share: numOrNull(holder?.top10_holder_share),
      topEntityShare: numOrNull(holder?.top_entity_holder_share),
      cexHolderRatio: numOrNull(holder?.cex_holder_ratio),
      unknownHolderRatio: numOrNull(holder?.unknown_holder_ratio),
      holderCountGrowth7d: null,
    },
    flows: {
      cex1hDecision: directional?.cex_1h_decision || "",
      cex4hDecision: directional?.cex_4h_decision || "",
      cex24hDecision: directional?.cex_24h_decision || "",
      netCex1hValue: numOrNull(directional?.net_cex_1h_value),
      netCex4hValue: numOrNull(directional?.net_cex_4h_value),
      netCex24hValue: numOrNull(directional?.net_cex_24h_value),
      entityCoverage: numOrNull(directional?.entity_label_coverage),
    },
    derivatives: {
      oiChange1d: market.oiChange1d ?? parseCgOiChange(coinglass?.oi_chg_1d) ?? numOrNull(okxDerivatives?.oi_change_1d),
      oiChange7d: market.oiChange7d ?? parseCgOiChange(coinglass?.oi_chg_7d) ?? numOrNull(okxDerivatives?.oi_change_7d),
      oiZ7d: market.oiZScore ?? numOrNull(coinglass?.oi_z_7d),
      fundingRate: market.fundingLatest ?? numOrNull(coinglass?.funding_rate_latest) ?? numOrNull(coinglass?.funding_oi_w) ?? numOrNull(okxDerivatives?.funding_rate),
      fundingZ7d: market.fundingZScore ?? numOrNull(coinglass?.funding_z_7d) ?? numOrNull(okxDerivatives?.funding_zscore),
      fundingOverheated: (market.fundingZScore !== null && Math.abs(market.fundingZScore) > 2.5) || bool(coinglass?.funding_overheated) === true || bool(okxDerivatives?.funding_extreme) === true,
      liquidationZ7d: numOrNull(coinglass?.liq_z_7d),
      longShortRatio: null,
    },
    scanner: {
      opportunityScore: numOrNull(split?.opportunity_score),
      fragilityScore: numOrNull(split?.fragility_score),
      tradabilityScore: numOrNull(split?.tradability_score),
      dataQualityScore: numOrNull(scanner?.data_quality_score),
    },
  };
}

export function computeExecutionScore(market: Pick<OkxMarketFeatures, "spreadBps" | "volumeQuote24h" | "oiUsd" | "dataQuality">): number {
  let score = 0;
  const spread = market.spreadBps;
  if (spread !== null) score += spread <= 8 ? 30 : spread <= 20 ? 22 : spread <= 50 ? 12 : 0;
  const volume = market.volumeQuote24h;
  if (volume !== null) score += volume >= 50_000_000 ? 30 : volume >= 10_000_000 ? 22 : volume >= 2_000_000 ? 12 : 0;
  const oi = market.oiUsd;
  if (oi !== null) score += oi >= 100_000_000 ? 25 : oi >= 20_000_000 ? 18 : oi >= 5_000_000 ? 10 : 0;
  score += market.dataQuality * 15;
  return clamp(score);
}

export function computeCexFlowGate(flows: AccumulationEvidenceInput["flows"] | undefined): CexFlowGate {
  if (!flows) return "MISSING_OR_WEAK";
  const decisions = [flows.cex1hDecision, flows.cex4hDecision, flows.cex24hDecision].filter(Boolean);
  if (decisions.some((decision) => decision === "CEX_INFLOW_RISK")) return "BLOCKED";

  const supports4h = flows.cex4hDecision === "CEX_OUTFLOW_OR_NEUTRAL";
  const supports24h = flows.cex24hDecision === "CEX_OUTFLOW_OR_NEUTRAL";
  const coverageOk = flows.entityCoverage === null || flows.entityCoverage === undefined || flows.entityCoverage >= 0.25;
  if (supports4h && supports24h && coverageOk) return "SUPPORTED";
  return "MISSING_OR_WEAK";
}

export function cexFlowScoreAdjustment(gate: CexFlowGate): number {
  if (gate === "SUPPORTED") return 6;
  if (gate === "BLOCKED") return -24;
  return -10;
}

function cexFlowRiskPenalty(gate: CexFlowGate): number {
  if (gate === "BLOCKED") return 22;
  if (gate === "MISSING_OR_WEAK") return 8;
  return 0;
}

export function classifyOkxAccumulation(input: {
  accumulationScore: number;
  riskScore: number;
  executionScore: number;
  dataQuality: number;
  label: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  cexFlowGate: CexFlowGate;
}): OkxAccumulationState {
  if (input.cexFlowGate === "BLOCKED" || input.label === "DISTRIBUTION_RISK" || input.riskScore >= 70) return "DISTRIBUTION_RISK";
  if (input.dataQuality < 0.45) return "MARKET_DATA_GAP";
  if (input.cexFlowGate !== "SUPPORTED") return "NO_EDGE";
  if (input.accumulationScore >= 65 && input.executionScore >= 55 && input.riskScore < 35 && input.confidence !== "LOW") return "READY_TO_WATCH";
  if (input.accumulationScore >= 45 && input.executionScore >= 40 && input.riskScore < 55) return "WAIT_CONFIRMATION";
  return "NO_EDGE";
}

function reviewFromDecision(market: OkxMarketFeatures, decision: AccumulationDecision, coinGecko: CoinGeckoContext, cexFlowGate: CexFlowGate): OkxAccumulationReview {
  const execution = computeExecutionScore(market);
  const contextPenalty = computeCoinGeckoContextPenalty(coinGecko);
  const cexFlowAdjustment = cexFlowScoreAdjustment(cexFlowGate);
  const marketSupport =
    (market.oiChange7d !== null && market.oiChange7d > 0 && market.oiChange7d < 0.75 ? 8 : 0) +
    (market.volumeAcceleration !== null && market.volumeAcceleration > 1.2 && market.volumeAcceleration < 4 ? 6 : 0) +
    (market.return7d !== null && market.return7d < 0.45 ? 4 : 0);
  const accumulationScore = clamp(decision.totalScore + marketSupport + cexFlowAdjustment - contextPenalty * 0.35);
  const riskScore = clamp(
    decision.riskPenalty +
    cexFlowRiskPenalty(cexFlowGate) +
    (market.fundingZScore !== null && Math.abs(market.fundingZScore) > 2.5 ? 18 : 0) +
    (market.return7d !== null && market.return7d > 0.75 ? 18 : 0) +
    (market.spreadBps !== null && market.spreadBps > 80 ? 12 : 0) +
    contextPenalty
  );
  const state = classifyOkxAccumulation({
    accumulationScore,
    riskScore,
    executionScore: execution,
    dataQuality: market.dataQuality,
    label: decision.label,
    confidence: decision.confidence,
    cexFlowGate,
  });
  const thesisByState: Record<OkxAccumulationState, string> = {
    READY_TO_WATCH: "multi-source accumulation evidence and CEX flow are strong enough for a research watchlist, pending price confirmation",
    WAIT_CONFIRMATION: "CEX flow supports the setup, but one or more non-flow confirmation layers still need fresh evidence",
    DISTRIBUTION_RISK: "risk evidence overrides long-side accumulation interpretation",
    MARKET_DATA_GAP: "OKX market history or execution data is too sparse for a contract thesis",
    NO_EDGE: "current evidence does not show a usable accumulation setup",
  };
  const invalidationByState: Record<OkxAccumulationState, string> = {
    READY_TO_WATCH: "invalidate if CEX inflow risk appears, funding overheats, or price loses the recent compression range",
    WAIT_CONFIRMATION: "invalidate if missing flow/holder evidence turns negative or OKX OI falls with weak price action",
    DISTRIBUTION_RISK: "do not upgrade until CEX/entity flow risk clears across the 4h and 24h windows",
    MARKET_DATA_GAP: "do not rank until candle, OI, funding, and spread coverage improves",
    NO_EDGE: "keep off the focused watchlist until new OI, CEX-flow, or DEX absorption evidence appears",
  };
  const nextByState: Record<OkxAccumulationState, string> = {
    READY_TO_WATCH: "watch for 24h range reclaim or low-volatility breakout with neutral funding",
    WAIT_CONFIRMATION: "rerun chain/holder flow and wait for fresh CVD/OI confirmation",
    DISTRIBUTION_RISK: "monitor as a risk case only",
    MARKET_DATA_GAP: "collect more OKX history and repair token metadata if needed",
    NO_EDGE: "broad watchlist only",
  };
  return {
    token: market.token,
    instId: market.instId,
    state,
    accumulationScore,
    riskScore,
    executionScore: execution,
    confidence: decision.confidence,
    decision,
    market,
    coinGecko,
    contextPenalty,
    cexFlowGate,
    cexFlowAdjustment,
    thesis: thesisByState[state],
    invalidation: invalidationByState[state],
    nextAction: [
      nextByState[state],
      cexFlowGate !== "SUPPORTED" && state !== "DISTRIBUTION_RISK" ? "repair or rerun chain CEX flow before promotion" : "",
      contextPenalty >= 10 && state !== "DISTRIBUTION_RISK" ? "require CoinGecko context review" : "",
    ].filter(Boolean).join("; "),
  };
}

function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return `${(value * 100).toFixed(2)}%`;
}

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function writeOutputs(reviews: OkxAccumulationReview[], snapshotId: string, options: Options, candidatesBeforeTargetFilter: number): void {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const sorted = [...reviews].sort((a, b) =>
    (b.accumulationScore + b.executionScore * 0.35 - b.riskScore * 0.65 - b.contextPenalty * 0.25) -
    (a.accumulationScore + a.executionScore * 0.35 - a.riskScore * 0.65 - a.contextPenalty * 0.25)
  );
  const featureRows = sorted.map((row) => [
    snapshotId,
    new Date().toISOString(),
    row.token,
    row.instId,
    row.state,
    row.accumulationScore,
    row.riskScore,
    row.executionScore,
    row.confidence,
    row.decision.label,
    row.decision.totalScore,
    row.decision.dataCompleteness.toFixed(4),
    row.coinGecko.resolutionStatus,
    row.coinGecko.coingeckoId,
    row.coinGecko.marketCapBucket,
    row.coinGecko.marketCap ?? "",
    row.coinGecko.fdvToMcap ?? "",
    row.coinGecko.volumeToMcap ?? "",
    row.coinGecko.primaryCategory,
    row.coinGecko.trendingRank ?? "",
    row.contextPenalty,
    row.cexFlowGate,
    row.cexFlowAdjustment,
    row.market.lastPrice ?? "",
    row.market.spreadBps ?? "",
    row.market.volumeQuote24h ?? "",
    row.market.oiUsd ?? "",
    row.market.return24h ?? "",
    row.market.return3d ?? "",
    row.market.return7d ?? "",
    row.market.range3d ?? "",
    row.market.volatility7d ?? "",
    row.market.volumeAcceleration ?? "",
    row.market.oiChange1d ?? "",
    row.market.oiChange7d ?? "",
    row.market.oiZScore ?? "",
    row.market.fundingLatest ?? "",
    row.market.fundingZScore ?? "",
    row.decision.evidenceGroups.join(";"),
    row.decision.missingGroups.join(";"),
    row.decision.positiveEvidence.join(";"),
    row.decision.riskEvidence.join(";"),
    row.market.limitations.join(";"),
    row.thesis,
    row.invalidation,
    row.nextAction,
  ]);

  writeCsv(join(OUT_DIR, "okx_accumulation_features_latest.csv"), [
    ["snapshot_id", "observed_at", "token", "inst_id", "state", "accumulation_score", "risk_score", "execution_score", "confidence", "base_label", "base_score", "data_completeness", "coingecko_status", "coingecko_id", "market_cap_bucket", "market_cap", "fdv_to_mcap", "volume_to_mcap", "primary_category", "trending_rank", "context_penalty", "cex_flow_gate", "cex_flow_adjustment", "last_price", "spread_bps", "volume_quote_24h", "oi_usd", "return_24h", "return_3d", "return_7d", "range_3d", "volatility_7d", "volume_acceleration", "oi_change_1d", "oi_change_7d", "oi_z", "funding_latest", "funding_z", "evidence_groups", "missing_groups", "positive_evidence", "risk_evidence", "market_limitations", "thesis", "invalidation", "next_action"],
    ...featureRows,
  ]);

  writeCsv(join(OUT_DIR, "okx_accumulation_watchlist_latest.csv"), [
    ["rank", "token", "inst_id", "state", "accumulation_score", "risk_score", "execution_score", "confidence", "market_cap_bucket", "market_cap", "category", "cex_flow_gate", "24h", "7d", "oi_7d", "funding", "volume_24h", "oi_usd", "evidence", "risk", "next_action"],
    ...sorted.map((row, index) => [
      index + 1,
      row.token,
      row.instId,
      row.state,
      row.accumulationScore,
      row.riskScore,
      row.executionScore,
      row.confidence,
      row.coinGecko.marketCapBucket,
      row.coinGecko.marketCap ?? "",
      row.coinGecko.primaryCategory,
      row.cexFlowGate,
      pct(row.market.return24h),
      pct(row.market.return7d),
      pct(row.market.oiChange7d),
      pct(row.market.fundingLatest),
      row.market.volumeQuote24h ?? "",
      row.market.oiUsd ?? "",
      row.decision.positiveEvidence.join(";"),
      row.decision.riskEvidence.join(";"),
      row.nextAction,
    ]),
  ]);

  writeCsv(join(OUT_DIR, `okx_accumulation_features_${snapshotId}.csv`), [
    ["snapshot_id", "observed_at", "token", "inst_id", "state", "accumulation_score", "risk_score", "execution_score", "confidence", "base_label", "base_score", "data_completeness", "coingecko_status", "coingecko_id", "market_cap_bucket", "market_cap", "fdv_to_mcap", "volume_to_mcap", "primary_category", "trending_rank", "context_penalty", "cex_flow_gate", "cex_flow_adjustment", "last_price", "spread_bps", "volume_quote_24h", "oi_usd", "return_24h", "return_3d", "return_7d", "range_3d", "volatility_7d", "volume_acceleration", "oi_change_1d", "oi_change_7d", "oi_z", "funding_latest", "funding_z", "evidence_groups", "missing_groups", "positive_evidence", "risk_evidence", "market_limitations", "thesis", "invalidation", "next_action"],
    ...featureRows,
  ]);

  const focused = sorted.filter((row) => row.state === "READY_TO_WATCH" || row.state === "WAIT_CONFIRMATION").slice(0, 12);
  const displayed = focused.length > 0 ? focused : sorted.slice(0, 12);
  const report = [
    "# OKX Accumulation Scan",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Snapshot: ${snapshotId}`,
    `Target cap: ${options.targetCap}`,
    `Candidate rows before target filter: ${candidatesBeforeTargetFilter}`,
    `Reviewed rows after target filter: ${sorted.length}`,
    "",
    "Research-only output. This report does not authorize order placement.",
    "",
    focused.length > 0 ? "## Focused Watchlist" : "## Top Ranked Review (No Focused Watchlist Yet)",
    "",
    "| rank | token | state | acc | risk | exec | conf | bucket | mcap | category | cex_flow | 24h | 7d | oi_7d | funding | vol | oi | next |",
    "| ---: | --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...displayed.map((row, index) =>
      `| ${index + 1} | ${row.token} | ${row.state} | ${row.accumulationScore} | ${row.riskScore} | ${row.executionScore} | ${row.confidence} | ${row.coinGecko.marketCapBucket} | ${money(row.coinGecko.marketCap)} | ${row.coinGecko.primaryCategory} | ${row.cexFlowGate} | ${pct(row.market.return24h)} | ${pct(row.market.return7d)} | ${pct(row.market.oiChange7d)} | ${pct(row.market.fundingLatest)} | ${money(row.market.volumeQuote24h)} | ${money(row.market.oiUsd)} | ${row.nextAction} |`
    ),
    "",
    "## State Counts",
    "",
    ...Object.entries(sorted.reduce<Record<string, number>>((acc, row) => {
      acc[row.state] = (acc[row.state] || 0) + 1;
      return acc;
    }, {})).map(([state, count]) => `- ${state}: ${count}`),
    "",
    "## Notes",
    "",
    "- READY_TO_WATCH requires positive accumulation evidence, acceptable execution, and low risk.",
    "- WAIT_CONFIRMATION requires supported CEX flow; missing or weak flow cannot enter the focused watchlist.",
    "- DISTRIBUTION_RISK overrides attractive market structure.",
    "- MARKET_DATA_GAP means OKX market data is too sparse for a contract thesis.",
  ].join("\n");
  writeCsv(join(OUT_DIR, "okx_accumulation_state_counts_latest.csv"), [
    ["state", "count"],
    ...Object.entries(sorted.reduce<Record<string, number>>((acc, row) => {
      acc[row.state] = (acc[row.state] || 0) + 1;
      return acc;
    }, {})),
  ]);
  writeCsv(join(OUT_DIR, "okx_accumulation_watchlist_top_latest.csv"), [
    ["token", "state", "accumulation_score", "risk_score", "execution_score", "market_cap_bucket", "market_cap", "category", "cex_flow_gate", "thesis", "invalidation", "next_action"],
    ...focused.map((row) => [row.token, row.state, row.accumulationScore, row.riskScore, row.executionScore, row.coinGecko.marketCapBucket, row.coinGecko.marketCap ?? "", row.coinGecko.primaryCategory, row.cexFlowGate, row.thesis, row.invalidation, row.nextAction]),
  ]);
  writeFileSync(join(REPORTS_DIR, "okx_accumulation_scan_latest.md"), report, "utf-8");
}

async function main(): Promise<void> {
  loadDotenvOnce();
  const options = parseArgs();
  const snapshotId = new Date().toISOString().replace(/[:.]/g, "-");
  console.log("=== OKX Accumulation Scan ===");
  console.log(`limit=${options.limit} minVolume=${options.minVolumeUsd} minOi=${options.minOiUsd} targetCap=${options.targetCap}`);

  const maps = await fetchMarketMaps();
  const candidateUniverse = preliminaryUniverse(maps, { ...options, limit: targetUniverseLimit(options) });
  writeOkxUniverse(candidateUniverse, snapshotId);
  console.log(`Universe selected: ${candidateUniverse.length}`);

  const scanner = mapByToken(rowsToObjects(SCANNER_PATH));
  const split = mapByToken(rowsToObjects(SCORE_SPLIT_PATH));
  const dex = mapByToken(rowsToObjects(DEX_HISTORY_PATH));
  const coinglass = mergeTokenMaps(rowsToObjects(COINGLASS_OKX_UNIVERSE_PATH), rowsToObjects(COINGLASS_PATH));
  const coinGecko = mapByToken(rowsToObjects(COINGECKO_OKX_UNIVERSE_PATH));
  const okxDerivatives = mapByToken(rowsToObjects(OKX_DERIVATIVES_PATH));
  const holder = mapByToken(rowsToObjects(HOLDER_PATH));
  const directional = mapByToken(rowsToObjects(DIRECTIONAL_PATH));
  const targetRows = candidateUniverse
    .filter((row) => targetCapMatches(options.targetCap, coinGeckoContextFromRow(coinGecko.get(row.token.toUpperCase()))));
  const universe = targetRows.slice(0, targetReviewLimit(options));
  console.log(`Target universe: ${universe.length}/${candidateUniverse.length} target rows=${targetRows.length}`);

  const marketFeatures = await concurrentMap(universe, 2, async (row) => fetchMarketFeatures(row, maps));
  const allReviews = marketFeatures.map((market) => {
    const token = market.token.toUpperCase();
    const input = buildAccumulationInput(
      market,
      scanner.get(token),
      split.get(token),
      dex.get(token),
      coinglass.get(token),
      okxDerivatives.get(token),
      holder.get(token),
      directional.get(token),
    );
    return reviewFromDecision(
      market,
      detectAccumulationPattern(input),
      coinGeckoContextFromRow(coinGecko.get(token)),
      computeCexFlowGate(input.flows),
    );
  });
  const reviews = allReviews.filter((row) => targetCapMatches(options.targetCap, row.coinGecko));

  writeOutputs(reviews, snapshotId, options, candidateUniverse.length);
  const focusCount = reviews.filter((row) => row.state === "READY_TO_WATCH" || row.state === "WAIT_CONFIRMATION").length;
  console.log(`Reviews: ${reviews.length}/${candidateUniverse.length} after target cap filter | focused=${focusCount}`);
  console.log(`Output: ${join(OUT_DIR, "okx_accumulation_watchlist_latest.csv")}`);
  console.log(`Report: ${join(REPORTS_DIR, "okx_accumulation_scan_latest.md")}`);
}

const isMain = process.argv[1]?.includes("okx_accumulation_scan");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
