import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";
import { fetchJsonWithFallback } from "../../../utils/http.js";
import { classifyEntityKind, classifyTransferDirection, type EntityKind, type FlowDirection } from "./entity_flow_review.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const CANDIDATES_PATH = join(ROOT, "data", "altcoin", "intelligence", "validation", "chain_scan_candidates_latest.csv");
const OUT_DIR = join(ROOT, "data", "altcoin", "intelligence", "onchain");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "onchain");
const ARKHAM_LABEL_REGISTRY_PATH = join(ROOT, "data", "altcoin", "intelligence", "arkham", "labels", "entity_label_registry_v1.csv");
const ENTITY_TRANSFERS_PATH = join(OUT_DIR, "entity_flow_transfers_latest.csv");
const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";
const ETHERSCAN_BASE = "https://api.etherscan.io/v2/api";
const BSCSCAN_BASE = "https://api.bscscan.com/api";
const ETHERSCAN_PAGE_SIZE = 1000;
let moralisDisabledForRun = false;

interface ChainCandidate {
  token: string;
  priority: string;
  scan_chain: string;
  contract_address: string;
}

export interface TransferLite {
  token: string;
  timestampMs: number;
  valueDecimal: number;
  direction: FlowDirection;
  labeled: boolean;
}

interface TransferFetchResult {
  transfers: TransferLite[];
  exhausted: boolean;
  pagesFetched: number;
  stopReason: "TARGET_WINDOW_COVERED" | "CURSOR_EXHAUSTED" | "PAGE_LIMIT" | "FETCH_ERROR";
  fetchStatus: string;
}

interface ScanOptions {
  limit: number;
  pages: number;
  windows: number[];
  targetWindowHours: number;
  tokens: Set<string>;
  source: "auto" | "moralis" | "explorer";
}

export function normalizeCexFlowSource(value: string | undefined): ScanOptions["source"] {
  return value === "explorer" || value === "moralis" ? value : "auto";
}

export interface EntityTransferRow {
  chain: string;
  from_address: string;
  to_address: string;
  from_kind: EntityKind;
  to_kind: EntityKind;
  from_entity: string;
  to_entity: string;
  from_label: string;
  to_label: string;
}

export interface ArkhamRegistryRow {
  chain: string;
  address: string;
  address_type: string;
  arkham_entity_name: string;
  arkham_entity_type: string;
  arkham_label: string;
  moralis_entity: string;
  moralis_label: string;
  merged_entity: string;
  merged_label: string;
}

export interface AddressLabel {
  entity: string;
  label: string;
  kind: EntityKind;
  source: string;
}

