import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { getCoinGeckoAuth, type CgAuth } from "../../data_sources/coingecko_auth.js";
import { projectRoot } from "../../../config/env.js";
import { readCsv, writeCsv } from "../../../utils/csv.js";
import { fetchJsonWithFallback } from "../../../utils/http.js";

const ROOT = projectRoot();
const OKX_UNIVERSE_PATH = join(ROOT, "data", "altcoin", "intelligence", "okx", "okx_contract_universe_latest.csv");
const ACCUMULATION_PATH = join(ROOT, "data", "altcoin", "intelligence", "accumulation", "okx_accumulation_features_latest.csv");
const REGISTRY_PATH = join(ROOT, "data", "altcoin", "scanner_v02", "registry", "token_metadata_registry.csv");
const OUT_DIR = join(ROOT, "data", "altcoin", "intelligence", "coingecko", "okx_universe");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "coingecko");

type Obj = Record<string, string>;

interface Options {
  limit: number;
  maxDetails: number;
  source: "okx" | "accumulation";
}

interface UniverseRow {
  token: string;
  instId: string;
  volumeUsd: number;
  oiUsd: number;
}

interface RegistryRow {
  symbol: string;
  name: string;
  category: string;
  coingecko_id: string;
  primary_chain: string;
  contract_address: string;
  is_multichain: string;
}

interface MarketRow {
  id?: string;
  symbol?: string;
  name?: string;
  current_price?: number;
  market_cap?: number;
  market_cap_rank?: number;
  fully_diluted_valuation?: number;
  total_volume?: number;
  circulating_supply?: number;
  total_supply?: number;
  max_supply?: number;
  price_change_percentage_24h?: number;
  price_change_percentage_1h_in_currency?: number;
  price_change_percentage_24h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
}

interface CoinDetails {
  id: string;
  categories: string[];
  assetPlatformId: string;
  platforms: Record<string, string>;
}

export interface EnrichmentRow {
  observedAt: string;
  token: string;
  instId: string;
  resolutionStatus: string;
  coingeckoId: string;
  coingeckoName: string;
  coingeckoSymbol: string;
  registryCategory: string;
  primaryCategory: string;
  categories: string;
  marketCap: number | null;
  fdv: number | null;
  fdvToMcap: number | null;
  volume24h: number | null;
  volumeToMcap: number | null;
  marketCapRank: number | null;
  currentPrice: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  priceChange7d: number | null;
  priceChange30d: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  supplyRatio: number | null;
  trendingRank: number | null;
  assetPlatformId: string;
  platformsCount: number;
  primaryContract: string;
  okxVolumeUsd: number;
  okxOiUsd: number;
  marketCapBucket: string;
  limitations: string;
}

let lastCgCallAt = 0;

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
    maxDetails: Math.max(0, Math.floor(numArg("max-details", 12))),
    source: arg("source") === "accumulation" ? "accumulation" : "okx",
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

function loadUniverse(options: Options): UniverseRow[] {
  const sourcePath = options.source === "accumulation" ? ACCUMULATION_PATH : OKX_UNIVERSE_PATH;
  const rows = rowsToObjects(sourcePath);
  const mapped = rows.map((row) => ({
    token: String(row.token || "").toUpperCase(),
    instId: row.inst_id || `${String(row.token || "").toUpperCase()}-USDT-SWAP`,
    volumeUsd: num(row.volume_quote_24h),
    oiUsd: num(row.oi_usd),
  })).filter((row) => row.token);
  if (mapped.length > 0) return mapped.slice(0, options.limit);

  return rowsToObjects(ACCUMULATION_PATH).map((row) => ({
    token: String(row.token || "").toUpperCase(),
    instId: row.inst_id || `${String(row.token || "").toUpperCase()}-USDT-SWAP`,
    volumeUsd: num(row.volume_quote_24h),
    oiUsd: num(row.oi_usd),
  })).filter((row) => row.token).slice(0, options.limit);
}

