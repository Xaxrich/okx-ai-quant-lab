import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";
import { fetchJsonWithFallback } from "../../../utils/http.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const REGISTRY_PATH = join(ROOT, "data", "altcoin", "scanner_v02", "registry", "token_metadata_registry.csv");
const OUT_DIR = join(ROOT, "data", "altcoin", "intelligence", "okx");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "okx");
const VALIDATION_DIR = join(ROOT, "data", "altcoin", "intelligence", "validation");
const METADATA_CACHE_PATH = join(OUT_DIR, "okx_metadata_resolution_cache.csv");
const NEW_SWAPS_PATH = join(OUT_DIR, "okx_new_swap_candidates_latest.csv");
const CHAIN_CANDIDATES_PATH = join(VALIDATION_DIR, "chain_scan_candidates_latest.csv");
const ONCHAIN_DIR = join(ROOT, "data", "altcoin", "intelligence", "onchain");
const LIGHT_SCAN_PATH = join(ONCHAIN_DIR, "light_chain_scan_latest.csv");
const SCAN_READINESS_PATH = join(ONCHAIN_DIR, "scan_readiness_latest.csv");
const OKX_BASE = "https://www.okx.com/api/v5";
const CMC_BASE = "https://pro-api.coinmarketcap.com/v1";
const DEXSCREENER_BASE = "https://api.dexscreener.com";

type DiscoveryStatus = "READY_EVM_CHAIN_SCAN" | "UNSUPPORTED_CHAIN" | "METADATA_REPAIR" | "NOT_NEW_ENOUGH";

interface Options {
  days: number;
  limit: number;
  writeChainCandidates: boolean;
  cryptoOnly: boolean;
}

interface OkxInstrument {
  instId?: string;
  state?: string;
  listTime?: string;
  ctVal?: string;
  ctValCcy?: string;
  lever?: string;
  category?: string;
  instCategory?: string;
}

interface RegistryRow {
  symbol: string;
  name: string;
  category: string;
  coingecko_id: string;
  cmc_id: string;
  primary_chain: string;
  contract_address: string;
}

interface Metadata {
  source: "REGISTRY" | "CMC" | "DEXSCREENER" | "CACHE" | "NONE";
  name: string;
  cmcId: string;
  primaryChain: string;
  scanChain: string;
  contractAddress: string;
}

interface MetadataCacheRow {
  token: string;
  source: string;
  name: string;
  cmc_id: string;
  primary_chain: string;
  scan_chain: string;
  contract_address: string;
  updated_at: string;
}

