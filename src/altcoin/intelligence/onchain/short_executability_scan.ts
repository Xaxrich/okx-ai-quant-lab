import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";
import { fetchJsonWithFallback } from "../../../utils/http.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const ONCHAIN_DIR = join(ROOT, "data", "altcoin", "intelligence", "onchain");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "onchain");
const DIRECTIONAL_PATH = join(ONCHAIN_DIR, "directional_chain_scan_latest.csv");
const OKX_BASE = "https://www.okx.com/api/v5";
const CG_BASE = "https://open-api-v4.coinglass.com";
const COINGLASS_LIQUIDATION_EXCHANGES = "Binance,OKX,Bybit,KuCoin,Bitget,BingX,Gate";

export type ShortExecutionDecision =
  | "SHORT_EXEC_READY"
  | "SHORT_WATCH_ONLY"
  | "BLOCKED_NO_SWAP"
  | "BLOCKED_THIN_BOOK"
  | "BLOCKED_DATA"
  | "NOT_SHORT_CANDIDATE";

export type CoinGlassTrend =
  | "CROWDED_LONGS"
  | "OI_RISING_FUNDING_POSITIVE"
  | "OI_FLAT_FUNDING_POSITIVE"
  | "DELEVERAGING"
  | "SHORT_CROWDED_OR_NEGATIVE_FUNDING"
  | "NEUTRAL"
  | "DATA_INCOMPLETE";

interface DirectionalRow {
  token: string;
  priority: string;
  chain: string;
  contract_address: string;
  opportunity_score: string;
  fragility_score: string;
  tradability_score: string;
  primary_direction: string;
  short_bucket: string;
  confidence: string;
  short_reason: string;
}

interface OkxSnapshot {
  instId: string;
  swapStatus: string;
  swapAvailable: boolean;
  swapState: string;
  maxLeverage: number;
  ctVal: number;
  ctValCcy: string;
  marginStatus: string;
  marginPairAvailable: boolean;
  fundingStatus: string;
  okxFundingRate: number | null;
  okxFundingPositiveStreak: number;
  oiStatus: string;
  okxOiUsd: number | null;
  bookStatus: string;
  bestBid: number | null;
  bestAsk: number | null;
  spreadBps: number | null;
  bidDepth1PctUsd: number | null;
  askDepth1PctUsd: number | null;
}

interface CoinGlassSnapshot {
  status: string;
  trend: CoinGlassTrend;
  oiUsd: number | null;
  oiChange4h: number | null;
  oiChange24h: number | null;
  oiChange24hPct: number | null;
  fundingOiWeighted: number | null;
  fundingPercent: number | null;
  fundingZscore: number | null;
  fundingPositiveStreak: number;
  longLiq4hUsd: number | null;
  shortLiq4hUsd: number | null;
  liqImbalance4h: number | null;
  okxOiShare: number | null;
  top3OiShare: number | null;
  growingExchanges1h: number;
  shrinkingExchanges1h: number;
}

export interface ShortExecutabilityInput {
  shortBucket: string;
  swapAvailable: boolean;
  swapState: string;
  maxLeverage: number;
  spreadBps: number | null;
  bidDepth1PctUsd: number | null;
  okxOiUsd: number | null;
  okxFundingRate: number | null;
  coinGlassTrend: CoinGlassTrend;
  cgFundingPercent: number | null;
  cgOiChange24hPct: number | null;
}

export interface ShortExecutabilityDecision {
  decision: ShortExecutionDecision;
  score: number;
  reason: string;
  action: string;
  blockers: string;
}

