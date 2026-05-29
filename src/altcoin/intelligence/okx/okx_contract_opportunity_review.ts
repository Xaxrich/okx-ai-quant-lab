import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";
import { fetchJsonWithFallback } from "../../../utils/http.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const OKX_BASE = "https://www.okx.com/api/v5";
const OKX_DIR = join(ROOT, "data", "altcoin", "intelligence", "okx");
const ONCHAIN_DIR = join(ROOT, "data", "altcoin", "intelligence", "onchain");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "okx");

const NEW_SWAPS_PATH = join(OKX_DIR, "okx_new_swap_candidates_latest.csv");
const EVIDENCE_PATH = join(ONCHAIN_DIR, "evidence_depth_audit_latest.csv");
const READINESS_PATH = join(ONCHAIN_DIR, "scan_readiness_latest.csv");
const CEX_PATH = join(ONCHAIN_DIR, "cex_flow_window_scan_latest.csv");
const ENTITY_PATH = join(ONCHAIN_DIR, "entity_flow_review_latest.csv");
const HOLDER_PATH = join(ONCHAIN_DIR, "holder_identity_review_latest.csv");
const HOLDER_DELTA_PATH = join(ONCHAIN_DIR, "holder_flow_delta_review_latest.csv");

type ContractOpportunityState =
  | "DISTRIBUTION_RISK_NO_LONG"
  | "ACCUMULATION_WATCH_NEEDS_CONFIRMATION"
  | "DELEVERAGING_RESET_WATCH"
  | "LONG_WATCH_NEEDS_CONFIRMATION"
  | "SQUEEZE_WATCH"
  | "MARKET_ONLY_MOMENTUM_WATCH"
  | "MARKET_DATA_GAP_NO_EDGE"
  | "UNDER_MINED_NO_EDGE"
  | "NO_EDGE_YET";

interface Options {
  limit: number;
  includeRepair: boolean;
}

interface OkxNewSwapRow {
  token: string;
  inst_id: string;
  age_days: string;
  max_leverage: string;
  last_price: string;
  funding_rate: string;
  open_interest_usd: string;
  metadata_source: string;
  primary_chain: string;
  scan_chain: string;
  contract_address: string;
  discovery_status: string;
  priority: string;
  opportunity_score: string;
  fragility_score: string;
  tradability_score: string;
}

interface EvidenceRow {
  token: string;
  evidence_state: string;
  depth_score: string;
  conflict_score: string;
  insufficiency_score: string;
  conclusion: string;
  next_probe: string;
  reasons: string;
}

interface ReadinessRow {
  token: string;
  decision: string;
  scan_depth: string;
  reason: string;
}

interface CexRow {
  token: string;
  window_hours: string;
  decision: string;
  label_coverage: string;
  net_cex_value: string;
  transfers: string;
}

interface EntityRow {
  token: string;
  decision: string;
  entity_label_coverage: string;
}

interface HolderRow {
  token: string;
  decision: string;
  identity_class: string;
}

interface HolderDeltaRow {
  token: string;
  decision: string;
  confidence: string;
  net_top_holder_value: string;
  top_to_cex_value: string;
}

interface ContractMarketFeatures {
  token: string;
  instId: string;
  lastPrice: number;
  spreadBps: number | null;
  return1h: number | null;
  return4h: number | null;
  return24h: number | null;
  return7d: number | null;
  rangePosition24h: number | null;
  volumeQuote24h: number | null;
  volumeAcceleration: number | null;
  oiUsd: number | null;
  oiChange7d: number | null;
  oiZScore: number | null;
  fundingLatest: number | null;
  fundingAvg: number | null;
  fundingZScore: number | null;
  fundingPositiveStreak: number;
  dataQuality: number;
}

interface ContractReviewInput {
  discoveryStatus: string;
  priority: string;
  opportunityScore: number;
  fragilityScore: number;
  tradabilityScore: number;
  evidenceState: string;
  readinessDecision: string;
  holderDecision: string;
  holderDeltaDecision: string;
  entityDecision: string;
  cex1hDecision: string;
  cex4hDecision: string;
  cex24hDecision: string;
  netCex24hValue: number;
  return24h: number | null;
  return7d: number | null;
  oiChange7d: number | null;
  fundingLatest: number | null;
  fundingZScore: number | null;
  volumeAcceleration: number | null;
  spreadBps: number | null;
  dataQuality: number;
}