export interface FlowWindowStats {
  token: string;
  windowHours: number;
  transfers: number;
  labeledTransfers: number;
  labelCoverage: number;
  cexInCount: number;
  cexOutCount: number;
  cexInValue: number;
  cexOutValue: number;
  netCexCount: number;
  netCexValue: number;
  dexCount: number;
  unknownCount: number;
  sampleStart: string;
  sampleEnd: string;
  windowCoverageRatio: number;
  windowFullyCovered: boolean;
  sampleExhausted?: boolean;
  fetchPages?: number;
  fetchStopReason?: string;
  fetchStatus?: string;
  decision: "CEX_INFLOW_RISK" | "CEX_OUTFLOW_OR_NEUTRAL" | "LOW_COVERAGE" | "PARTIAL_WINDOW" | "NO_DATA";
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

function num(value: string | undefined): number {
  const parsed = Number(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusSlug(value: string): string {
  return value
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || "UNEXPECTED_RESPONSE";
}

function canonicalChain(chain: string): string {
  const lower = chain.toLowerCase();
  const aliases: Record<string, string> = {
    eth: "ethereum",
    ethereum: "ethereum",
    bsc: "bsc",
    binance: "bsc",
    arbitrum: "arbitrum",
    arb: "arbitrum",
    base: "base",
    optimism: "optimism",
    op: "optimism",
    polygon: "polygon",
    matic: "polygon",
    avalanche: "avalanche",
    avax: "avalanche",
  };
  return aliases[lower] || lower;
}

function etherscanChainId(chain: string): string | null {
  const ids: Record<string, string> = {
    ethereum: "1",
    bsc: "56",
    arbitrum: "42161",
    base: "8453",
    optimism: "10",
    polygon: "137",
    avalanche: "43114",
  };
  return ids[canonicalChain(chain)] || null;
}

function addressKey(chain: string, address: string): string {
  return `${canonicalChain(chain)}:${address.toLowerCase()}`;
}

function addressAnyKey(address: string): string {
  return `*:${address.toLowerCase()}`;
}

function kindFromRegistry(row: ArkhamRegistryRow): EntityKind {
  const addressType = String(row.address_type || "").toUpperCase();
  if (addressType === "CEX_ENTITY") return "CEX";
  if (addressType === "DEX_POOL") return "DEX";
  if (addressType === "FUND_OR_INSTITUTION" || addressType === "MARKET_MAKER_PROXY") return "FUND_OR_MM";
  const entity = row.merged_entity || row.arkham_entity_name || row.moralis_entity || row.arkham_entity_type;
  const label = row.merged_label || row.arkham_label || row.moralis_label || row.address_type;
  return classifyEntityKind(entity, label);
}

function shouldPreferLabel(current: AddressLabel | undefined, next: AddressLabel): boolean {
  if (!current) return true;
  if (current.kind === "UNKNOWN" && next.kind !== "UNKNOWN") return true;
  if (current.source !== "ARKHAM_REGISTRY" && next.source === "ARKHAM_REGISTRY" && next.kind !== "UNKNOWN") return true;
  return false;
}

function putLabel(labels: Map<string, AddressLabel>, chain: string, address: string, label: AddressLabel): void {
  if (!address) return;
  const key = addressKey(chain, address);
  if (shouldPreferLabel(labels.get(key), label)) labels.set(key, label);
  if (["CEX", "DEX", "BRIDGE", "FUND_OR_MM"].includes(label.kind)) {
    const keyAny = addressAnyKey(address);
    if (shouldPreferLabel(labels.get(keyAny), label)) labels.set(keyAny, label);
  }
}

export function buildAddressLabelMapFromRows(entityRows: EntityTransferRow[], registryRows: ArkhamRegistryRow[]): Map<string, AddressLabel> {
  const labels = new Map<string, AddressLabel>();

  for (const row of registryRows) {
    const entity = row.merged_entity || row.arkham_entity_name || row.moralis_entity || "";
    const label = row.merged_label || row.arkham_label || row.moralis_label || "";
    const kind = kindFromRegistry(row);
    if (!entity && !label && kind === "UNKNOWN") continue;
    putLabel(labels, row.chain || "ethereum", row.address, { entity, label, kind, source: "ARKHAM_REGISTRY" });
  }

  for (const row of entityRows) {
    putLabel(labels, row.chain || "ethereum", row.from_address, {
      entity: row.from_entity || "",
      label: row.from_label || "",
      kind: row.from_kind || classifyEntityKind(row.from_entity || "", row.from_label || ""),
      source: "MORALIS_TRANSFER_CACHE",
    });
    putLabel(labels, row.chain || "ethereum", row.to_address, {
      entity: row.to_entity || "",
      label: row.to_label || "",
      kind: row.to_kind || classifyEntityKind(row.to_entity || "", row.to_label || ""),
      source: "MORALIS_TRANSFER_CACHE",
    });
  }

  return labels;
}

function loadAddressLabels(): Map<string, AddressLabel> {
  return buildAddressLabelMapFromRows(
    rowsToObjects<EntityTransferRow>(ENTITY_TRANSFERS_PATH),
    rowsToObjects<ArkhamRegistryRow>(ARKHAM_LABEL_REGISTRY_PATH),
  );
}

async function moralisGet(path: string): Promise<{ status: string; data: any }> {
  const key = process.env.MORALIS_API_KEY || "";
  if (!key) return { status: "MORALIS_NOT_CONFIGURED", data: null };
  let lastStatus = "ERROR";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetchJsonWithFallback(`${MORALIS_BASE}${path}`, {
        headers: { "X-API-Key": key, accept: "application/json" },
      }, 30_000);
      if (response.status >= 200 && response.status < 300) return { status: "OK", data: response.body };
      lastStatus = response.status === 429 ? "RATE_LIMITED" : `HTTP_${response.status}`;
      if (![429, 500, 502, 503, 504].includes(response.status)) return { status: lastStatus, data: null };
    } catch (err) {
      lastStatus = err instanceof Error ? `ERROR_${err.message}` : "ERROR";
    }
    await sleep(750 * (attempt + 1));
  }
  return { status: lastStatus, data: null };
}

async function etherscanGet(chain: string, params: Record<string, string>): Promise<{ status: string; data: any }> {
  const key = process.env.ETHERSCAN_API_KEY || "";
  const chainid = etherscanChainId(chain);
  if (!key) return { status: "ETHERSCAN_NOT_CONFIGURED", data: null };
  if (!chainid) return { status: "ETHERSCAN_UNSUPPORTED_CHAIN", data: null };
  let lastStatus = "ETHERSCAN_ERROR";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const url = new URL(ETHERSCAN_BASE);
      url.search = new URLSearchParams({ chainid, ...params, apikey: key }).toString();
      const response = await fetchJsonWithFallback(url.toString(), { headers: { accept: "application/json" } }, 30_000);
      if (response.status < 200 || response.status >= 300) {
        lastStatus = `ETHERSCAN_HTTP_${response.status}`;
      } else {
        const body = response.body as any;
        if (Array.isArray(body?.result)) return { status: "ETHERSCAN_OK", data: body };
        const message = String(body?.message || "");
        const result = String(body?.result || "");
        if (/no transactions found/i.test(message) || /no transactions found/i.test(result)) {
          return { status: "ETHERSCAN_OK", data: { ...body, result: [] } };
        }
        lastStatus = `ETHERSCAN_${statusSlug([message, result].filter(Boolean).join("_"))}`;
        if (!/rate limit|timeout|busy/i.test(`${message} ${result}`)) return { status: lastStatus, data: null };
      }
    } catch (err) {
      lastStatus = err instanceof Error ? `ETHERSCAN_ERROR_${err.message}` : "ETHERSCAN_ERROR";
    }
    await sleep(750 * (attempt + 1));
  }
  return { status: lastStatus, data: null };
}