function loadRegistry(): Map<string, RegistryRow> {
  const rows = rowsToObjects(REGISTRY_PATH).map((row) => ({
    symbol: row.symbol || "",
    name: row.name || "",
    category: row.category || "",
    coingecko_id: row.coingecko_id || "",
    primary_chain: row.primary_chain || "",
    contract_address: row.contract_address || "",
    is_multichain: row.is_multichain || "",
  }));
  return new Map(rows.filter((row) => row.symbol).map((row) => [row.symbol.toUpperCase(), row]));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function cgGet(auth: CgAuth, path: string): Promise<{ status: string; body: any }> {
  const elapsed = Date.now() - lastCgCallAt;
  if (elapsed < auth.sleepMs) await sleep(auth.sleepMs - elapsed);
  lastCgCallAt = Date.now();
  try {
    const response = await fetchJsonWithFallback(`${auth.baseUrl}${path}`, { headers: auth.headers }, 20_000);
    if (response.status === 429) return { status: "RATE_LIMITED", body: response.body };
    if (response.status === 404) return { status: "NOT_FOUND", body: response.body };
    if (response.status < 200 || response.status >= 300) return { status: `HTTP_${response.status}`, body: response.body };
    return { status: "OK", body: response.body };
  } catch (err) {
    return { status: err instanceof Error ? `ERROR_${err.message}` : "ERROR", body: null };
  }
}

export function chooseMarketRow(token: string, registryId: string | undefined, rows: MarketRow[]): { row: MarketRow | null; status: string } {
  const upper = token.toUpperCase();
  const exactSymbolRows = rows
    .filter((row) => String(row.symbol || "").toUpperCase() === upper)
    .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
  if (registryId) {
    const byRegistry = exactSymbolRows.find((row) => row.id === registryId) || rows.find((row) => row.id === registryId);
    if (byRegistry) return { row: byRegistry, status: "REGISTRY_MARKET_MATCH" };
  }
  if (exactSymbolRows.length > 0) return { row: exactSymbolRows[0], status: "SYMBOL_MARKET_MATCH" };
  return { row: null, status: "UNRESOLVED" };
}

export function marketCapBucket(marketCap: number | null, rank: number | null): string {
  if (rank !== null && rank <= 30) return "LARGE_CAP_TOP30";
  if (marketCap === null) return "UNKNOWN_MCAP";
  if (marketCap >= 10_000_000_000) return "LARGE_CAP_10B_PLUS";
  if (marketCap >= 1_000_000_000) return "MID_LARGE_1B_10B";
  if (marketCap >= 100_000_000) return "MID_CAP_100M_1B";
  if (marketCap >= 10_000_000) return "SMALL_CAP_10M_100M";
  return "MICRO_CAP_UNDER_10M";
}

export function classifyEnrichmentStatus(market: MarketRow | null, details: CoinDetails | undefined): string {
  if (!market) return "UNRESOLVED";
  if (details) return "MARKET_AND_DETAILS_READY";
  return "MARKET_ONLY";
}

async function fetchMarkets(auth: CgAuth, symbols: string[]): Promise<{ rows: MarketRow[]; statuses: string[] }> {
  const allRows: MarketRow[] = [];
  const statuses: string[] = [];
  for (const part of chunk(symbols, 50)) {
    const params = [
      "vs_currency=usd",
      `symbols=${encodeURIComponent(part.join(","))}`,
      "include_tokens=all",
      "order=market_cap_desc",
      "per_page=250",
      "page=1",
      "sparkline=false",
      "price_change_percentage=1h,24h,7d,30d",
      "locale=en",
      "precision=full",
    ].join("&");
    const response = await cgGet(auth, `/coins/markets?${params}`);
    statuses.push(response.status);
    if (response.status === "OK" && Array.isArray(response.body)) allRows.push(...response.body);
  }
  return { rows: allRows, statuses };
}

async function resolveMissingBySearch(auth: CgAuth, tokens: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const token of tokens) {
    const response = await cgGet(auth, `/search?query=${encodeURIComponent(token)}`);
    if (response.status !== "OK" || !Array.isArray(response.body?.coins)) continue;
    const exact = response.body.coins.find((row: any) => String(row.symbol || "").toUpperCase() === token.toUpperCase());
    if (exact?.id) out.set(token.toUpperCase(), String(exact.id));
  }
  return out;
}

async function fetchMarketsByIds(auth: CgAuth, ids: string[]): Promise<MarketRow[]> {
  const out: MarketRow[] = [];
  for (const part of chunk(ids, 50)) {
    const params = [
      "vs_currency=usd",
      `ids=${encodeURIComponent(part.join(","))}`,
      "order=market_cap_desc",
      "per_page=250",
      "page=1",
      "sparkline=false",
      "price_change_percentage=1h,24h,7d,30d",
      "locale=en",
      "precision=full",
    ].join("&");
    const response = await cgGet(auth, `/coins/markets?${params}`);
    if (response.status === "OK" && Array.isArray(response.body)) out.push(...response.body);
  }
  return out;
}