export interface ContractReviewDecision {
  state: ContractOpportunityState;
  setupScore: number;
  riskScore: number;
  squeezeScore: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  thesis: string;
  invalidation: string;
  nextAction: string;
  evidence: string[];
}

function parseArgs(): Options {
  const arg = (name: string): string | undefined => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
  const limit = Number(arg("limit") || "40");
  return {
    limit: Number.isFinite(limit) && limit > 0 ? limit : 40,
    includeRepair: !process.argv.includes("--ready-only"),
  };
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

function mapByToken<T extends { token: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.token, row]));
}

function num(value: string | number | null | undefined): number {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function numOrNull(value: unknown): number | null {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
}

function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return `${(value * 100).toFixed(2)}%`;
}

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values: number[]): number {
  const avg = mean(values);
  if (avg === null || values.length === 0) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length);
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
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

async function okxGet(path: string): Promise<any[]> {
  try {
    const response = await fetchJsonWithFallback(`${OKX_BASE}${path}`, { headers: { Accept: "application/json" } }, 12_000);
    if (response.status < 200 || response.status >= 300) return [];
    const body = response.body as any;
    return String(body?.code || "") === "0" && Array.isArray(body?.data) ? body.data : [];
  } catch {
    return [];
  }
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

function rangePosition24h(candles: { high: number; low: number; close: number }[]): number | null {
  const recent = candles.slice(-24);
  if (recent.length < 6) return null;
  const high = Math.max(...recent.map((row) => row.high));
  const low = Math.min(...recent.map((row) => row.low));
  const last = recent[recent.length - 1].close;
  if (high <= low) return null;
  return (last - low) / (high - low);
}

function volumeQuote24h(candles: { quoteVol: number }[]): number | null {
  const recent = candles.slice(-24);
  if (recent.length === 0) return null;
  const volume = recent.reduce((sum, row) => sum + row.quoteVol, 0);
  return volume > 0 ? volume : null;
}

function volumeAcceleration(candles4h: { quoteVol: number }[]): number | null {
  const lastDay = candles4h.slice(-6);
  const prev = candles4h.slice(-24, -6);
  if (lastDay.length < 3 || prev.length < 6) return null;
  const current = lastDay.reduce((sum, row) => sum + row.quoteVol, 0);
  const previousDailyAvg = prev.reduce((sum, row) => sum + row.quoteVol, 0) / Math.max(1, prev.length / 6);
  if (previousDailyAvg <= 0) return null;
  return current / previousDailyAvg - 1;
}

function parseOiHistory(rows: any[]): { ts: number; oi: number }[] {
  return rows
    .map((row: any) => ({
      ts: num(Array.isArray(row) ? row[0] : row.ts),
      oi: num(Array.isArray(row) ? row[1] : row.oi),
    }))
    .filter((row) => row.ts > 0 && row.oi > 0)
    .sort((a, b) => a.ts - b.ts);
}

function oiChange7d(rows: { oi: number }[]): number | null {
  if (rows.length < 8) return null;
  const last = rows[rows.length - 1].oi;
  const prev = rows[Math.max(0, rows.length - 8)].oi;
  if (!last || !prev) return null;
  return (last - prev) / prev;
}

function oiZScore(rows: { oi: number }[]): number | null {
  if (rows.length < 8) return null;
  const values = rows.map((row) => row.oi);
  const avg = mean(values);
  const sigma = std(values);
  if (avg === null || sigma === 0) return null;
  return (values[values.length - 1] - avg) / sigma;
}

function parseFundingHistory(rows: any[]): { ts: number; rate: number }[] {
  return rows
    .map((row: any) => ({
      ts: num(row.fundingTime),
      rate: num(row.realizedRate || row.fundingRate),
    }))
    .filter((row) => row.ts > 0 && Number.isFinite(row.rate))
    .sort((a, b) => a.ts - b.ts);
}

function fundingPositiveStreak(rows: { rate: number }[]): number {
  let streak = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].rate > 0) streak++;
    else break;
  }
  return streak;
}