async function bscScanGet(params: Record<string, string>): Promise<{ status: string; data: any }> {
  const key = process.env.BSCSCAN_API_KEY || "";
  if (!key) return { status: "BSCSCAN_NOT_CONFIGURED", data: null };
  let lastStatus = "BSCSCAN_ERROR";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const url = new URL(BSCSCAN_BASE);
      url.search = new URLSearchParams({ ...params, apikey: key }).toString();
      const response = await fetchJsonWithFallback(url.toString(), { headers: { accept: "application/json" } }, 30_000);
      if (response.status < 200 || response.status >= 300) {
        lastStatus = `BSCSCAN_HTTP_${response.status}`;
      } else {
        const body = response.body as any;
        if (Array.isArray(body?.result)) return { status: "BSCSCAN_OK", data: body };
        const message = String(body?.message || "");
        const result = String(body?.result || "");
        if (/no transactions found/i.test(message) || /no transactions found/i.test(result)) {
          return { status: "BSCSCAN_OK", data: { ...body, result: [] } };
        }
        lastStatus = `BSCSCAN_${statusSlug([message, result].filter(Boolean).join("_"))}`;
        if (!/rate limit|timeout|busy/i.test(`${message} ${result}`)) return { status: lastStatus, data: null };
      }
    } catch (err) {
      lastStatus = err instanceof Error ? `BSCSCAN_ERROR_${statusSlug(err.message)}` : "BSCSCAN_ERROR";
    }
    await sleep(750 * (attempt + 1));
  }
  return { status: lastStatus, data: null };
}

