import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";
import { fetchJsonWithFallback } from "../../../utils/http.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const CANDIDATES_PATH = join(ROOT, "data", "altcoin", "intelligence", "validation", "chain_scan_candidates_latest.csv");
const OUT_DIR = join(ROOT, "data", "altcoin", "intelligence", "onchain");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "onchain");
const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";

interface ChainCandidate {
  token: string;
  priority: string;
  scan_chain: string;
  contract_address: string;
  opportunity_score: string;
  fragility_score: string;
  tradability_score: string;
}

export interface LightScanResult {
  token: string;
  chain: string;
  contractAddress: string;
  priority: string;
  opportunityScore: number;
  fragilityScore: number;
  tradabilityScore: number;
  priceStatus: string;
  priceUsd: number | null;
  holdersStatus: string;
  holdersRows: number;
  topHolderAddress: string;
  topHolderBalance: string;
  transfersStatus: string;
  transfersRows: number;
  transferEntityHits: number;
  transferLabelHits: number;
  latestTransferAt: string;
  scanStatus: "OK" | "PARTIAL" | "FAILED";
  promotionHint: "PROMOTE_ENTITY_FLOW_REVIEW" | "BASELINE_ONLY" | "RETRY_REQUIRED";
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

async function moralisGet(path: string): Promise<{ status: string; data: any }> {
  const key = process.env.MORALIS_API_KEY || "";
  if (!key) return { status: "MORALIS_NOT_CONFIGURED", data: null };
  try {
    const response = await fetchJsonWithFallback(`${MORALIS_BASE}${path}`, {
      headers: { "X-API-Key": key, accept: "application/json" },
    });
    if (response.status === 429) return { status: "RATE_LIMITED", data: null };
    if (response.status === 401 || response.status === 403) return { status: `AUTH_${response.status}`, data: null };
    if (response.status < 200 || response.status >= 300) return { status: `HTTP_${response.status}`, data: null };
    return { status: "OK", data: response.body };
  } catch (err) {
    return { status: err instanceof Error ? `ERROR_${err.message}` : "ERROR", data: null };
  }
}

function resultStatus(statuses: string[]): LightScanResult["scanStatus"] {
  const ok = statuses.filter((status) => status === "OK").length;
  if (ok === statuses.length) return "OK";
  if (ok > 0) return "PARTIAL";
  return "FAILED";
}

export function promotionHint(result: Pick<LightScanResult, "scanStatus" | "opportunityScore" | "transferEntityHits" | "transferLabelHits" | "holdersRows" | "transfersRows">): LightScanResult["promotionHint"] {
  if (result.scanStatus === "FAILED") return "RETRY_REQUIRED";
  if (result.opportunityScore >= 45 && (result.transferEntityHits > 0 || result.transferLabelHits > 0 || result.holdersRows >= 10 || result.transfersRows >= 10)) {
    return "PROMOTE_ENTITY_FLOW_REVIEW";
  }
  return "BASELINE_ONLY";
}

function firstArray(data: any, keys: string[]): any[] {
  for (const key of keys) {
    const value = data?.[key];
    if (Array.isArray(value)) return value;
  }
  return Array.isArray(data) ? data : [];
}

async function scanOne(candidate: ChainCandidate): Promise<LightScanResult> {
  const token = candidate.token;
  const chain = candidate.scan_chain;
  const contract = candidate.contract_address;
  const price = await moralisGet(`/erc20/${contract}/price?chain=${chain}`);
  const holders = await moralisGet(`/erc20/${contract}/owners?chain=${chain}&limit=20&order=DESC`);
  const transfers = await moralisGet(`/erc20/${contract}/transfers?chain=${chain}&limit=20&order=DESC`);

  const holderRows = firstArray(holders.data, ["result", "holders"]);
  const transferRows = firstArray(transfers.data, ["result", "transfers"]);
  const topHolder = holderRows[0] || {};
  const latestTransfer = transferRows[0] || {};
  const entityHits = transferRows.filter((row) => row?.from_address_entity || row?.to_address_entity).length;
  const labelHits = transferRows.filter((row) => row?.from_address_label || row?.to_address_label).length;
  const scanStatus = resultStatus([price.status, holders.status, transfers.status]);

  const result: LightScanResult = {
    token,
    chain,
    contractAddress: contract,
    priority: candidate.priority,
    opportunityScore: num(candidate.opportunity_score),
    fragilityScore: num(candidate.fragility_score),
    tradabilityScore: num(candidate.tradability_score),
    priceStatus: price.status,
    priceUsd: typeof price.data?.usdPrice === "number" ? price.data.usdPrice : null,
    holdersStatus: holders.status,
    holdersRows: holderRows.length,
    topHolderAddress: topHolder.owner_address || topHolder.wallet_address || topHolder.address || "",
    topHolderBalance: String(topHolder.balance_formatted || topHolder.balance || ""),
    transfersStatus: transfers.status,
    transfersRows: transferRows.length,
    transferEntityHits: entityHits,
    transferLabelHits: labelHits,
    latestTransferAt: latestTransfer.block_timestamp || latestTransfer.blockTimestamp || "",
    scanStatus,
    promotionHint: "BASELINE_ONLY",
  };
  result.promotionHint = promotionHint(result);
  return result;
}

function parseArgs(): { limit: number } {
  const arg = process.argv.find((value) => value.startsWith("--limit="))?.split("=")[1];
  const limit = Number(arg || "5");
  return { limit: Number.isFinite(limit) && limit > 0 ? limit : 5 };
}

async function main() {
  loadDotenv();
  const { limit } = parseArgs();
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const candidates = rowsToObjects<ChainCandidate>(CANDIDATES_PATH)
    .filter((row) => row.scan_chain && row.contract_address)
    .slice(0, limit);

  const results: LightScanResult[] = [];
  for (const candidate of candidates) {
    results.push(await scanOne(candidate));
  }

  const outPath = join(OUT_DIR, "light_chain_scan_latest.csv");
  const reportPath = join(REPORTS_DIR, "light_chain_scan_latest.md");
  writeCsv(outPath, [
    ["checked_at", "token", "chain", "contract_address", "priority", "opportunity_score", "fragility_score", "tradability_score", "price_status", "price_usd", "holders_status", "holders_rows", "top_holder_address", "top_holder_balance", "transfers_status", "transfers_rows", "transfer_entity_hits", "transfer_label_hits", "latest_transfer_at", "scan_status", "promotion_hint"],
    ...results.map((row) => [new Date().toISOString(), row.token, row.chain, row.contractAddress, row.priority, row.opportunityScore, row.fragilityScore, row.tradabilityScore, row.priceStatus, row.priceUsd ?? "", row.holdersStatus, row.holdersRows, row.topHolderAddress, row.topHolderBalance, row.transfersStatus, row.transfersRows, row.transferEntityHits, row.transferLabelHits, row.latestTransferAt, row.scanStatus, row.promotionHint]),
  ]);

  const lines = [
    "# Light Chain Scan",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| token | chain | status | holders | transfers | entity_hits | label_hits | promotion |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...results.map((row) => `| ${row.token} | ${row.chain} | ${row.scanStatus} | ${row.holdersRows} | ${row.transfersRows} | ${row.transferEntityHits} | ${row.transferLabelHits} | ${row.promotionHint} |`),
  ];
  writeFileSync(reportPath, lines.join("\n"), "utf-8");

  console.log("=== Light Chain Scan ===");
  console.log(`Candidates scanned: ${results.length}`);
  for (const row of results) {
    console.log(`${row.token}: ${row.scanStatus} holders=${row.holdersRows} transfers=${row.transfersRows} entity=${row.transferEntityHits} label=${row.transferLabelHits} ${row.promotionHint}`);
  }
  console.log(`Output: ${outPath}`);
  console.log(`Report: ${reportPath}`);
  if (results.some((row) => row.scanStatus === "FAILED")) process.exitCode = 1;
}

const isMain = process.argv[1]?.includes("light_chain_scan");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