function fundingZScore(rows: { rate: number }[]): number | null {
  if (rows.length < 8) return null;
  const values = rows.map((row) => row.rate);
  const avg = mean(values);
  const sigma = std(values);
  if (avg === null || sigma === 0) return null;
  return (values[values.length - 1] - avg) / sigma;
}

function spreadBps(bookRows: any[]): number | null {
  const book = bookRows[0];
  const ask = num(book?.asks?.[0]?.[0]);
  const bid = num(book?.bids?.[0]?.[0]);
  if (!ask || !bid || ask <= bid) return null;
  return ((ask - bid) / ((ask + bid) / 2)) * 10_000;
}

function tickerReturn24h(tickerRows: any[]): number | null {
  const ticker = tickerRows[0] || {};
  const last = num(ticker.last);
  const open24h = num(ticker.open24h || ticker.sodUtc0);
  if (!last || !open24h) return null;
  return (last - open24h) / open24h;
}

function tickerRangePosition24h(tickerRows: any[]): number | null {
  const ticker = tickerRows[0] || {};
  const last = num(ticker.last);
  const high = num(ticker.high24h);
  const low = num(ticker.low24h);
  if (!last || !high || !low || high <= low) return null;
  return (last - low) / (high - low);
}

function tickerVolumeQuote24h(tickerRows: any[]): number | null {
  const ticker = tickerRows[0] || {};
  const volume = num(ticker.volCcy24h || ticker.vol24h);
  return volume > 0 ? volume : null;
}

async function fetchMarketFeatures(row: OkxNewSwapRow): Promise<ContractMarketFeatures> {
  const instId = row.inst_id;
  const [tickerRaw, candles1hRaw, candles4hRaw, oiRaw, fundingRaw, booksRaw] = await Promise.all([
    okxGet(`/market/ticker?instId=${encodeURIComponent(instId)}`),
    okxGet(`/market/candles?instId=${encodeURIComponent(instId)}&bar=1H&limit=49`),
    okxGet(`/market/candles?instId=${encodeURIComponent(instId)}&bar=4H&limit=43`),
    okxGet(`/rubik/stat/contracts/open-interest-history?instId=${encodeURIComponent(instId)}&period=1D&limit=30`),
    okxGet(`/public/funding-rate-history?instId=${encodeURIComponent(instId)}&limit=30`),
    okxGet(`/market/books?instId=${encodeURIComponent(instId)}&sz=5`),
  ]);

  const candles1h = parseCandles(candles1hRaw);
  const candles4h = parseCandles(candles4hRaw);
  const oiRows = parseOiHistory(oiRaw);
  const fundingRows = parseFundingHistory(fundingRaw);
  const fundingRates = fundingRows.map((funding) => funding.rate);
  const lastFunding = fundingRows.length > 0 ? fundingRows[fundingRows.length - 1].rate : numOrNull(row.funding_rate);
  const tickerLast = num(tickerRaw[0]?.last);
  const rowOi = numOrNull(row.open_interest_usd);
  const rowFunding = numOrNull(row.funding_rate);
  const fallbackReturn24h = tickerReturn24h(tickerRaw);
  const fallbackRange24h = tickerRangePosition24h(tickerRaw);
  const fallbackVolume24h = tickerVolumeQuote24h(tickerRaw);

  const qualitySignals = [
    candles1h.length >= 24 || fallbackReturn24h !== null,
    candles4h.length >= 12,
    oiRows.length >= 8 || rowOi !== null,
    fundingRows.length >= 8 || rowFunding !== null,
    spreadBps(booksRaw) !== null,
  ];
  const dataQuality = qualitySignals.filter(Boolean).length / qualitySignals.length;

  return {
    token: row.token,
    instId,
    lastPrice: candles1h[candles1h.length - 1]?.close || tickerLast || num(row.last_price),
    spreadBps: spreadBps(booksRaw),
    return1h: returnFrom(candles1h, 1),
    return4h: returnFrom(candles1h, 4),
    return24h: returnFrom(candles1h, 24) ?? fallbackReturn24h,
    return7d: returnFrom(candles4h, 42),
    rangePosition24h: rangePosition24h(candles1h) ?? fallbackRange24h,
    volumeQuote24h: volumeQuote24h(candles1h) ?? fallbackVolume24h,
    volumeAcceleration: volumeAcceleration(candles4h),
    oiUsd: numOrNull(row.open_interest_usd),
    oiChange7d: oiChange7d(oiRows),
    oiZScore: oiZScore(oiRows),
    fundingLatest: lastFunding,
    fundingAvg: mean(fundingRates),
    fundingZScore: fundingZScore(fundingRows),
    fundingPositiveStreak: fundingPositiveStreak(fundingRows),
    dataQuality,
  };
}