async function fetchTrending(auth: CgAuth): Promise<Map<string, number>> {
  const response = await cgGet(auth, "/search/trending");
  const out = new Map<string, number>();
  if (response.status !== "OK" || !Array.isArray(response.body?.coins)) return out;
  response.body.coins.forEach((row: any, index: number) => {
    const id = row.item?.id || row.id;
    if (id) out.set(String(id), index + 1);
  });
  return out;
}

async function fetchDetails(auth: CgAuth, ids: string[], maxDetails: number): Promise<Map<string, CoinDetails>> {
  const out = new Map<string, CoinDetails>();
  for (const id of ids.slice(0, maxDetails)) {
    const path = `/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
    const response = await cgGet(auth, path);
    if (response.status !== "OK") continue;
    out.set(id, {
      id,
      categories: Array.isArray(response.body?.categories) ? response.body.categories.filter(Boolean) : [],
      assetPlatformId: String(response.body?.asset_platform_id || ""),
      platforms: response.body?.platforms && typeof response.body.platforms === "object" ? response.body.platforms : {},
    });
  }
  return out;
}

function buildRows(universe: UniverseRow[], registry: Map<string, RegistryRow>, markets: MarketRow[], details: Map<string, CoinDetails>, trending: Map<string, number>): EnrichmentRow[] {
  const rowsBySymbol = new Map<string, MarketRow[]>();
  for (const row of markets) {
    const symbol = String(row.symbol || "").toUpperCase();
    if (!symbol) continue;
    const bucket = rowsBySymbol.get(symbol) || [];
    bucket.push(row);
    rowsBySymbol.set(symbol, bucket);
  }

  return universe.map((item) => {
    const reg = registry.get(item.token);
    const selected = chooseMarketRow(item.token, reg?.coingecko_id, rowsBySymbol.get(item.token) || markets.filter((row) => row.id === reg?.coingecko_id));
    const market = selected.row;
    const detail = market?.id ? details.get(market.id) : undefined;
    const categories = detail?.categories || [];
    const mcap = numOrNull(market?.market_cap);
    const fdv = numOrNull(market?.fully_diluted_valuation);
    const volume = numOrNull(market?.total_volume);
    const circulating = numOrNull(market?.circulating_supply);
    const totalSupply = numOrNull(market?.total_supply ?? market?.max_supply);
    const limitations = new Set<string>();
    if (!reg?.coingecko_id) limitations.add("registry_coingecko_id_missing");
    if (!market) limitations.add("coingecko_market_unresolved");
    if (market && !detail) limitations.add("coin_details_not_fetched");
    if (categories.length === 0) limitations.add("categories_missing");
    const primaryContract = reg?.contract_address || Object.values(detail?.platforms || {}).find((value) => value) || "";

    return {
      observedAt: new Date().toISOString(),
      token: item.token,
      instId: item.instId,
      resolutionStatus: selected.status === "UNRESOLVED" ? "UNRESOLVED" : classifyEnrichmentStatus(market, detail),
      coingeckoId: market?.id || reg?.coingecko_id || "",
      coingeckoName: market?.name || reg?.name || "",
      coingeckoSymbol: market?.symbol || "",
      registryCategory: reg?.category || "",
      primaryCategory: categories[0] || reg?.category || "",
      categories: categories.join(";"),
      marketCap: mcap,
      fdv,
      fdvToMcap: mcap !== null && fdv !== null && mcap > 0 ? fdv / mcap : null,
      volume24h: volume,
      volumeToMcap: mcap !== null && volume !== null && mcap > 0 ? volume / mcap : null,
      marketCapRank: numOrNull(market?.market_cap_rank),
      currentPrice: numOrNull(market?.current_price),
      priceChange1h: numOrNull(market?.price_change_percentage_1h_in_currency),
      priceChange24h: numOrNull(market?.price_change_percentage_24h_in_currency ?? market?.price_change_percentage_24h),
      priceChange7d: numOrNull(market?.price_change_percentage_7d_in_currency),
      priceChange30d: numOrNull(market?.price_change_percentage_30d_in_currency),
      circulatingSupply: circulating,
      totalSupply,
      supplyRatio: circulating !== null && totalSupply !== null && totalSupply > 0 ? circulating / totalSupply : null,
      trendingRank: market?.id ? trending.get(market.id) ?? null : null,
      assetPlatformId: detail?.assetPlatformId || reg?.primary_chain || "",
      platformsCount: Object.keys(detail?.platforms || {}).filter((key) => Boolean(detail?.platforms[key])).length,
      primaryContract,
      okxVolumeUsd: item.volumeUsd,
      okxOiUsd: item.oiUsd,
      marketCapBucket: marketCapBucket(mcap, numOrNull(market?.market_cap_rank)),
      limitations: Array.from(limitations).join(";"),
    };
  });
}

function toCsvRow(row: EnrichmentRow): (string | number | null | undefined)[] {
  return [
    row.observedAt,
    row.token,
    row.instId,
    row.resolutionStatus,
    row.coingeckoId,
    row.coingeckoName,
    row.coingeckoSymbol,
    row.registryCategory,
    row.primaryCategory,
    row.categories,
    row.marketCap,
    row.fdv,
    row.fdvToMcap,
    row.volume24h,
    row.volumeToMcap,
    row.marketCapRank,
    row.currentPrice,
    row.priceChange1h,
    row.priceChange24h,
    row.priceChange7d,
    row.priceChange30d,
    row.circulatingSupply,
    row.totalSupply,
    row.supplyRatio,
    row.trendingRank,
    row.assetPlatformId,
    row.platformsCount,
    row.primaryContract,
    row.okxVolumeUsd,
    row.okxOiUsd,
    row.marketCapBucket,
    row.limitations,
  ];
}

const HEADER = [
  "observed_at",
  "token",
  "inst_id",
  "resolution_status",
  "coingecko_id",
  "coingecko_name",
  "coingecko_symbol",
  "registry_category",
  "primary_category",
  "categories",
  "market_cap",
  "fdv",
  "fdv_to_mcap",
  "volume_24h",
  "volume_to_mcap",
  "market_cap_rank",
  "current_price",
  "price_change_pct_1h",
  "price_change_pct_24h",
  "price_change_pct_7d",
  "price_change_pct_30d",
  "circulating_supply",
  "total_supply",
  "supply_ratio",
  "trending_rank",
  "asset_platform_id",
  "platforms_count",
  "primary_contract",
  "okx_volume_usd",
  "okx_oi_usd",
  "market_cap_bucket",
  "limitations",
];

function money(value: number | null): string {
  if (value === null) return "";
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function pct(value: number | null): string {
  return value === null ? "" : `${value.toFixed(2)}%`;
}

function buildReport(rows: EnrichmentRow[], auth: CgAuth, options: Options, statuses: string[]): string {
  const resolved = rows.filter((row) => row.resolutionStatus !== "UNRESOLVED").length;
  const withDetails = rows.filter((row) => row.resolutionStatus === "MARKET_AND_DETAILS_READY").length;
  return [
    "# CoinGecko OKX Universe Enrichment",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Auth mode: ${auth.mode}`,
    `Universe source: ${options.source}`,
    `Market fetch statuses: ${statuses.join("|")}`,
    "",
    "Research-only output. CoinGecko market/category context is an enrichment layer, not an order signal.",
    "",
    "## Coverage",
    "",
    `- Resolved market rows: ${resolved}/${rows.length}`,
    `- Details/category rows: ${withDetails}/${rows.length}`,
    "",
    "## Universe Context",
    "",
    "| token | status | id | rank | bucket | mcap | fdv/mcap | vol/mcap | 7d | category | trending | limits |",
    "| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |",
    ...rows.map((row) =>
      `| ${row.token} | ${row.resolutionStatus} | ${row.coingeckoId} | ${row.marketCapRank ?? ""} | ${row.marketCapBucket} | ${money(row.marketCap)} | ${row.fdvToMcap === null ? "" : row.fdvToMcap.toFixed(2)} | ${row.volumeToMcap === null ? "" : row.volumeToMcap.toFixed(3)} | ${pct(row.priceChange7d)} | ${row.primaryCategory} | ${row.trendingRank ?? ""} | ${row.limitations} |`
    ),
    "",
    "## Use In Accumulation Workflow",
    "",
    "- Market-cap bucket helps separate large-cap rotation from small/mid-cap accumulation candidates.",
    "- FDV/market-cap and supply ratio flag token-overhang risk before a contract watchlist is promoted.",
    "- Category and platforms help route follow-up DEX and holder scans to the right chain.",
  ].join("\n");
}