function loadDotenv(): void {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [name, valueRaw] = line.split(/=(.*)/s);
    if (!name || process.env[name]) continue;
    process.env[name] = (valueRaw || "").trim().replace(/^["']|["']$/g, "");
  }
}

function rowsToObjects<T extends object>(path: string): T[] {
  const csv = readCsv(path);
  if (!csv) return [];
  return csv.rows.map((row) => {
    const out: Record<string, string> = {};
    csv.h.forEach((header, index) => {
      out[header] = row[index] || "";
    });
    return out as T;
  });
}

function num(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function numOrNull(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<{ status: string; data: any }> {
  try {
    const response = await fetchJsonWithFallback(url, { headers: headers || { Accept: "application/json" } });
    if (response.status < 200 || response.status >= 300) return { status: `HTTP_${response.status}`, data: response.body };
    return { status: "OK", data: response.body };
  } catch (err) {
    return { status: err instanceof Error ? `ERROR_${err.message}` : "ERROR", data: null };
  }
}

async function okxGet(path: string): Promise<{ status: string; data: any[]; raw: any }> {
  const response = await fetchJson(`${OKX_BASE}${path}`);
  if (response.status !== "OK") return { status: response.status, data: [], raw: response.data };
  const code = String(response.data?.code ?? "");
  const data = Array.isArray(response.data?.data) ? response.data.data : [];
  return { status: code === "0" ? "OK" : `OKX_${code || "UNKNOWN"}`, data, raw: response.data };
}

async function cgGet(path: string): Promise<{ status: string; data: any[]; raw: any }> {
  const key = process.env.COINGLASS_API_KEY || "";
  if (!key) return { status: "COINGLASS_NOT_CONFIGURED", data: [], raw: null };
  const response = await fetchJson(`${CG_BASE}${path}`, { "CG-API-KEY": key, Accept: "application/json" });
  if (response.status !== "OK") return { status: response.status, data: [], raw: response.data };
  const data = Array.isArray(response.data?.data) ? response.data.data : [];
  const code = String(response.data?.code ?? "0");
  return { status: code === "0" ? "OK" : `COINGLASS_${code}`, data, raw: response.data };
}

function notionalUsd(price: number, size: number, ctVal: number, ctValCcy: string): number {
  if (ctValCcy.toUpperCase().includes("USDT") || ctValCcy.toUpperCase().includes("USD")) return size * ctVal;
  return price * size * ctVal;
}

function depthWithin(rows: any[], side: "bid" | "ask", mid: number, ctVal: number, ctValCcy: string): number {
  const limit = side === "bid" ? mid * 0.99 : mid * 1.01;
  return rows.reduce((sum, row) => {
    const price = num(row[0]);
    const size = num(row[1]);
    if (price <= 0 || size <= 0) return sum;
    if (side === "bid" && price < limit) return sum;
    if (side === "ask" && price > limit) return sum;
    return sum + notionalUsd(price, size, ctVal, ctValCcy);
  }, 0);
}

async function fetchOkxSnapshot(token: string): Promise<OkxSnapshot> {
  const instId = `${token}-USDT-SWAP`;
  const spotId = `${token}-USDT`;
  const base: OkxSnapshot = {
    instId,
    swapStatus: "NOT_FETCHED",
    swapAvailable: false,
    swapState: "",
    maxLeverage: 0,
    ctVal: 1,
    ctValCcy: token,
    marginStatus: "NOT_FETCHED",
    marginPairAvailable: false,
    fundingStatus: "NOT_FETCHED",
    okxFundingRate: null,
    okxFundingPositiveStreak: 0,
    oiStatus: "NOT_FETCHED",
    okxOiUsd: null,
    bookStatus: "NOT_FETCHED",
    bestBid: null,
    bestAsk: null,
    spreadBps: null,
    bidDepth1PctUsd: null,
    askDepth1PctUsd: null,
  };

  const inst = await okxGet(`/public/instruments?instType=SWAP&instId=${encodeURIComponent(instId)}`);
  base.swapStatus = inst.status;
  const instrument = inst.data[0];
  if (inst.status === "OK" && instrument) {
    base.swapAvailable = instrument.state === "live";
    base.swapState = String(instrument.state || "");
    base.maxLeverage = num(instrument.lever);
    base.ctVal = num(instrument.ctVal) || 1;
    base.ctValCcy = String(instrument.ctValCcy || token);
  }

  const margin = await okxGet(`/public/instruments?instType=MARGIN&instId=${encodeURIComponent(spotId)}`);
  base.marginStatus = margin.status;
  base.marginPairAvailable = margin.status === "OK" && Boolean(margin.data[0]);

  const funding = await okxGet(`/public/funding-rate?instId=${encodeURIComponent(instId)}`);
  base.fundingStatus = funding.status;
  if (funding.status === "OK" && funding.data[0]) base.okxFundingRate = numOrNull(funding.data[0].fundingRate);

  const fundingHistory = await okxGet(`/public/funding-rate-history?instId=${encodeURIComponent(instId)}&limit=12`);
  if (fundingHistory.status === "OK") {
    const rates = fundingHistory.data.map((row) => num(row.fundingRate)).filter((value) => Number.isFinite(value));
    base.okxFundingPositiveStreak = 0;
    for (let i = 0; i < rates.length && rates[i] > 0; i++) base.okxFundingPositiveStreak += 1;
  }

  const oi = await okxGet(`/public/open-interest?instType=SWAP&instId=${encodeURIComponent(instId)}`);
  base.oiStatus = oi.status;
  if (oi.status === "OK" && oi.data[0]) base.okxOiUsd = numOrNull(oi.data[0].oiUsd);

  const book = await okxGet(`/market/books?instId=${encodeURIComponent(instId)}&sz=50`);
  base.bookStatus = book.status;
  const bookRow = book.data[0];
  const bids = Array.isArray(bookRow?.bids) ? bookRow.bids : [];
  const asks = Array.isArray(bookRow?.asks) ? bookRow.asks : [];
  if (book.status === "OK" && bids.length > 0 && asks.length > 0) {
    base.bestBid = numOrNull(bids[0][0]);
    base.bestAsk = numOrNull(asks[0][0]);
    if (base.bestBid !== null && base.bestAsk !== null && base.bestBid > 0 && base.bestAsk > 0) {
      const mid = (base.bestBid + base.bestAsk) / 2;
      base.spreadBps = ((base.bestAsk - base.bestBid) / mid) * 10000;
      base.bidDepth1PctUsd = depthWithin(bids, "bid", mid, base.ctVal, base.ctValCcy);
      base.askDepth1PctUsd = depthWithin(asks, "ask", mid, base.ctVal, base.ctValCcy);
    }
  }

  return base;
}

function valueAt(row: any, key: string): number | null {
  if (!row || !(key in row)) return null;
  return numOrNull(row[key]);
}

function latestOhlcClose(rows: any[]): number | null {
  const sorted = [...rows].sort((a, b) => num(a.time) - num(b.time));
  const latest = sorted[sorted.length - 1];
  return valueAt(latest, "close");
}

function changeFrom(rows: any[], barsBack: number): number | null {
  const sorted = [...rows].sort((a, b) => num(a.time) - num(b.time));
  if (sorted.length < barsBack + 1) return null;
  const latest = valueAt(sorted[sorted.length - 1], "close");
  const prev = valueAt(sorted[sorted.length - 1 - barsBack], "close");
  if (latest === null || prev === null) return null;
  return latest - prev;
}

function zscoreLatest(rows: any[]): number | null {
  const values = rows.map((row) => valueAt(row, "close")).filter((value): value is number => value !== null);
  if (values.length < 3) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  if (std <= 0) return null;
  return (values[values.length - 1] - mean) / std;
}

function positiveStreak(rows: any[]): number {
  const sorted = [...rows].sort((a, b) => num(a.time) - num(b.time));
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const value = valueAt(sorted[i], "close");
    if (value === null || value <= 0) break;
    streak += 1;
  }
  return streak;
}

function classifyCoinGlassTrend(input: Pick<CoinGlassSnapshot, "oiChange24hPct" | "fundingPercent" | "fundingZscore">): CoinGlassTrend {
  if (input.oiChange24hPct === null || input.fundingPercent === null) return "DATA_INCOMPLETE";
  if (input.fundingPercent < 0) return "SHORT_CROWDED_OR_NEGATIVE_FUNDING";
  if (input.oiChange24hPct <= -5) return "DELEVERAGING";
  if (input.oiChange24hPct >= 5 && input.fundingPercent > 0.05) return "CROWDED_LONGS";
  if (input.oiChange24hPct >= 2 && input.fundingPercent > 0) return "OI_RISING_FUNDING_POSITIVE";
  if (Math.abs(input.oiChange24hPct) < 2 && input.fundingPercent > 0) return "OI_FLAT_FUNDING_POSITIVE";
  return "NEUTRAL";
}

async function fetchCoinGlassSnapshot(token: string): Promise<CoinGlassSnapshot> {
  const base: CoinGlassSnapshot = {
    status: "NOT_FETCHED",
    trend: "DATA_INCOMPLETE",
    oiUsd: null,
    oiChange4h: null,
    oiChange24h: null,
    oiChange24hPct: null,
    fundingOiWeighted: null,
    fundingPercent: null,
    fundingZscore: null,
    fundingPositiveStreak: 0,
    longLiq4hUsd: null,
    shortLiq4hUsd: null,
    liqImbalance4h: null,
    okxOiShare: null,
    top3OiShare: null,
    growingExchanges1h: 0,
    shrinkingExchanges1h: 0,
  };

  const oi = await cgGet(`/api/futures/open-interest/aggregated-history?symbol=${encodeURIComponent(token)}&interval=4h&limit=12&unit=usd`);
  const funding = await cgGet(`/api/futures/funding-rate/oi-weight-history?symbol=${encodeURIComponent(token)}&interval=4h&limit=12`);
  const liquidation = await cgGet(`/api/futures/liquidation/aggregated-history?symbol=${encodeURIComponent(token)}&interval=4h&limit=6&exchange_list=${encodeURIComponent(COINGLASS_LIQUIDATION_EXCHANGES)}`);
  const exchanges = await cgGet(`/api/futures/open-interest/exchange-list?symbol=${encodeURIComponent(token)}`);

  base.status = [oi.status, funding.status, liquidation.status, exchanges.status].join("|");
  if (oi.status === "OK") {
    base.oiUsd = latestOhlcClose(oi.data);
    base.oiChange4h = changeFrom(oi.data, 1);
    base.oiChange24h = changeFrom(oi.data, 6);
    if (base.oiUsd !== null && base.oiChange24h !== null && base.oiUsd - base.oiChange24h > 0) {
      base.oiChange24hPct = base.oiChange24h / (base.oiUsd - base.oiChange24h) * 100;
    }
  }
  if (funding.status === "OK") {
    base.fundingOiWeighted = latestOhlcClose(funding.data);
    base.fundingPercent = base.fundingOiWeighted === null ? null : base.fundingOiWeighted * 100;
    base.fundingZscore = zscoreLatest(funding.data);
    base.fundingPositiveStreak = positiveStreak(funding.data);
  }
  if (liquidation.status === "OK" && liquidation.data.length > 0) {
    const sorted = [...liquidation.data].sort((a, b) => num(a.time) - num(b.time));
    const latest = sorted[sorted.length - 1];
    base.longLiq4hUsd = numOrNull(latest.aggregated_long_liquidation_usd);
    base.shortLiq4hUsd = numOrNull(latest.aggregated_short_liquidation_usd);
    const total = (base.longLiq4hUsd ?? 0) + (base.shortLiq4hUsd ?? 0);
    base.liqImbalance4h = total > 0 ? ((base.longLiq4hUsd ?? 0) - (base.shortLiq4hUsd ?? 0)) / total : null;
  }
  if (exchanges.status === "OK") {
    const rows = exchanges.data.filter((row) => String(row.exchange || "").toLowerCase() !== "all");
    const total = rows.reduce((sum, row) => sum + num(row.open_interest_usd), 0);
    const sorted = [...rows].sort((a, b) => num(b.open_interest_usd) - num(a.open_interest_usd));
    if (total > 0) {
      const okx = rows.find((row) => String(row.exchange || "").toLowerCase() === "okx");
      base.okxOiShare = okx ? num(okx.open_interest_usd) / total : 0;
      base.top3OiShare = sorted.slice(0, 3).reduce((sum, row) => sum + num(row.open_interest_usd), 0) / total;
    }
    base.growingExchanges1h = rows.filter((row) => num(row.open_interest_change_percent_1h) > 0).length;
    base.shrinkingExchanges1h = rows.filter((row) => num(row.open_interest_change_percent_1h) < 0).length;
  }
  base.trend = classifyCoinGlassTrend(base);
  return base;
}

export function decideShortExecutability(input: ShortExecutabilityInput): ShortExecutabilityDecision {
  if (input.shortBucket === "NO_SHORT") {
    return { decision: "NOT_SHORT_CANDIDATE", score: 0, reason: "directional scan did not produce a short bucket", action: "skip short execution checks", blockers: "" };
  }
  if (!input.swapAvailable || input.swapState !== "live") {
    return { decision: "BLOCKED_NO_SWAP", score: 0, reason: "OKX USDT swap is not live", action: "do not short through OKX", blockers: "NO_OKX_SWAP" };
  }

  const blockers: string[] = [];
  let score = 25;
  if (input.maxLeverage >= 5) score += 10;
  else blockers.push("LOW_OR_UNKNOWN_LEVERAGE");

  if (input.spreadBps === null || input.bidDepth1PctUsd === null) {
    blockers.push("BOOK_DATA_MISSING");
  } else if (input.spreadBps <= 15 && input.bidDepth1PctUsd >= 50_000) {
    score += 25;
  } else if (input.spreadBps <= 30 && input.bidDepth1PctUsd >= 10_000) {
    score += 12;
  } else {
    blockers.push("THIN_OR_WIDE_BOOK");
  }

  if ((input.okxOiUsd ?? 0) >= 1_000_000) score += 10;
  else blockers.push("LOW_OKX_OI");

  if ((input.okxFundingRate ?? 0) > 0) score += 5;
  if ((input.cgFundingPercent ?? 0) > 0) score += 5;

  const cgSupportsShort = input.coinGlassTrend === "CROWDED_LONGS" || input.coinGlassTrend === "OI_RISING_FUNDING_POSITIVE" || input.coinGlassTrend === "OI_FLAT_FUNDING_POSITIVE";
  const cgAgainstShort = input.coinGlassTrend === "DELEVERAGING" || input.coinGlassTrend === "SHORT_CROWDED_OR_NEGATIVE_FUNDING";
  if (cgSupportsShort) score += input.coinGlassTrend === "CROWDED_LONGS" ? 20 : 12;
  if (cgAgainstShort) blockers.push("COINGLASS_AGAINST_SHORT");
  if (input.cgOiChange24hPct === null) blockers.push("COINGLASS_OI_INCOMPLETE");

  if (input.spreadBps !== null && input.bidDepth1PctUsd !== null && (input.spreadBps > 30 || input.bidDepth1PctUsd < 10_000)) {
    return { decision: "BLOCKED_THIN_BOOK", score, reason: "OKX book is too thin or spread is too wide for reliable short execution", action: "watch only; require deeper book before execution", blockers: blockers.join(";") };
  }
  if (blockers.includes("BOOK_DATA_MISSING")) {
    return { decision: "BLOCKED_DATA", score, reason: "execution book data is incomplete", action: "retry OKX book check", blockers: blockers.join(";") };
  }
  if (input.shortBucket === "SHORT_SETUP" && score >= 70 && !cgAgainstShort) {
    return { decision: "SHORT_EXEC_READY", score, reason: "OKX swap/book/funding are usable and CoinGlass trend does not oppose the short thesis", action: "eligible for pre-trade review: confirm risk, funding, stop, and position size", blockers: blockers.join(";") };
  }
  return { decision: "SHORT_WATCH_ONLY", score, reason: blockers.length > 0 ? `execution support is incomplete: ${blockers.join("; ")}` : "short evidence is not strong enough for execution-ready status", action: "keep on short watchlist; do not auto-approve short", blockers: blockers.join(";") };
}

function fmt(value: number | null, digits = 2): string {
  return value === null ? "" : value.toFixed(digits);
}

function buildReport(rows: any[]): string {
  const lines = [
    "# Short Executability Scan",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| token | decision | score | OKX swap | lev | spread bps | bid depth 1% | OKX funding | CG trend | CG funding | CG OI 24h | action |",
    "| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |",
  ];
  for (const row of rows) {
    lines.push(`| ${row.token} | ${row.decision} | ${row.execution_score} | ${row.okx_swap_state} | ${row.okx_max_leverage} | ${row.okx_spread_bps} | ${row.okx_bid_depth_1pct_usd} | ${row.okx_funding_rate} | ${row.coinglass_trend} | ${row.coinglass_funding_percent} | ${row.coinglass_oi_change_24h_pct} | ${row.action} |`);
  }
  lines.push(
    "",
    "## Limits",
    "",
    "- This is an execution-readiness scan, not an order approval.",
    "- Public OKX data can confirm swap and margin-pair availability, but not private borrow quota.",
    `- CoinGlass OI/funding are aggregate derivatives context; liquidation uses a major-exchange basket: ${COINGLASS_LIQUIDATION_EXCHANGES}.`,
    "- Positive funding and rising OI indicate crowding pressure; they do not prove immediate reversal timing.",
  );
  return lines.join("\n");
}

async function main() {
  loadDotenv();
  if (!existsSync(ONCHAIN_DIR)) mkdirSync(ONCHAIN_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const directional = rowsToObjects<DirectionalRow>(DIRECTIONAL_PATH);
  const outputRows = [];

  for (const row of directional) {
    const okx = await fetchOkxSnapshot(row.token);
    const cg = await fetchCoinGlassSnapshot(row.token);
    const decision = decideShortExecutability({
      shortBucket: row.short_bucket,
      swapAvailable: okx.swapAvailable,
      swapState: okx.swapState,
      maxLeverage: okx.maxLeverage,
      spreadBps: okx.spreadBps,
      bidDepth1PctUsd: okx.bidDepth1PctUsd,
      okxOiUsd: okx.okxOiUsd,
      okxFundingRate: okx.okxFundingRate,
      coinGlassTrend: cg.trend,
      cgFundingPercent: cg.fundingPercent,
      cgOiChange24hPct: cg.oiChange24hPct,
    });

    outputRows.push({
      token: row.token,
      primary_direction: row.primary_direction,
      short_bucket: row.short_bucket,
      directional_confidence: row.confidence,
      okx_inst_id: okx.instId,
      okx_swap_status: okx.swapStatus,
      okx_swap_state: okx.swapState,
      okx_max_leverage: okx.maxLeverage,
      okx_margin_status: okx.marginStatus,
      okx_margin_pair_available: okx.marginPairAvailable,
      borrow_status: okx.marginPairAvailable ? "MARGIN_PAIR_PUBLIC" : "NEEDS_PRIVATE_ACCOUNT_CHECK",
      okx_funding_status: okx.fundingStatus,
      okx_funding_rate: fmt(okx.okxFundingRate, 8),
      okx_funding_positive_streak: okx.okxFundingPositiveStreak,
      okx_oi_status: okx.oiStatus,
      okx_oi_usd: fmt(okx.okxOiUsd, 2),
      okx_book_status: okx.bookStatus,
      okx_best_bid: fmt(okx.bestBid, 8),
      okx_best_ask: fmt(okx.bestAsk, 8),
      okx_spread_bps: fmt(okx.spreadBps, 2),
      okx_bid_depth_1pct_usd: fmt(okx.bidDepth1PctUsd, 2),
      okx_ask_depth_1pct_usd: fmt(okx.askDepth1PctUsd, 2),
      coinglass_status: cg.status,
      coinglass_liquidation_scope: COINGLASS_LIQUIDATION_EXCHANGES,
      coinglass_trend: cg.trend,
      coinglass_oi_usd: fmt(cg.oiUsd, 2),
      coinglass_oi_change_4h: fmt(cg.oiChange4h, 2),
      coinglass_oi_change_24h: fmt(cg.oiChange24h, 2),
      coinglass_oi_change_24h_pct: fmt(cg.oiChange24hPct, 2),
      coinglass_funding_oi_weighted: fmt(cg.fundingOiWeighted, 8),
      coinglass_funding_percent: fmt(cg.fundingPercent, 4),
      coinglass_funding_zscore: fmt(cg.fundingZscore, 2),
      coinglass_funding_positive_streak: cg.fundingPositiveStreak,
      coinglass_long_liq_4h_usd: fmt(cg.longLiq4hUsd, 2),
      coinglass_short_liq_4h_usd: fmt(cg.shortLiq4hUsd, 2),
      coinglass_liq_imbalance_4h: fmt(cg.liqImbalance4h, 4),
      coinglass_okx_oi_share: fmt(cg.okxOiShare, 4),
      coinglass_top3_oi_share: fmt(cg.top3OiShare, 4),
      coinglass_growing_exchanges_1h: cg.growingExchanges1h,
      coinglass_shrinking_exchanges_1h: cg.shrinkingExchanges1h,
      decision: decision.decision,
      execution_score: decision.score,
      reason: decision.reason,
      action: decision.action,
      blockers: decision.blockers,
    });
  }

  const outPath = join(ONCHAIN_DIR, "short_executability_latest.csv");
  const reportPath = join(REPORTS_DIR, "short_executability_latest.md");
  writeCsv(outPath, [
    ["checked_at", "token", "primary_direction", "short_bucket", "directional_confidence", "okx_inst_id", "okx_swap_status", "okx_swap_state", "okx_max_leverage", "okx_margin_status", "okx_margin_pair_available", "borrow_status", "okx_funding_status", "okx_funding_rate", "okx_funding_positive_streak", "okx_oi_status", "okx_oi_usd", "okx_book_status", "okx_best_bid", "okx_best_ask", "okx_spread_bps", "okx_bid_depth_1pct_usd", "okx_ask_depth_1pct_usd", "coinglass_status", "coinglass_liquidation_scope", "coinglass_trend", "coinglass_oi_usd", "coinglass_oi_change_4h", "coinglass_oi_change_24h", "coinglass_oi_change_24h_pct", "coinglass_funding_oi_weighted", "coinglass_funding_percent", "coinglass_funding_zscore", "coinglass_funding_positive_streak", "coinglass_long_liq_4h_usd", "coinglass_short_liq_4h_usd", "coinglass_liq_imbalance_4h", "coinglass_okx_oi_share", "coinglass_top3_oi_share", "coinglass_growing_exchanges_1h", "coinglass_shrinking_exchanges_1h", "decision", "execution_score", "reason", "action", "blockers"],
    ...outputRows.map((row) => [new Date().toISOString(), row.token, row.primary_direction, row.short_bucket, row.directional_confidence, row.okx_inst_id, row.okx_swap_status, row.okx_swap_state, row.okx_max_leverage, row.okx_margin_status, String(row.okx_margin_pair_available), row.borrow_status, row.okx_funding_status, row.okx_funding_rate, row.okx_funding_positive_streak, row.okx_oi_status, row.okx_oi_usd, row.okx_book_status, row.okx_best_bid, row.okx_best_ask, row.okx_spread_bps, row.okx_bid_depth_1pct_usd, row.okx_ask_depth_1pct_usd, row.coinglass_status, row.coinglass_liquidation_scope, row.coinglass_trend, row.coinglass_oi_usd, row.coinglass_oi_change_4h, row.coinglass_oi_change_24h, row.coinglass_oi_change_24h_pct, row.coinglass_funding_oi_weighted, row.coinglass_funding_percent, row.coinglass_funding_zscore, row.coinglass_funding_positive_streak, row.coinglass_long_liq_4h_usd, row.coinglass_short_liq_4h_usd, row.coinglass_liq_imbalance_4h, row.coinglass_okx_oi_share, row.coinglass_top3_oi_share, row.coinglass_growing_exchanges_1h, row.coinglass_shrinking_exchanges_1h, row.decision, row.execution_score, row.reason, row.action, row.blockers]),
  ]);
  writeFileSync(reportPath, buildReport(outputRows), "utf-8");

  console.log("=== Short Executability Scan ===");
  for (const row of outputRows) {
    console.log(`${row.token}: ${row.decision} score=${row.execution_score} swap=${row.okx_swap_state || "none"} cg=${row.coinglass_trend} action=${row.action}`);
  }
  console.log(`Output: ${outPath}`);
  console.log(`Report: ${reportPath}`);
}

const isMain = process.argv[1]?.includes("short_executability_scan");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