function isCexRisk(decision: string): boolean {
  return decision === "CEX_INFLOW_RISK";
}

function isCexSupportive(decision: string): boolean {
  return decision === "CEX_OUTFLOW_OR_NEUTRAL";
}

function fundingOverheated(rate: number | null, z: number | null): boolean {
  return Math.abs(rate || 0) >= 0.001 || (z !== null && z >= 1.8);
}

function oiRising(value: number | null): boolean {
  return value !== null && value >= 0.12;
}

function priceFlatOrRecovering(value: number | null): boolean {
  return value !== null && value > -0.06 && value < 0.18;
}

function deleveragingReset(input: ContractReviewInput, overheated: boolean, supportiveCex: boolean): boolean {
  return supportiveCex
    && !overheated
    && input.return24h !== null
    && input.return24h <= 0.03
    && input.return24h >= -0.12
    && input.oiChange7d !== null
    && input.oiChange7d <= -0.05;
}

export function classifyContractOpportunity(input: ContractReviewInput): ContractReviewDecision {
  const evidence: string[] = [];
  let setup = 0;
  let risk = 0;
  let squeeze = 0;

  const ready = input.discoveryStatus === "READY_EVM_CHAIN_SCAN";
  const marketOnly = input.discoveryStatus !== "READY_EVM_CHAIN_SCAN";
  const severeCexRisk = isCexRisk(input.cex24hDecision) || isCexRisk(input.cex4hDecision);
  const shortCexRisk = isCexRisk(input.cex1hDecision) && !severeCexRisk;
  const supportiveCex = isCexSupportive(input.cex24hDecision) && isCexSupportive(input.cex4hDecision);
  const overheated = fundingOverheated(input.fundingLatest, input.fundingZScore);
  const unresolvedHolder = input.holderDecision === "HIGH_CONCENTRATION_UNRESOLVED";
  const holderAccumulation = input.holderDeltaDecision === "TOP_HOLDER_ACCUMULATION_PROXY";
  const holderDistribution = input.holderDeltaDecision === "TOP_HOLDER_DISTRIBUTION_RISK";
  const evidenceConflict = input.evidenceState === "EVIDENCE_CONFLICT";
  const underMined = input.evidenceState === "UNDER_MINED";
  const chainContextIncomplete = underMined || input.readinessDecision === "LOW_CONFIDENCE_SCAN";
  const marketDataGap = input.discoveryStatus === "READY_EVM_CHAIN_SCAN" && input.dataQuality < 0.6;
  const breakdownWithOiRising = input.return24h !== null && input.return24h <= -0.12 && oiRising(input.oiChange7d);

  if (ready) setup += 10;
  else { risk += 12; evidence.push("metadata_or_chain_missing"); }

  if (supportiveCex) { setup += 22; evidence.push("4h_24h_cex_outflow_or_neutral"); }
  if (severeCexRisk) { risk += 38; evidence.push("4h_or_24h_cex_inflow_risk"); }
  else if (shortCexRisk) { risk += 12; evidence.push("1h_cex_inflow_only"); }

  if (input.netCex24hValue > 0) risk += Math.min(18, Math.log10(input.netCex24hValue + 1) * 2);
  if (input.netCex24hValue < 0) setup += 8;

  if (input.evidenceState === "CANDIDATE_CLEAN") setup += 20;
  if (input.evidenceState === "SHALLOW_WATCH") setup += 8;
  if (evidenceConflict) risk += 35;
  if (underMined) { risk += 15; evidence.push("under_mined_chain_context"); }

  if (oiRising(input.oiChange7d)) { setup += 12; squeeze += 18; evidence.push("oi_rising_7d"); }
  if (priceFlatOrRecovering(input.return24h) && oiRising(input.oiChange7d)) { setup += 10; evidence.push("price_not_extended_with_oi_rising"); }
  if ((input.return24h || 0) > 0.08 && oiRising(input.oiChange7d)) squeeze += 12;
  if (breakdownWithOiRising) { risk += 28; evidence.push("price_breakdown_with_oi_rising"); }

  if (!overheated) { setup += 10; squeeze += 8; evidence.push("funding_not_overheated"); }
  else { risk += 18; evidence.push("funding_overheated_or_z_high"); }

  if ((input.volumeAcceleration || 0) > 0.5) { setup += 6; squeeze += 8; evidence.push("volume_acceleration"); }
  if ((input.spreadBps || 999) <= 12) { setup += 4; evidence.push("tight_orderbook_spread"); }
  else risk += 8;

  if (marketDataGap) {
    risk += 18;
    evidence.push("market_history_insufficient");
  }

  if (unresolvedHolder) { risk += 18; evidence.push("top_holder_unresolved"); }
  if (holderAccumulation) { setup += 12; evidence.push("top_holder_accumulation_proxy"); }
  if (holderDistribution) { risk += 32; evidence.push("top_holder_distribution_to_cex"); }
  if (input.opportunityScore >= 45 && input.tradabilityScore >= 70 && input.fragilityScore <= 25) setup += 12;
  if (input.fragilityScore >= 35) risk += 10;

  setup = Math.round(clamp(setup));
  risk = Math.round(clamp(risk));
  squeeze = Math.round(clamp(squeeze));

  let state: ContractOpportunityState = "NO_EDGE_YET";
  if (holderDistribution || evidenceConflict || (severeCexRisk && risk >= 50)) state = "DISTRIBUTION_RISK_NO_LONG";
  else if (marketDataGap) state = "MARKET_DATA_GAP_NO_EDGE";
  else if (marketOnly && setup >= 35) state = "MARKET_ONLY_MOMENTUM_WATCH";
  else if (deleveragingReset(input, overheated, supportiveCex)) state = "DELEVERAGING_RESET_WATCH";
  else if (holderAccumulation && supportiveCex && setup >= 52 && risk < 55) state = "ACCUMULATION_WATCH_NEEDS_CONFIRMATION";
  else if (setup >= 58 && risk < 55 && !breakdownWithOiRising) state = "LONG_WATCH_NEEDS_CONFIRMATION";
  else if (squeeze >= 45 && risk < 55) state = "SQUEEZE_WATCH";
  else if (chainContextIncomplete) state = "UNDER_MINED_NO_EDGE";

  const confidence: "HIGH" | "MEDIUM" | "LOW" = marketDataGap || chainContextIncomplete
    ? "LOW"
    : setup >= 65 && risk < 35 && !unresolvedHolder
    ? "HIGH"
    : setup >= 45 && risk < 60
      ? "MEDIUM"
      : "LOW";

  const thesisByState: Record<ContractOpportunityState, string> = {
    DISTRIBUTION_RISK_NO_LONG: "contract is liquid enough to watch, but CEX inflow or evidence conflict makes long-side opportunity unclean",
    ACCUMULATION_WATCH_NEEDS_CONFIRMATION: "top-holder delta is accumulation-like and CEX flow is not hostile, but price/OI follow-through still needs confirmation",
    DELEVERAGING_RESET_WATCH: "CEX flow is not hostile and funding is cool, while price and OI have reset; watch for reclaim rather than chase",
    LONG_WATCH_NEEDS_CONFIRMATION: "market/on-chain structure is not hostile, but holder identity and follow-through still need confirmation",
    SQUEEZE_WATCH: "OI/price/funding mix can support volatility or squeeze watch, but direction must be confirmed by fresh flow",
    MARKET_ONLY_MOMENTUM_WATCH: "contract market is active, but chain metadata is missing so no on-chain edge is proven",
    MARKET_DATA_GAP_NO_EDGE: "chain flow is usable, but OKX market history is too sparse for a contract trading thesis",
    UNDER_MINED_NO_EDGE: "there is not enough reliable evidence to form a contract thesis",
    NO_EDGE_YET: "current evidence does not show a usable contract setup",
  };

  const invalidationByState: Record<ContractOpportunityState, string> = {
    DISTRIBUTION_RISK_NO_LONG: "risk view weakens only if 4h/24h CEX inflow clears and net CEX value turns neutral or negative",
    ACCUMULATION_WATCH_NEEDS_CONFIRMATION: "invalidate if top holder sends to CEX, 4h/24h CEX inflow appears, or price fails while OI rebuilds",
    DELEVERAGING_RESET_WATCH: "invalidate if price keeps breaking down with OI rebuilding, or if 4h/24h CEX inflow appears",
    LONG_WATCH_NEEDS_CONFIRMATION: "invalidate if 4h/24h CEX inflow appears, funding spikes above 0.10% per period, or unresolved top holder distributes",
    SQUEEZE_WATCH: "invalidate if OI falls while price fails to reclaim the 24h upper range, or funding turns crowded before price confirms",
    MARKET_ONLY_MOMENTUM_WATCH: "invalidate for research until contract metadata and chain scanner coverage are repaired",
    MARKET_DATA_GAP_NO_EDGE: "invalidate any directional contract view until 1h/4h candles and OI history are available",
    UNDER_MINED_NO_EDGE: "invalidate any directional view until missing CEX/holder/entity coverage is repaired",
    NO_EDGE_YET: "invalidate watch only after new price/OI/flow evidence appears",
  };

  const nextActionByState: Record<ContractOpportunityState, string> = {
    DISTRIBUTION_RISK_NO_LONG: "avoid long thesis; monitor for post-inflow price weakness and whether risk persists across next CEX window",
    ACCUMULATION_WATCH_NEEDS_CONFIRMATION: "watch for 24h range reclaim with continued neutral/outflow CEX windows and no top-holder CEX outflow",
    DELEVERAGING_RESET_WATCH: "wait for 24h range reclaim plus non-positive CEX net flow; do not chase before price confirms",
    LONG_WATCH_NEEDS_CONFIRMATION: "watch next 1h/4h candles with CEX flow and holder-delta confirmation before any thesis upgrade",
    SQUEEZE_WATCH: "track OI, funding, and 24h range break; require fresh flow confirmation",
    MARKET_ONLY_MOMENTUM_WATCH: "repair metadata first, then rerun chain scan before using as a high-conviction contract idea",
    MARKET_DATA_GAP_NO_EDGE: "collect enough OKX candle/OI history before ranking as a tradable contract opportunity",
    UNDER_MINED_NO_EDGE: "deepen transfer windows and holder identity before interpreting price action",
    NO_EDGE_YET: "keep in broad watchlist only",
  };

  return {
    state,
    setupScore: setup,
    riskScore: risk,
    squeezeScore: squeeze,
    confidence,
    thesis: thesisByState[state],
    invalidation: invalidationByState[state],
    nextAction: nextActionByState[state],
    evidence,
  };
}