function readyCount(path: string): number {
  return rowsToObjects(path).filter((row) => row.resolution_status !== "UNRESOLVED").length;
}

async function main(): Promise<void> {
  const options = parseArgs();
  const auth = getCoinGeckoAuth();
  const snapshotId = new Date().toISOString().replace(/[:.]/g, "-");
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  console.log("=== CoinGecko OKX Universe Enrichment ===");
  console.log(`auth=${auth.mode} source=${options.source} limit=${options.limit} maxDetails=${options.maxDetails}`);
  const universe = loadUniverse(options);
  console.log(`Universe rows: ${universe.length}`);
  if (universe.length === 0) {
    console.log("NO_UNIVERSE_ROWS");
    return;
  }

  const registry = loadRegistry();
  const symbols = Array.from(new Set(universe.map((row) => row.token.toLowerCase())));
  const marketsResult = await fetchMarkets(auth, symbols);
  let markets = marketsResult.rows;
  const statuses = [...marketsResult.statuses];

  const preliminaryMissing = universe.filter((item) => {
    const reg = registry.get(item.token);
    return chooseMarketRow(item.token, reg?.coingecko_id, markets).row === null;
  }).map((item) => item.token);
  if (preliminaryMissing.length > 0) {
    const idFallbacks = new Map<string, string>();
    for (const token of preliminaryMissing) {
      const regId = registry.get(token)?.coingecko_id;
      if (regId) idFallbacks.set(token, regId);
    }
    const searchIds = await resolveMissingBySearch(auth, preliminaryMissing);
    for (const [token, id] of searchIds) {
      if (!idFallbacks.has(token)) idFallbacks.set(token, id);
    }
    const extraMarkets = await fetchMarketsByIds(auth, Array.from(new Set(idFallbacks.values())));
    markets = [...markets, ...extraMarkets];
    if (idFallbacks.size > 0) statuses.push(`ID_FALLBACKS_${idFallbacks.size}`);
    if (searchIds.size > 0) statuses.push(`SEARCH_IDS_${searchIds.size}`);
  }

  const selectedIds = Array.from(new Set(universe.flatMap((item) => {
    const reg = registry.get(item.token);
    const selected = chooseMarketRow(item.token, reg?.coingecko_id, markets);
    return selected.row?.id ? [selected.row.id] : [];
  })));
  const trending = await fetchTrending(auth);
  const details = await fetchDetails(auth, selectedIds, options.maxDetails);
  const rows = buildRows(universe, registry, markets, details, trending);

  const latestPath = join(OUT_DIR, "coingecko_okx_universe_enrichment_latest.csv");
  const snapshotPath = join(OUT_DIR, `coingecko_okx_universe_enrichment_${snapshotId}.csv`);
  const attemptPath = join(OUT_DIR, "coingecko_okx_universe_enrichment_last_attempt.csv");
  const reportLatestPath = join(REPORTS_DIR, "coingecko_okx_universe_enrichment_latest.md");
  const reportAttemptPath = join(REPORTS_DIR, "coingecko_okx_universe_enrichment_last_attempt.md");
  const csvRows = [HEADER, ...rows.map(toCsvRow)];
  const report = buildReport(rows, auth, options, statuses);
  const resolved = rows.filter((row) => row.resolutionStatus !== "UNRESOLVED").length;
  const previousResolved = readyCount(latestPath);
  const hitRateLimit = statuses.includes("RATE_LIMITED");
  const preserveLatest = hitRateLimit && previousResolved > resolved;

  writeCsv(snapshotPath, csvRows);
  writeCsv(attemptPath, csvRows);
  writeFileSync(reportAttemptPath, report, "utf-8");
  if (!preserveLatest) {
    writeCsv(latestPath, csvRows);
    writeFileSync(reportLatestPath, report, "utf-8");
  } else {
    console.log(`Preserved previous latest because this attempt hit rate limits and resolved count fell ${previousResolved} -> ${resolved}.`);
  }

  console.log(`Resolved: ${resolved}/${rows.length} | details=${details.size}`);
  console.log(`Output: ${preserveLatest ? latestPath + " (preserved)" : latestPath}`);
  console.log(`Report: ${preserveLatest ? reportLatestPath + " (preserved)" : reportLatestPath}`);
}

const isMain = process.argv[1]?.includes("coingecko_okx_universe_enrichment");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