export interface DexScreenerPair {
  chainId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: {
    address?: string;
    name?: string;
    symbol?: string;
  };
  quoteToken?: {
    symbol?: string;
  };
  priceUsd?: string;
  txns?: Record<string, { buys?: number; sells?: number }>;
  volume?: Record<string, number | string>;
  liquidity?: {
    usd?: number | string;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
}

interface NewSwapCandidate {
  token: string;
  instId: string;
  instCategory: string;
  listTime: string;
  ageDays: number;
  state: string;
  maxLeverage: number;
  lastPrice: number | null;
  fundingRate: number | null;
  openInterestUsd: number | null;
  metadataSource: string;
  primaryChain: string;
  scanChain: string;
  contractAddress: string;
  discoveryStatus: DiscoveryStatus;
  opportunityScore: number;
  fragilityScore: number;
  tradabilityScore: number;
  priority: "P0" | "P1" | "P2";
  reason: string;
  nextAction: string;
}

interface MarketMaps {
  tickersByInstId: Map<string, any>;
  openInterestByInstId: Map<string, any>;
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
  const parsed = num(value);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function parseArgs(): Options {
  const arg = (name: string): string | undefined => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
  const days = Number(arg("days") || "180");
  const limit = Number(arg("limit") || "30");
  return {
    days: Number.isFinite(days) && days > 0 ? days : 180,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 30,
    writeChainCandidates: process.argv.includes("--write-chain-candidates"),
    cryptoOnly: !process.argv.includes("--include-noncrypto"),
  };
}

function symbolFromInstId(instId: string): string {
  return instId.replace(/-USDT-SWAP$/, "");
}

export function isCryptoUsdtSwapInstrument(row: OkxInstrument): boolean {
  const category = String(row.instCategory || row.category || "");
  return Boolean(row.instId?.endsWith("-USDT-SWAP") && row.state === "live" && (category === "" || category === "1"));
}

function parseListTime(value: string | undefined): number {
  const parsed = Number(value || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function ageDays(listTimeMs: number, nowMs = Date.now()): number {
  if (!listTimeMs) return 9999;
  return Math.max(0, (nowMs - listTimeMs) / 86_400_000);
}

export function normalizePlatformToChain(value: string): { primaryChain: string; scanChain: string } {
  const text = value.toLowerCase();
  if (text.includes("ethereum")) return { primaryChain: "ethereum", scanChain: "eth" };
  if (text.includes("bnb") || text.includes("bsc") || text.includes("binance")) return { primaryChain: "bsc", scanChain: "bsc" };
  if (text.includes("arbitrum")) return { primaryChain: "arbitrum", scanChain: "arbitrum" };
  if (text.includes("base")) return { primaryChain: "base", scanChain: "base" };
  if (text.includes("optimism")) return { primaryChain: "optimism", scanChain: "optimism" };
  if (text.includes("polygon")) return { primaryChain: "polygon", scanChain: "polygon" };
  if (text.includes("avalanche")) return { primaryChain: "avalanche", scanChain: "avalanche" };
  if (text.includes("solana")) return { primaryChain: "solana", scanChain: "" };
  if (text.includes("sui")) return { primaryChain: "sui", scanChain: "" };
  if (text.includes("sei")) return { primaryChain: "sei", scanChain: "" };
  return { primaryChain: value.toLowerCase().replace(/[^a-z0-9]+/g, "_"), scanChain: "" };
}

function isSupportedScanChain(chain: string): boolean {
  return ["eth", "bsc", "base", "arbitrum", "optimism", "polygon", "avalanche"].includes(chain);
}

function cleanSymbol(value: string | undefined): string {
  return String(value || "").trim().replace(/^\$/, "").toUpperCase();
}

function quoteQuality(symbol: string | undefined): number {
  const quote = cleanSymbol(symbol);
  if (["USDT", "USDC", "USDC.E", "DAI", "USD"].includes(quote)) return 12;
  if (["WETH", "ETH", "WBTC", "BTC", "WBNB", "BNB", "SOL", "WAVAX", "AVAX", "WPLS", "PLS"].includes(quote)) return 6;
  return 0;
}

function dexPairScore(pair: DexScreenerPair): number {
  const liquidityUsd = num(pair.liquidity?.usd);
  const volume24h = num(pair.volume?.h24);
  const txns24h = num(pair.txns?.h24?.buys) + num(pair.txns?.h24?.sells);
  const mapped = normalizePlatformToChain(String(pair.chainId || ""));
  const liquidityScore = Math.log10(liquidityUsd + 1) * 35;
  const volumeScore = Math.log10(volume24h + 1) * 30;
  const txnScore = Math.min(40, txns24h / 10);
  const quoteScore = quoteQuality(pair.quoteToken?.symbol);
  const supportedNudge = isSupportedScanChain(mapped.scanChain) ? 3 : 0;
  const priceNudge = pair.priceUsd ? 2 : 0;
  return liquidityScore + volumeScore + txnScore + quoteScore + supportedNudge + priceNudge;
}

function hasRealDexFootprint(pair: DexScreenerPair): boolean {
  const liquidityUsd = num(pair.liquidity?.usd);
  const volume24h = num(pair.volume?.h24);
  const txns24h = num(pair.txns?.h24?.buys) + num(pair.txns?.h24?.sells);
  return liquidityUsd >= 5_000 || volume24h >= 5_000 || txns24h >= 10;
}

export function selectDexScreenerMetadata(symbol: string, pairs: DexScreenerPair[]): Metadata | null {
  const target = cleanSymbol(symbol);
  const viable = pairs
    .filter((pair) => cleanSymbol(pair.baseToken?.symbol) === target)
    .filter((pair) => Boolean(pair.baseToken?.address && pair.chainId))
    .filter((pair) => quoteQuality(pair.quoteToken?.symbol) > 0)
    .filter(hasRealDexFootprint)
    .sort((a, b) => dexPairScore(b) - dexPairScore(a));

  const best = viable[0];
  if (!best) return null;
  const mapped = normalizePlatformToChain(String(best.chainId || ""));
  return {
    source: "DEXSCREENER",
    name: String(best.baseToken?.name || ""),
    cmcId: "",
    primaryChain: mapped.primaryChain,
    scanChain: mapped.scanChain,
    contractAddress: String(best.baseToken?.address || ""),
  };
}

export function scoreNewSwapCandidate(input: {
  ageDays: number;
  openInterestUsd: number | null;
  fundingRate: number | null;
  maxLeverage: number;
  hasContract: boolean;
  supportedChain: boolean;
}): { opportunityScore: number; fragilityScore: number; tradabilityScore: number; priority: "P0" | "P1" | "P2" } {
  const ageScore = input.ageDays <= 7 ? 35 : input.ageDays <= 30 ? 30 : input.ageDays <= 90 ? 22 : input.ageDays <= 180 ? 14 : 5;
  const oi = input.openInterestUsd || 0;
  const oiScore = oi >= 100_000_000 ? 25 : oi >= 25_000_000 ? 20 : oi >= 5_000_000 ? 14 : oi >= 1_000_000 ? 8 : 2;
  const fundingAbs = Math.abs(input.fundingRate || 0);
  const fundingPenalty = fundingAbs >= 0.001 ? 15 : fundingAbs >= 0.0005 ? 8 : 0;
  const metadataPenalty = input.hasContract && input.supportedChain ? 0 : 18;
  const opportunityScore = Math.round(Math.min(60, ageScore + oiScore + (input.hasContract ? 4 : 0)));
  const tradabilityScore = Math.round(Math.min(100, 45 + oiScore + Math.min(20, input.maxLeverage / 3) + (input.openInterestUsd ? 10 : 0)));
  const fragilityScore = Math.round(Math.min(80, fundingPenalty + metadataPenalty + (oi < 1_000_000 ? 10 : 0)));
  const rawPriority: "P0" | "P1" | "P2" = opportunityScore >= 45 && tradabilityScore >= 70 && fragilityScore <= 35
    ? "P0"
    : opportunityScore >= 30 && tradabilityScore >= 55 && fragilityScore <= 50
      ? "P1"
      : "P2";
  const priority = rawPriority === "P0" && (!input.hasContract || !input.supportedChain) ? "P1" : rawPriority;
  return { opportunityScore, fragilityScore, tradabilityScore, priority };
}

async function okxGet(path: string): Promise<any[]> {
  try {
    const response = await fetchJsonWithFallback(`${OKX_BASE}${path}`, { headers: { Accept: "application/json" } }, 12_000);
    if (response.status < 200 || response.status >= 300) return [];
    const data = response.body as any;
    return String(data?.code || "") === "0" && Array.isArray(data?.data) ? data.data : [];
  } catch {
    return [];
  }
}

async function fetchMarketMaps(): Promise<MarketMaps> {
  const [tickerRows, oiRows] = await Promise.all([
    okxGet("/market/tickers?instType=SWAP"),
    okxGet("/public/open-interest?instType=SWAP"),
  ]);
  return {
    tickersByInstId: new Map(tickerRows.map((row: any) => [String(row.instId || ""), row])),
    openInterestByInstId: new Map(oiRows.map((row: any) => [String(row.instId || ""), row])),
  };
}

async function fetchOkxSnapshot(instId: string, marketMaps: MarketMaps): Promise<{ lastPrice: number | null; fundingRate: number | null; openInterestUsd: number | null }> {
  const [fundingRows, tickerFallbackRows, oiFallbackRows] = await Promise.all([
    okxGet(`/public/funding-rate?instId=${encodeURIComponent(instId)}`),
    marketMaps.tickersByInstId.has(instId) ? Promise.resolve([]) : okxGet(`/market/ticker?instId=${encodeURIComponent(instId)}`),
    marketMaps.openInterestByInstId.has(instId) ? Promise.resolve([]) : okxGet(`/public/open-interest?instId=${encodeURIComponent(instId)}`),
  ]);
  const ticker = marketMaps.tickersByInstId.get(instId) || tickerFallbackRows[0] || {};
  const openInterest = marketMaps.openInterestByInstId.get(instId) || oiFallbackRows[0] || {};
  return {
    lastPrice: numOrNull(ticker.last),
    fundingRate: numOrNull(fundingRows[0]?.fundingRate),
    openInterestUsd: numOrNull(openInterest.oiUsd),
  };
}

const cmcCache = new Map<string, Promise<Metadata | null>>();
const dexScreenerCache = new Map<string, Promise<Metadata | null>>();

async function cmcMetadata(symbol: string): Promise<Metadata | null> {
  const key = process.env.COINMARKETCAP_API_KEY || "";
  if (!key) return null;
  if (cmcCache.has(symbol)) return cmcCache.get(symbol) || null;
  const request = cmcMetadataUncached(symbol, key);
  cmcCache.set(symbol, request);
  return request;
}

async function cmcMetadataUncached(symbol: string, key: string): Promise<Metadata | null> {
  const url = `${CMC_BASE}/cryptocurrency/map?symbol=${encodeURIComponent(symbol)}&limit=10&sort=cmc_rank`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchJsonWithFallback(url, {
        headers: { "X-CMC_PRO_API_KEY": key, Accept: "application/json" },
      }, 12_000);
      if (response.status === 429 || response.status >= 500) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      if (response.status < 200 || response.status >= 300) return null;
      const body = response.body as any;
      const rows = Array.isArray(body?.data) ? body.data : [];
      const withPlatform = rows.find((row: any) => row?.platform?.token_address);
      const best = withPlatform || rows[0];
      if (!best) return null;
      const platform = best.platform || {};
      const mapped = normalizePlatformToChain(String(platform.name || ""));
      return {
        source: "CMC",
        name: String(best.name || ""),
        cmcId: String(best.id || ""),
        primaryChain: mapped.primaryChain,
        scanChain: mapped.scanChain,
        contractAddress: String(platform.token_address || ""),
      };
    } catch {
      await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

async function dexScreenerMetadata(symbol: string): Promise<Metadata | null> {
  if (dexScreenerCache.has(symbol)) return dexScreenerCache.get(symbol) || null;
  const request = dexScreenerMetadataUncached(symbol);
  dexScreenerCache.set(symbol, request);
  return request;
}

async function dexScreenerMetadataUncached(symbol: string): Promise<Metadata | null> {
  const queries = [symbol];
  const seen = new Set<string>();
  const pairs: DexScreenerPair[] = [];
  const results = await Promise.all(queries.map(async (query) => {
    try {
      const url = `${DEXSCREENER_BASE}/latest/dex/search?q=${encodeURIComponent(query)}`;
      const response = await fetchJsonWithFallback(url, { headers: { Accept: "application/json" } }, 8_000);
      if (response.status < 200 || response.status >= 300) return [];
      const body = response.body as any;
      return Array.isArray(body?.pairs) ? body.pairs : [];
    } catch {
      return [];
    }
  }));
  for (const row of results.flat()) {
    const key = `${row?.chainId || ""}:${row?.pairAddress || ""}:${row?.baseToken?.address || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(row as DexScreenerPair);
  }
  return selectDexScreenerMetadata(symbol, pairs);
}

function loadMetadataCache(): Map<string, Metadata> {
  const out = new Map<string, Metadata>();
  const put = (token: string, primaryChain: string, scanChain: string, contractAddress: string, source: Metadata["source"]) => {
    if (!token || !primaryChain || !contractAddress) return;
    out.set(token.toUpperCase(), {
      source,
      name: "",
      cmcId: "",
      primaryChain,
      scanChain,
      contractAddress,
    });
  };

  for (const row of rowsToObjects<MetadataCacheRow>(METADATA_CACHE_PATH).filter((item) => item.contract_address && item.primary_chain)) {
    out.set(row.token.toUpperCase(), {
      source: "CACHE",
      name: row.name,
      cmcId: row.cmc_id,
      primaryChain: row.primary_chain,
      scanChain: row.scan_chain,
      contractAddress: row.contract_address,
    });
  }
  for (const row of rowsToObjects<any>(NEW_SWAPS_PATH)) {
    put(row.token, row.primary_chain, row.scan_chain, row.contract_address, "CACHE");
  }
  for (const row of rowsToObjects<any>(CHAIN_CANDIDATES_PATH)) {
    put(row.token, row.primary_chain || primaryChainFromScanChain(row.scan_chain), row.scan_chain, row.contract_address, "CACHE");
  }
  for (const row of rowsToObjects<any>(LIGHT_SCAN_PATH)) {
    put(row.token, primaryChainFromScanChain(row.chain), row.chain, row.contract_address, "CACHE");
  }
  for (const row of rowsToObjects<any>(SCAN_READINESS_PATH)) {
    put(row.token, primaryChainFromScanChain(row.chain), row.chain, row.contract_address, "CACHE");
  }
  return out;
}

function writeMetadataCache(cache: Map<string, Metadata>, rows: NewSwapCandidate[]): void {
  const next = new Map(cache);
  for (const row of rows) {
    if (!row.contractAddress || !row.primaryChain) continue;
    next.set(row.token.toUpperCase(), {
      source: row.metadataSource === "CACHE" ? "CACHE" : (row.metadataSource as Metadata["source"]),
      name: "",
      cmcId: "",
      primaryChain: row.primaryChain,
      scanChain: row.scanChain,
      contractAddress: row.contractAddress,
    });
  }
  writeCsv(METADATA_CACHE_PATH, [
    ["token", "source", "name", "cmc_id", "primary_chain", "scan_chain", "contract_address", "updated_at"],
    ...[...next.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([token, metadata]) => [token, metadata.source, metadata.name, metadata.cmcId, metadata.primaryChain, metadata.scanChain, metadata.contractAddress, new Date().toISOString()]),
  ]);
}

function primaryChainFromScanChain(scanChain: string): string {
  const value = String(scanChain || "").toLowerCase();
  if (value === "eth") return "ethereum";
  return value;
}

async function resolveMetadata(symbol: string, registry: Map<string, RegistryRow>, cache: Map<string, Metadata>): Promise<Metadata> {
  const local = registry.get(symbol);
  if (local?.contract_address || local?.primary_chain) {
    const mapped = normalizePlatformToChain(local.primary_chain);
    return {
      source: "REGISTRY",
      name: local.name,
      cmcId: local.cmc_id,
      primaryChain: local.primary_chain,
      scanChain: mapped.scanChain,
      contractAddress: local.contract_address,
    };
  }
  const cached = cache.get(symbol);
  if (cached?.contractAddress && cached.primaryChain) return cached;
  const cmc = await cmcMetadata(symbol);
  if (cmc?.contractAddress && cmc.primaryChain) return cmc;
  const dexScreener = await dexScreenerMetadata(symbol);
  if (dexScreener?.contractAddress && dexScreener.primaryChain) return dexScreener;
  return cmc || dexScreener || { source: "NONE", name: "", cmcId: "", primaryChain: "", scanChain: "", contractAddress: "" };
}

function classifyStatus(age: number, metadata: Metadata, days: number): DiscoveryStatus {
  if (age > days) return "NOT_NEW_ENOUGH";
  if (!metadata.contractAddress || !metadata.primaryChain) return "METADATA_REPAIR";
  if (!isSupportedScanChain(metadata.scanChain)) return "UNSUPPORTED_CHAIN";
  return "READY_EVM_CHAIN_SCAN";
}

function reasonFor(row: NewSwapCandidate): string {
  if (row.discoveryStatus === "READY_EVM_CHAIN_SCAN") return "new OKX USDT swap has EVM contract metadata and can enter chain scan";
  if (row.discoveryStatus === "UNSUPPORTED_CHAIN") return `chain not supported by current Moralis/EVM scan path: ${row.primaryChain}`;
  if (row.discoveryStatus === "METADATA_REPAIR") return "missing chain or contract metadata";
  return "outside requested new-listing window";
}

function nextActionFor(row: NewSwapCandidate): string {
  if (row.discoveryStatus === "READY_EVM_CHAIN_SCAN") return "write to chain-scan candidates and run light/entity/CEX/evidence-depth";
  if (row.discoveryStatus === "UNSUPPORTED_CHAIN") return "add chain-specific scanner before interpreting on-chain flows";
  if (row.discoveryStatus === "METADATA_REPAIR") return "resolve token contract and primary chain via CMC/DexScreener/CoinGecko/OKX announcement before chain scan";
  return "keep in historical OKX contract universe only";
}

function buildReport(rows: NewSwapCandidate[], options: Options): string {
  const ready = rows.filter((row) => row.discoveryStatus === "READY_EVM_CHAIN_SCAN");
  const repair = rows.filter((row) => row.discoveryStatus !== "READY_EVM_CHAIN_SCAN");
  const table = (items: NewSwapCandidate[]) => {
    if (items.length === 0) return "No rows.";
    return [
      "| token | inst | listed | age_d | status | chain | oi_usd | funding | opp | frag | trad | reason |",
      "| --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ...items.map((row) => `| ${row.token} | ${row.instId} | ${row.listTime} | ${row.ageDays.toFixed(1)} | ${row.discoveryStatus} | ${row.primaryChain || ""} | ${row.openInterestUsd === null ? "" : row.openInterestUsd.toFixed(0)} | ${row.fundingRate === null ? "" : row.fundingRate.toFixed(8)} | ${row.opportunityScore} | ${row.fragilityScore} | ${row.tradabilityScore} | ${row.reason} |`),
    ].join("\n");
  };
  return [
    "# OKX New Swap Discovery",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Window: latest ${options.days} days, limit ${options.limit}`,
    `Universe: ${options.cryptoOnly ? "OKX crypto USDT swaps only (instCategory=1)" : "all OKX USDT swaps including non-crypto categories"}`,
    "",
    "## Ready For EVM Chain Scan",
    "",
    table(ready),
    "",
    "## Repair / Unsupported",
    "",
    table(repair),
    "",
    "## Guardrails",
    "",
    "- This is an OKX derivatives discovery universe, not a trade list.",
    "- New-listing momentum is treated as context only; chain evidence is required before directional interpretation.",
    "- Non-EVM or missing-contract rows are not force-scanned.",
  ].join("\n");
}

async function main() {
  loadDotenv();
  const options = parseArgs();
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  if (!existsSync(VALIDATION_DIR)) mkdirSync(VALIDATION_DIR, { recursive: true });

  const registry = new Map(rowsToObjects<RegistryRow>(REGISTRY_PATH).map((row) => [row.symbol.toUpperCase(), row]));
  const metadataCache = loadMetadataCache();
  const instruments = await okxGet("/public/instruments?instType=SWAP");
  const now = Date.now();
  const usdtSwaps = instruments
    .filter((row: OkxInstrument) => options.cryptoOnly ? isCryptoUsdtSwapInstrument(row) : row.instId?.endsWith("-USDT-SWAP") && row.state === "live")
    .map((row: OkxInstrument) => ({ row, listTimeMs: parseListTime(row.listTime), token: symbolFromInstId(String(row.instId)) }))
    .filter((row) => ageDays(row.listTimeMs, now) <= options.days)
    .sort((a, b) => b.listTimeMs - a.listTimeMs)
    .slice(0, options.limit);

  const marketMaps = await fetchMarketMaps();
  const candidates = await concurrentMap(usdtSwaps, 6, async (item) => {
    const metadata = await resolveMetadata(item.token, registry, metadataCache);
    const snapshot = await fetchOkxSnapshot(String(item.row.instId), marketMaps);
    const age = ageDays(item.listTimeMs, now);
    const scores = scoreNewSwapCandidate({
      ageDays: age,
      openInterestUsd: snapshot.openInterestUsd,
      fundingRate: snapshot.fundingRate,
      maxLeverage: num(item.row.lever),
      hasContract: Boolean(metadata.contractAddress),
      supportedChain: isSupportedScanChain(metadata.scanChain),
    });
    const base: NewSwapCandidate = {
      token: item.token,
      instId: String(item.row.instId),
      instCategory: String(item.row.instCategory || item.row.category || ""),
      listTime: item.listTimeMs ? new Date(item.listTimeMs).toISOString() : "",
      ageDays: age,
      state: String(item.row.state || ""),
      maxLeverage: num(item.row.lever),
      lastPrice: snapshot.lastPrice,
      fundingRate: snapshot.fundingRate,
      openInterestUsd: snapshot.openInterestUsd,
      metadataSource: metadata.source,
      primaryChain: metadata.primaryChain,
      scanChain: metadata.scanChain,
      contractAddress: metadata.contractAddress,
      discoveryStatus: classifyStatus(age, metadata, options.days),
      ...scores,
      reason: "",
      nextAction: "",
    };
    base.reason = reasonFor(base);
    base.nextAction = nextActionFor(base);
    return base;
  });

  const outPath = join(OUT_DIR, "okx_new_swap_candidates_latest.csv");
  const reportPath = join(REPORTS_DIR, "okx_new_swap_discovery_latest.md");
  writeCsv(outPath, [
    ["checked_at", "token", "inst_id", "inst_category", "list_time", "age_days", "state", "max_leverage", "last_price", "funding_rate", "open_interest_usd", "metadata_source", "primary_chain", "scan_chain", "contract_address", "discovery_status", "priority", "opportunity_score", "fragility_score", "tradability_score", "reason", "next_action"],
    ...candidates.map((row) => [new Date().toISOString(), row.token, row.instId, row.instCategory, row.listTime, row.ageDays.toFixed(2), row.state, row.maxLeverage, row.lastPrice ?? "", row.fundingRate ?? "", row.openInterestUsd ?? "", row.metadataSource, row.primaryChain, row.scanChain, row.contractAddress, row.discoveryStatus, row.priority, row.opportunityScore, row.fragilityScore, row.tradabilityScore, row.reason, row.nextAction]),
  ]);
  writeFileSync(reportPath, buildReport(candidates, options), "utf-8");
  writeMetadataCache(metadataCache, candidates);

  if (options.writeChainCandidates) {
    const ready = candidates.filter((row) => row.discoveryStatus === "READY_EVM_CHAIN_SCAN");
    const chainPath = join(VALIDATION_DIR, "chain_scan_candidates_latest.csv");
    writeCsv(chainPath, [
      ["snapshot_id", "observed_at", "token", "decision", "scan_stage", "priority", "primary_chain", "scan_chain", "contract_address", "opportunity_score", "fragility_score", "tradability_score", "scanner_label", "state_matrix", "scan_channel", "reason", "next_action"],
      ...ready.map((row) => [
        `okx-new-swap-${new Date().toISOString().replace(/[:.]/g, "-")}`,
        new Date().toISOString(),
        row.token,
        "READY_FOR_CHAIN_SCAN",
        "GO_LIGHT_SCAN",
        row.priority,
        row.primaryChain,
        row.scanChain,
        row.contractAddress,
        row.opportunityScore,
        row.fragilityScore,
        row.tradabilityScore,
        "OKX_NEW_SWAP",
        row.opportunityScore >= 40 ? "NEW_SWAP__MEDIUM_OPP" : "NEW_SWAP__WATCH",
        "MORALIS_PRIMARY",
        row.reason,
        row.nextAction,
      ]),
    ]);
  }

  console.log("=== OKX New Swap Discovery ===");
  console.log(`Window days: ${options.days}`);
  console.log(`Universe: ${options.cryptoOnly ? "crypto USDT swaps only" : "all USDT swaps"}`);
  console.log(`Live USDT swaps in window: ${candidates.length}`);
  console.log(`Ready EVM chain scan: ${candidates.filter((row) => row.discoveryStatus === "READY_EVM_CHAIN_SCAN").length}`);
  for (const row of candidates.slice(0, 20)) {
    console.log(`${row.token}: ${row.discoveryStatus} age=${row.ageDays.toFixed(1)}d chain=${row.primaryChain || "?"} oi=${row.openInterestUsd ? row.openInterestUsd.toFixed(0) : "?"}`);
  }
  console.log(`Output: ${outPath}`);
  console.log(`Report: ${reportPath}`);
  if (options.writeChainCandidates) console.log(`Chain candidates: ${join(VALIDATION_DIR, "chain_scan_candidates_latest.csv")}`);
}

const isMain = process.argv[1]?.includes("okx_new_swap_discovery");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