function buildReport(rows: Record<string, string | number>[]): string {
  const sorted = [...rows].sort((a, b) => Number(b.setup_score) - Number(a.setup_score));
  const table = (items: Record<string, string | number>[]) => {
    if (items.length === 0) return "No rows.";
    return [
      "| token | state | confidence | setup | risk | squeeze | 24h | 7d | oi_7d | funding | cex_24h | evidence | next |",
      "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |",
      ...items.map((row) => `| ${row.token} | ${row.contract_state} | ${row.confidence} | ${row.setup_score} | ${row.risk_score} | ${row.squeeze_score} | ${row.return_24h} | ${row.return_7d} | ${row.oi_change_7d} | ${row.funding_latest} | ${row.cex_24h_decision} | ${row.evidence} | ${row.next_action} |`),
    ].join("\n");
  };

  return [
    "# OKX Contract Opportunity Review",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Scope: OKX newly listed crypto USDT swaps, merged with chain evidence where available.",
    "",
    "## Ranked Review",
    "",
    table(sorted),
    "",
    "## Buckets",
    "",
    "### Long Watch Needs Confirmation",
    "",
    table(sorted.filter((row) => row.contract_state === "LONG_WATCH_NEEDS_CONFIRMATION")),
    "",
    "### Accumulation Watch Needs Confirmation",
    "",
    table(sorted.filter((row) => row.contract_state === "ACCUMULATION_WATCH_NEEDS_CONFIRMATION")),
    "",
    "### Deleveraging Reset Watch",
    "",
    table(sorted.filter((row) => row.contract_state === "DELEVERAGING_RESET_WATCH")),
    "",
    "### Squeeze Watch",
    "",
    table(sorted.filter((row) => row.contract_state === "SQUEEZE_WATCH")),
    "",
    "### Distribution / No Long",
    "",
    table(sorted.filter((row) => row.contract_state === "DISTRIBUTION_RISK_NO_LONG")),
    "",
    "### Under-Mined / Market Only",
    "",
    table(sorted.filter((row) => ["UNDER_MINED_NO_EDGE", "MARKET_ONLY_MOMENTUM_WATCH", "MARKET_DATA_GAP_NO_EDGE", "NO_EDGE_YET"].includes(String(row.contract_state)))),
    "",
    "## Method Notes",
    "",
    "- Contract review is research-only and does not authorize execution.",
    "- CEX inflow risk overrides attractive new-listing/OI scores.",
    "- Metadata-repair rows can show market activity but are not treated as on-chain opportunities.",
    "- Holder identity unresolved keeps confidence capped even when CEX flow is neutral.",
    "- Under-mined chain context caps confidence, but does not erase a complete CEX-flow plus market reset watch.",
    "- 24h price/range/volume falls back to OKX ticker fields when candle history is too sparse.",
  ].join("\n");
}