function firstArray(data: any, keys: string[]): any[] {
  for (const key of keys) {
    const value = data?.[key];
    if (Array.isArray(value)) return value;
  }
  return Array.isArray(data) ? data : [];
}

function parseTransfer(token: string, row: any): TransferLite | null {
  const timestampMs = Date.parse(row.block_timestamp || "");
  if (!Number.isFinite(timestampMs)) return null;
  const fromKind = classifyEntityKind(row.from_address_entity || "", row.from_address_label || "");
  const toKind = classifyEntityKind(row.to_address_entity || "", row.to_address_label || "");
  return {
    token,
    timestampMs,
    valueDecimal: num(row.value_decimal || row.value),
    direction: classifyTransferDirection(fromKind, toKind),
    labeled: fromKind !== "UNKNOWN" || toKind !== "UNKNOWN",
  };
}

export function decimalStringToNumber(value: string | number | undefined, decimalsRaw: string | number | undefined): number {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  if (!digits) return 0;
  const decimals = Math.max(0, Math.min(36, Number(decimalsRaw ?? 0) || 0));
  if (decimals === 0) return Number(digits);
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fractional = padded.slice(-decimals).slice(0, 12).replace(/0+$/, "");
  const parsed = Number(`${whole}${fractional ? `.${fractional}` : ""}`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function labelFor(labels: Map<string, AddressLabel>, chain: string, address: string): AddressLabel | undefined {
  const lower = String(address || "").toLowerCase();
  if (!lower) return undefined;
  return labels.get(addressKey(chain, lower)) || labels.get(addressAnyKey(lower));
}

export function parseEtherscanTokenTransfer(
  token: string,
  chain: string,
  row: any,
  labels: Map<string, AddressLabel>,
): TransferLite | null {
  const rawTs = Number(row.timeStamp || row.timestamp || "");
  const timestampMs = Number.isFinite(rawTs) && rawTs > 0 ? rawTs * 1000 : Date.parse(row.block_timestamp || "");
  if (!Number.isFinite(timestampMs)) return null;
  const from = String(row.from || row.from_address || "");
  const to = String(row.to || row.to_address || "");
  const fromLabel = labelFor(labels, chain, from);
  const toLabel = labelFor(labels, chain, to);
  const fromKind = fromLabel?.kind || "UNKNOWN";
  const toKind = toLabel?.kind || "UNKNOWN";
  return {
    token,
    timestampMs,
    valueDecimal: decimalStringToNumber(row.value, row.tokenDecimal ?? row.token_decimal ?? row.decimals),
    direction: classifyTransferDirection(fromKind, toKind),
    labeled: fromKind !== "UNKNOWN" || toKind !== "UNKNOWN",
  };
}

async function fetchEtherscanTransfers(
  candidate: ChainCandidate,
  pages: number,
  targetWindowHours: number,
  labels: Map<string, AddressLabel>,
): Promise<TransferFetchResult> {
  const rows: TransferLite[] = [];
  let exhausted = false;
  let pagesFetched = 0;
  let stopReason: TransferFetchResult["stopReason"] = "PAGE_LIMIT";
  let fetchStatus = "ETHERSCAN_OK";
  const targetWindowMs = Math.max(0, targetWindowHours) * 60 * 60 * 1000;
  for (let page = 1; page <= pages; page++) {
    const response = await etherscanGet(candidate.scan_chain, {
      module: "account",
      action: "tokentx",
      contractaddress: candidate.contract_address,
      page: String(page),
      offset: String(ETHERSCAN_PAGE_SIZE),
      sort: "desc",
    });
    fetchStatus = response.status;
    if (response.status !== "ETHERSCAN_OK") {
      stopReason = "FETCH_ERROR";
      break;
    }
    pagesFetched += 1;
    const batch = firstArray(response.data, ["result"]);
    for (const raw of batch) {
      const parsed = parseEtherscanTokenTransfer(candidate.token, candidate.scan_chain, raw, labels);
      if (parsed) rows.push(parsed);
    }

    if (targetWindowMs > 0 && rows.length > 0) {
      const timestamps = rows.map((row) => row.timestampMs);
      const sampleStartMs = Math.min(...timestamps);
      const sampleEndMs = Math.max(...timestamps);
      if (sampleStartMs <= sampleEndMs - targetWindowMs) {
        stopReason = "TARGET_WINDOW_COVERED";
        break;
      }
    }

    if (batch.length < ETHERSCAN_PAGE_SIZE) {
      exhausted = true;
      stopReason = "CURSOR_EXHAUSTED";
      break;
    }
    await sleep(150);
  }
  return { transfers: rows, exhausted, pagesFetched, stopReason, fetchStatus };
}

async function fetchBscScanTransfers(
  candidate: ChainCandidate,
  pages: number,
  targetWindowHours: number,
  labels: Map<string, AddressLabel>,
): Promise<TransferFetchResult> {
  const rows: TransferLite[] = [];
  let exhausted = false;
  let pagesFetched = 0;
  let stopReason: TransferFetchResult["stopReason"] = "PAGE_LIMIT";
  let fetchStatus = "BSCSCAN_OK";
  const targetWindowMs = Math.max(0, targetWindowHours) * 60 * 60 * 1000;
  for (let page = 1; page <= pages; page++) {
    const response = await bscScanGet({
      module: "account",
      action: "tokentx",
      contractaddress: candidate.contract_address,
      page: String(page),
      offset: String(ETHERSCAN_PAGE_SIZE),
      sort: "desc",
    });
    fetchStatus = response.status;
    if (response.status !== "BSCSCAN_OK") {
      stopReason = "FETCH_ERROR";
      break;
    }
    pagesFetched += 1;
    const batch = firstArray(response.data, ["result"]);
    for (const raw of batch) {
      const parsed = parseEtherscanTokenTransfer(candidate.token, candidate.scan_chain, raw, labels);
      if (parsed) rows.push(parsed);
    }

    if (targetWindowMs > 0 && rows.length > 0) {
      const timestamps = rows.map((row) => row.timestampMs);
      const sampleStartMs = Math.min(...timestamps);
      const sampleEndMs = Math.max(...timestamps);
      if (sampleStartMs <= sampleEndMs - targetWindowMs) {
        stopReason = "TARGET_WINDOW_COVERED";
        break;
      }
    }

    if (batch.length < ETHERSCAN_PAGE_SIZE) {
      exhausted = true;
      stopReason = "CURSOR_EXHAUSTED";
      break;
    }
    await sleep(150);
  }
  return { transfers: rows, exhausted, pagesFetched, stopReason, fetchStatus };
}

async function fetchExplorerTransfers(
  candidate: ChainCandidate,
  pages: number,
  targetWindowHours: number,
  labels: Map<string, AddressLabel>,
): Promise<TransferFetchResult> {
  const primary = await fetchEtherscanTransfers(candidate, pages, targetWindowHours, labels);
  if (primary.fetchStatus === "ETHERSCAN_OK") return primary;
  if (canonicalChain(candidate.scan_chain) !== "bsc") return primary;

  const bsc = await fetchBscScanTransfers(candidate, pages, targetWindowHours, labels);
  if (bsc.fetchStatus === "BSCSCAN_OK" || bsc.transfers.length > primary.transfers.length) {
    return { ...bsc, fetchStatus: `${primary.fetchStatus}_${bsc.fetchStatus}` };
  }
  return { ...primary, fetchStatus: `${primary.fetchStatus}_${bsc.fetchStatus}` };
}

async function fetchTransfers(
  candidate: ChainCandidate,
  pages: number,
  targetWindowHours: number,
  labels: Map<string, AddressLabel>,
  source: ScanOptions["source"] = "auto",
): Promise<TransferFetchResult> {
  if (source === "explorer") {
    const explorer = await fetchExplorerTransfers(candidate, pages, targetWindowHours, labels);
    return { ...explorer, fetchStatus: `FORCED_EXPLORER_${explorer.fetchStatus}` };
  }

  if (moralisDisabledForRun) {
    const fallback = await fetchExplorerTransfers(candidate, pages, targetWindowHours, labels);
    return { ...fallback, fetchStatus: fallback.fetchStatus === "ETHERSCAN_OK" ? "MORALIS_DISABLED_ETHERSCAN_OK" : fallback.fetchStatus };
  }

  const rows: TransferLite[] = [];
  let cursor = "";
  let exhausted = false;
  let pagesFetched = 0;
  let stopReason: TransferFetchResult["stopReason"] = "PAGE_LIMIT";
  let fetchStatus = "OK";
  let moralisFailure = "";
  const targetWindowMs = Math.max(0, targetWindowHours) * 60 * 60 * 1000;
  for (let page = 0; page < pages; page++) {
    const query = new URLSearchParams({ chain: candidate.scan_chain, limit: "100", order: "DESC" });
    if (cursor) query.set("cursor", cursor);
    const response = await moralisGet(`/erc20/${candidate.contract_address}/transfers?${query.toString()}`);
    if (response.status !== "OK") {
      fetchStatus = response.status;
      moralisFailure = response.status;
      stopReason = "FETCH_ERROR";
      break;
    }
    pagesFetched += 1;
    const batch = firstArray(response.data, ["result", "transfers"]);
    for (const raw of batch) {
      const parsed = parseTransfer(candidate.token, raw);
      if (parsed) rows.push(parsed);
    }

    if (targetWindowMs > 0 && rows.length > 0) {
      const timestamps = rows.map((row) => row.timestampMs);
      const sampleStartMs = Math.min(...timestamps);
      const sampleEndMs = Math.max(...timestamps);
      if (sampleStartMs <= sampleEndMs - targetWindowMs) {
        stopReason = "TARGET_WINDOW_COVERED";
        break;
      }
    }

    cursor = response.data?.cursor || "";
    if (!cursor || batch.length === 0) {
      exhausted = true;
      stopReason = "CURSOR_EXHAUSTED";
      break;
    }
    await sleep(150);
  }
  if (moralisFailure) {
    if (moralisFailure === "MORALIS_NOT_CONFIGURED" || moralisFailure === "HTTP_401" || moralisFailure === "HTTP_403") {
      moralisDisabledForRun = true;
    }
    const fallback = await fetchExplorerTransfers(candidate, pages, targetWindowHours, labels);
    if (fallback.fetchStatus === "ETHERSCAN_OK" && (fallback.transfers.length > 0 || rows.length === 0)) {
      return { ...fallback, fetchStatus: `${moralisFailure}_ETHERSCAN_OK` };
    }
    if (fallback.transfers.length > rows.length) {
      return { ...fallback, fetchStatus: `${moralisFailure}_${fallback.fetchStatus}` };
    }
    if (rows.length === 0) {
      return { ...fallback, fetchStatus: `${moralisFailure}_${fallback.fetchStatus}` };
    }
  }
  return { transfers: rows, exhausted, pagesFetched, stopReason, fetchStatus };
}

export function bucketCexFlow(token: string, transfers: TransferLite[], windowHours: number, nowMs = Date.now(), sampleExhausted = false): FlowWindowStats {
  const windowMs = windowHours * 60 * 60 * 1000;
  const minTs = nowMs - windowMs;
  const timestamps = transfers.map((row) => row.timestampMs);
  const sampleStartMs = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const sampleEndMs = timestamps.length > 0 ? Math.max(...timestamps) : null;
  const windowFullyCovered = sampleExhausted || (sampleStartMs !== null && sampleStartMs <= minTs);
  const windowCoverageRatio = windowFullyCovered
    ? 1
    : sampleStartMs === null
      ? 0
      : Math.max(0, Math.min(1, (nowMs - sampleStartMs) / windowMs));
  const scoped = transfers.filter((row) => row.timestampMs >= minTs && row.timestampMs <= nowMs);
  const labeled = scoped.filter((row) => row.labeled);
  const cexIn = scoped.filter((row) => row.direction === "TO_CEX_PROXY");
  const cexOut = scoped.filter((row) => row.direction === "FROM_CEX_PROXY");
  const dex = scoped.filter((row) => row.direction === "TO_DEX_POOL" || row.direction === "FROM_DEX_POOL");
  const unknown = scoped.filter((row) => row.direction === "BETWEEN_UNKNOWN_WALLETS");
  const cexInValue = cexIn.reduce((sum, row) => sum + row.valueDecimal, 0);
  const cexOutValue = cexOut.reduce((sum, row) => sum + row.valueDecimal, 0);
  const labelCoverage = scoped.length > 0 ? labeled.length / scoped.length : 0;
  let decision: FlowWindowStats["decision"] = "NO_DATA";
  if (scoped.length > 0 && !windowFullyCovered) decision = "PARTIAL_WINDOW";
  else if (scoped.length > 0 && labelCoverage < 0.2) decision = "LOW_COVERAGE";
  else if (
    scoped.length > 0
    && cexInValue > cexOutValue
    && (cexIn.length > cexOut.length || cexInValue >= cexOutValue * 1.25)
  ) decision = "CEX_INFLOW_RISK";
  else if (scoped.length > 0) decision = "CEX_OUTFLOW_OR_NEUTRAL";

  return {
    token,
    windowHours,
    transfers: scoped.length,
    labeledTransfers: labeled.length,
    labelCoverage,
    cexInCount: cexIn.length,
    cexOutCount: cexOut.length,
    cexInValue,
    cexOutValue,
    netCexCount: cexIn.length - cexOut.length,
    netCexValue: cexInValue - cexOutValue,
    dexCount: dex.length,
    unknownCount: unknown.length,
    sampleStart: sampleStartMs === null ? "" : new Date(sampleStartMs).toISOString(),
    sampleEnd: sampleEndMs === null ? "" : new Date(sampleEndMs).toISOString(),
    windowCoverageRatio,
    windowFullyCovered,
    decision,
  };
}

function parseArgs(): ScanOptions {
  const arg = (name: string): string | undefined => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
  const limit = Number(arg("limit") || "5");
  const pages = Number(arg("pages") || "3");
  const sourceArg = arg("source");
  const windows = (arg("windows") || "1,4,24")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  const parsedWindows = windows.length > 0 ? windows : [1, 4, 24];
  const targetWindow = Number(arg("target-window-hours") || arg("target-window") || Math.max(...parsedWindows));
  return {
    limit: Number.isFinite(limit) && limit > 0 ? limit : 5,
    pages: Number.isFinite(pages) && pages > 0 ? pages : 3,
    windows: parsedWindows,
    targetWindowHours: Number.isFinite(targetWindow) && targetWindow > 0 ? targetWindow : Math.max(...parsedWindows),
    tokens: new Set((arg("tokens") || "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)),
    source: normalizeCexFlowSource(sourceArg),
  };
}

function mergeExistingRows(outPath: string, header: string[], selectedTokens: Set<string>): (string | number | null | undefined)[][] {
  if (selectedTokens.size === 0) return [];
  return rowsToObjects<Record<string, string>>(outPath)
    .filter((row) => !selectedTokens.has(String(row.token || "").toUpperCase()))
    .map((row) => header.map((key) => row[key] || ""));
}

function buildReport(rows: FlowWindowStats[]): string {
  const lines = [
    "# CEX Flow Window Scan",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| token | window_h | decision | transfers | label_coverage | window_coverage | fetch_pages | fetch_stop | fetch_status | cex_in | cex_out | net_count | net_value |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |",
  ];
  for (const row of rows) {
    lines.push(`| ${row.token} | ${row.windowHours} | ${row.decision} | ${row.transfers} | ${(row.labelCoverage * 100).toFixed(1)}% | ${(row.windowCoverageRatio * 100).toFixed(1)}% | ${row.fetchPages ?? ""} | ${row.fetchStopReason ?? ""} | ${row.fetchStatus ?? ""} | ${row.cexInCount} | ${row.cexOutCount} | ${row.netCexCount} | ${row.netCexValue.toFixed(4)} |`);
  }
  lines.push(
    "",
    "## Method Notes",
    "",
    "- Primary path: Moralis token transfers with entity labels.",
    "- Fallback path: Etherscan V2 tokentx raw transfers plus local Arkham/Moralis address labels when Moralis fetch fails.",
    "- CEX direction is transfer direction only; it does not prove exchange execution."
  );
  return lines.join("\n");
}

async function main() {
  loadDotenv();
  const options = parseArgs();
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const candidates = rowsToObjects<ChainCandidate>(CANDIDATES_PATH)
    .filter((row) => row.scan_chain && row.contract_address)
    .filter((row) => options.tokens.size === 0 || options.tokens.has(row.token.toUpperCase()))
    .slice(0, options.tokens.size > 0 ? Number.MAX_SAFE_INTEGER : options.limit);
  const labels = loadAddressLabels();

  const allStats: FlowWindowStats[] = [];
  for (const candidate of candidates) {
    const fetched = await fetchTransfers(candidate, options.pages, options.targetWindowHours, labels, options.source);
    const transfers = fetched.transfers;
    const latestTs = transfers.length > 0 ? Math.max(...transfers.map((row) => row.timestampMs)) : Date.now();
    for (const windowHours of options.windows) {
      allStats.push({
        ...bucketCexFlow(candidate.token, transfers, windowHours, latestTs, fetched.exhausted),
        sampleExhausted: fetched.exhausted,
        fetchPages: fetched.pagesFetched,
        fetchStopReason: fetched.stopReason,
        fetchStatus: fetched.fetchStatus,
      });
    }
  }

  const outPath = join(OUT_DIR, "cex_flow_window_scan_latest.csv");
  const reportPath = join(REPORTS_DIR, "cex_flow_window_scan_latest.md");
  const header = ["checked_at", "token", "window_hours", "transfers", "labeled_transfers", "label_coverage", "cex_in_count", "cex_out_count", "cex_in_value", "cex_out_value", "net_cex_count", "net_cex_value", "dex_count", "unknown_count", "sample_start", "sample_end", "window_coverage_ratio", "window_fully_covered", "sample_exhausted", "fetch_pages", "fetch_stop_reason", "fetch_status", "decision"];
  const selectedTokens = new Set(allStats.map((row) => row.token.toUpperCase()));
  const mergeTokens = options.tokens.size > 0 ? selectedTokens : new Set<string>();
  writeCsv(outPath, [
    header,
    ...mergeExistingRows(outPath, header, mergeTokens),
    ...allStats.map((row) => [new Date().toISOString(), row.token, row.windowHours, row.transfers, row.labeledTransfers, row.labelCoverage.toFixed(4), row.cexInCount, row.cexOutCount, row.cexInValue.toFixed(6), row.cexOutValue.toFixed(6), row.netCexCount, row.netCexValue.toFixed(6), row.dexCount, row.unknownCount, row.sampleStart, row.sampleEnd, row.windowCoverageRatio.toFixed(4), String(row.windowFullyCovered), String(Boolean(row.sampleExhausted)), row.fetchPages ?? "", row.fetchStopReason ?? "", row.fetchStatus ?? "", row.decision]),
  ]);
  writeFileSync(reportPath, buildReport(allStats), "utf-8");

  console.log("=== CEX Flow Window Scan ===");
  for (const row of allStats) {
    console.log(`${row.token} ${row.windowHours}h: ${row.decision} transfers=${row.transfers} netCex=${row.netCexCount}/${row.netCexValue.toFixed(2)} labels=${(row.labelCoverage * 100).toFixed(0)}% window=${(row.windowCoverageRatio * 100).toFixed(0)}% fetch=${row.fetchPages}:${row.fetchStopReason}:${row.fetchStatus}`);
  }
  console.log(`Output: ${outPath}`);
  console.log(`Report: ${reportPath}`);
}

const isMain = process.argv[1]?.includes("cex_flow_window_scan");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