async function main() {
  const options = parseArgs();
  if (!existsSync(OKX_DIR)) mkdirSync(OKX_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const candidates = rowsToObjects<OkxNewSwapRow>(NEW_SWAPS_PATH)
    .filter((row) => options.includeRepair || row.discovery_status === "READY_EVM_CHAIN_SCAN")
    .slice(0, options.limit);
  const evidenceMap = mapByToken(rowsToObjects<EvidenceRow>(EVIDENCE_PATH));
  const readinessMap = mapByToken(rowsToObjects<ReadinessRow>(READINESS_PATH));
  const entityMap = mapByToken(rowsToObjects<EntityRow>(ENTITY_PATH));
  const holderMap = mapByToken(rowsToObjects<HolderRow>(HOLDER_PATH));
  const holderDeltaMap = mapByToken(rowsToObjects<HolderDeltaRow>(HOLDER_DELTA_PATH));
  const cexMap = new Map<string, CexRow>();
  for (const row of rowsToObjects<CexRow>(CEX_PATH)) cexMap.set(`${row.token}:${row.window_hours}`, row);

  const features = await concurrentMap(candidates, 4, async (row) => fetchMarketFeatures(row));
  const featureMap = mapByToken(features);

  const outputRows = candidates.map((candidate) => {
    const market = featureMap.get(candidate.token)!;
    const evidence = evidenceMap.get(candidate.token);
    const readiness = readinessMap.get(candidate.token);
    const entity = entityMap.get(candidate.token);
    const holder = holderMap.get(candidate.token);
    const holderDelta = holderDeltaMap.get(candidate.token);
    const cex1 = cexMap.get(`${candidate.token}:1`);
    const cex4 = cexMap.get(`${candidate.token}:4`);
    const cex24 = cexMap.get(`${candidate.token}:24`);
    const decision = classifyContractOpportunity({
      discoveryStatus: candidate.discovery_status,
      priority: candidate.priority,
      opportunityScore: num(candidate.opportunity_score),
      fragilityScore: num(candidate.fragility_score),
      tradabilityScore: num(candidate.tradability_score),
      evidenceState: evidence?.evidence_state || "",
      readinessDecision: readiness?.decision || "",
      holderDecision: holder?.decision || "",
      holderDeltaDecision: holderDelta?.decision || "",
      entityDecision: entity?.decision || "",
      cex1hDecision: cex1?.decision || "",
      cex4hDecision: cex4?.decision || "",
      cex24hDecision: cex24?.decision || "",
      netCex24hValue: num(cex24?.net_cex_value),
      return24h: market.return24h,
      return7d: market.return7d,
      oiChange7d: market.oiChange7d,
      fundingLatest: market.fundingLatest,
      fundingZScore: market.fundingZScore,
      volumeAcceleration: market.volumeAcceleration,
      spreadBps: market.spreadBps,
      dataQuality: market.dataQuality,
    });
    return {
      checked_at: new Date().toISOString(),
      token: candidate.token,
      inst_id: candidate.inst_id,
      discovery_status: candidate.discovery_status,
      priority: candidate.priority,
      evidence_state: evidence?.evidence_state || "",
      readiness_decision: readiness?.decision || "",
      holder_decision: holder?.decision || "",
      holder_delta_decision: holderDelta?.decision || "",
      entity_decision: entity?.decision || "",
      cex_1h_decision: cex1?.decision || "",
      cex_4h_decision: cex4?.decision || "",
      cex_24h_decision: cex24?.decision || "",
      net_cex_24h_value: cex24?.net_cex_value || "",
      last_price: market.lastPrice,
      spread_bps: market.spreadBps === null ? "" : market.spreadBps.toFixed(2),
      return_1h: pct(market.return1h),
      return_4h: pct(market.return4h),
      return_24h: pct(market.return24h),
      return_7d: pct(market.return7d),
      range_position_24h: market.rangePosition24h === null ? "" : market.rangePosition24h.toFixed(2),
      volume_quote_24h: market.volumeQuote24h === null ? "" : market.volumeQuote24h.toFixed(0),
      volume_acceleration: pct(market.volumeAcceleration),
      oi_usd: money(market.oiUsd),
      oi_change_7d: pct(market.oiChange7d),
      oi_zscore: market.oiZScore === null ? "" : market.oiZScore.toFixed(2),
      funding_latest: market.fundingLatest === null ? "" : `${(market.fundingLatest * 100).toFixed(4)}%`,
      funding_avg: market.fundingAvg === null ? "" : `${(market.fundingAvg * 100).toFixed(4)}%`,
      funding_zscore: market.fundingZScore === null ? "" : market.fundingZScore.toFixed(2),
      funding_positive_streak: market.fundingPositiveStreak,
      data_quality: market.dataQuality.toFixed(2),
      contract_state: decision.state,
      setup_score: decision.setupScore,
      risk_score: decision.riskScore,
      squeeze_score: decision.squeezeScore,
      confidence: decision.confidence,
      thesis: decision.thesis,
      invalidation: decision.invalidation,
      next_action: decision.nextAction,
      evidence: decision.evidence.join(";"),
    };
  });

  const outPath = join(OKX_DIR, "okx_contract_opportunity_review_latest.csv");
  const reportPath = join(REPORTS_DIR, "okx_contract_opportunity_review_latest.md");
  const header = [
    "checked_at", "token", "inst_id", "discovery_status", "priority", "evidence_state", "readiness_decision", "holder_decision", "holder_delta_decision", "entity_decision",
    "cex_1h_decision", "cex_4h_decision", "cex_24h_decision", "net_cex_24h_value", "last_price", "spread_bps", "return_1h", "return_4h",
    "return_24h", "return_7d", "range_position_24h", "volume_quote_24h", "volume_acceleration", "oi_usd", "oi_change_7d", "oi_zscore",
    "funding_latest", "funding_avg", "funding_zscore", "funding_positive_streak", "data_quality", "contract_state", "setup_score",
    "risk_score", "squeeze_score", "confidence", "thesis", "invalidation", "next_action", "evidence",
  ];
  writeCsv(outPath, [
    header,
    ...outputRows.map((row) => header.map((key) => (row as Record<string, string | number>)[key] ?? "")),
  ]);
  writeFileSync(reportPath, buildReport(outputRows), "utf-8");

  console.log("=== OKX Contract Opportunity Review ===");
  for (const row of outputRows.slice().sort((a, b) => Number(b.setup_score) - Number(a.setup_score)).slice(0, 15)) {
    console.log(`${row.token}: ${row.contract_state} setup=${row.setup_score} risk=${row.risk_score} squeeze=${row.squeeze_score} 24h=${row.return_24h} oi7d=${row.oi_change_7d} cex24=${row.cex_24h_decision || "NA"}`);
  }
  console.log(`Output: ${outPath}`);
  console.log(`Report: ${reportPath}`);
}

const isMain = process.argv[1]?.includes("okx_contract_opportunity_review");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
