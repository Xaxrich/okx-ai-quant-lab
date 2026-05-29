import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";
import { fetchJsonWithFallback } from "../../../utils/http.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const CANDIDATES_PATH = join(ROOT, "data", "altcoin", "intelligence", "validation", "chain_scan_candidates_latest.csv");
const OUT_DIR = join(ROOT, "data", "altcoin", "intelligence", "onchain");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "onchain");
const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";

export type EntityKind = "CEX" | "DEX" | "BRIDGE" | "FUND_OR_MM" | "PROJECT_OR_PROTOCOL" | "LABELED_OTHER" | "UNKNOWN";
export type FlowDirection =
  | "TO_CEX_PROXY"
  | "FROM_CEX_PROXY"
  | "TO_DEX_POOL"
  | "FROM_DEX_POOL"
  | "TO_BRIDGE"
  | "FROM_BRIDGE"
  | "TO_FUND_OR_MM"
  | "FROM_FUND_OR_MM"
  | "BETWEEN_LABELED_ENTITIES"
  | "BETWEEN_UNKNOWN_WALLETS";

export type ReviewDecision = "DEEPEN_ENTITY_FLOW" | "DEEPEN_HOLDER_IDENTITY_REVIEW" | "WATCH_CEX_INFLOW_RISK" | "WATCH_LOW_CONFIDENCE" | "WATCH_CONCENTRATION_RISK" | "RETRY_REQUIRED";

interface ChainCandidate {
  token: string;
  priority: string;
  scan_chain: string;
  contract_address: string;
  opportunity_score: string;
  fragility_score: string;
  tradability_score: string;
  state_matrix: string;
}

interface MoralisTransfer {
  transaction_hash?: string;
  block_timestamp?: string;
  from_address?: string;
  to_address?: string;
  from_address_entity?: string | null;
  to_address_entity?: string | null;
  from_address_label?: string | null;
  to_address_label?: string | null;
  value?: string;
  value_decimal?: string;
}

interface MoralisOwner {
  owner_address?: string;
  owner_address_label?: string | null;
  entity?: string | null;
  is_contract?: boolean;
  balance_formatted?: string;
  usd_value?: string;
  percentage_relative_to_total_supply?: number;
}

export interface ClassifiedTransfer {
  token: string;
  chain: string;
  txHash: string;
  timestamp: string;
  fromAddress: string;
  toAddress: string;
  valueDecimal: number;
  fromEntity: string;
  toEntity: string;
  fromLabel: string;
  toLabel: string;
  fromKind: EntityKind;
  toKind: EntityKind;
  direction: FlowDirection;
}

export interface EntityFlowSummary {
  token: string;
  chain: string;
  priority: string;
  opportunityScore: number;
  fragilityScore: number;
  tradabilityScore: number;
  transferStatus: string;
  transferRows: number;
  entityLabelCoverage: number;
  cexInCount: number;
  cexOutCount: number;
  dexCount: number;
  bridgeCount: number;
  fundMmCount: number;
  unknownCount: number;
  cexInValue: number;
  cexOutValue: number;
  topEntityName: string;
  topEntityKind: EntityKind;
  topEntityShare: number;
  holdersStatus: string;
  holderRows: number;
  topHolderAddress: string;
  topHolderEntity: string;
  topHolderIsContract: boolean | null;
  topHolderPctSupply: number | null;
  top10HolderPctSupply: number | null;
  decision: ReviewDecision;
  reason: string;
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

function pct(value: number | null): string {
  return value === null ? "" : value.toFixed(4);
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

function firstArray(data: any, keys: string[]): any[] {
  for (const key of keys) {
    const value = data?.[key];
    if (Array.isArray(value)) return value;
  }
  return Array.isArray(data) ? data : [];
}

export function classifyEntityKind(entity: string, label: string): EntityKind {
  const text = `${entity} ${label}`.toLowerCase();
  if (!text.trim()) return "UNKNOWN";

  const has = (terms: string[]) => terms.some((term) => text.includes(term));
  if (has(["bridge", "stargate", "layerzero", "wormhole", "across", "synapse", "hop protocol", "orbiter"])) return "BRIDGE";
  if (has(["uniswap", "pancake", "sushiswap", "curve", "balancer", "aerodrome", "camelot", "kyber", "1inch", "cowswap", "matcha", "router", "pool", "dex"])) return "DEX";
  if (has(["binance", "okx", "coinbase", "bybit", "gate.io", "gate exchange", "kucoin", "kraken", "mexc", "bitget", "crypto.com", "huobi", "htx", "upbit", "bitfinex", "exchange"])) return "CEX";
  if (has(["wintermute", "jump", "market maker", "amber", "gsr", "cumberland", "flow traders", "alameda", "dwf"])) return "FUND_OR_MM";
  if (has(["finance", "protocol", "foundation", "treasury", "governor", "staking", "voting escrow", "vesting", "token contract", "multisig"])) return "PROJECT_OR_PROTOCOL";
  return "LABELED_OTHER";
}

export function classifyTransferDirection(fromKind: EntityKind, toKind: EntityKind): FlowDirection {
  if (toKind === "CEX") return "TO_CEX_PROXY";
  if (fromKind === "CEX") return "FROM_CEX_PROXY";
  if (toKind === "DEX") return "TO_DEX_POOL";
  if (fromKind === "DEX") return "FROM_DEX_POOL";
  if (toKind === "BRIDGE") return "TO_BRIDGE";
  if (fromKind === "BRIDGE") return "FROM_BRIDGE";
  if (toKind === "FUND_OR_MM") return "TO_FUND_OR_MM";
  if (fromKind === "FUND_OR_MM") return "FROM_FUND_OR_MM";
  if (fromKind !== "UNKNOWN" || toKind !== "UNKNOWN") return "BETWEEN_LABELED_ENTITIES";
  return "BETWEEN_UNKNOWN_WALLETS";
}

function classifyTransfer(token: string, chain: string, row: MoralisTransfer): ClassifiedTransfer {
  const fromEntity = row.from_address_entity || "";
  const toEntity = row.to_address_entity || "";
  const fromLabel = row.from_address_label || "";
  const toLabel = row.to_address_label || "";
  const fromKind = classifyEntityKind(fromEntity, fromLabel);
  const toKind = classifyEntityKind(toEntity, toLabel);
  return {
    token,
    chain,
    txHash: row.transaction_hash || "",
    timestamp: row.block_timestamp || "",
    fromAddress: row.from_address || "",
    toAddress: row.to_address || "",
    valueDecimal: num(row.value_decimal || row.value),
    fromEntity,
    toEntity,
    fromLabel,
    toLabel,
    fromKind,
    toKind,
    direction: classifyTransferDirection(fromKind, toKind),
  };
}

export function reviewDecision(summary: Pick<EntityFlowSummary, "transferStatus" | "transferRows" | "entityLabelCoverage" | "cexInCount" | "cexOutCount" | "fragilityScore" | "opportunityScore" | "tradabilityScore" | "topHolderPctSupply" | "topHolderEntity">): { decision: ReviewDecision; reason: string } {
  if (summary.transferStatus !== "OK" || summary.transferRows < 20) {
    return { decision: "RETRY_REQUIRED", reason: "transfer sample incomplete" };
  }
  if (summary.cexInCount > summary.cexOutCount && summary.cexInCount >= 3) {
    return { decision: "WATCH_CEX_INFLOW_RISK", reason: "recent proxy CEX deposits dominate withdrawals" };
  }
  if (summary.entityLabelCoverage < 0.25) {
    return { decision: "WATCH_LOW_CONFIDENCE", reason: "entity label coverage below 25%" };
  }
  if ((summary.topHolderPctSupply ?? 0) >= 25 && !summary.topHolderEntity) {
    return { decision: "DEEPEN_HOLDER_IDENTITY_REVIEW", reason: "top holder concentration is high and unlabeled" };
  }
  if ((summary.topHolderPctSupply ?? 0) >= 25 && summary.fragilityScore >= 20) {
    return { decision: "WATCH_CONCENTRATION_RISK", reason: "top holder concentration plus non-trivial fragility" };
  }
  if (summary.opportunityScore >= 40 && summary.tradabilityScore >= 40) {
    return { decision: "DEEPEN_ENTITY_FLOW", reason: "candidate has enough opportunity/tradability and usable entity labels" };
  }
  return { decision: "WATCH_LOW_CONFIDENCE", reason: "scores not strong enough for deeper entity flow" };
}

function topEntity(transfers: ClassifiedTransfer[]): { name: string; kind: EntityKind; share: number } {
  const counts = new Map<string, { count: number; kind: EntityKind }>();
  for (const transfer of transfers) {
    const sides = [
      { name: transfer.fromEntity || transfer.fromLabel, kind: transfer.fromKind },
      { name: transfer.toEntity || transfer.toLabel, kind: transfer.toKind },
    ];
    for (const side of sides) {
      if (!side.name || side.kind === "UNKNOWN") continue;
      const current = counts.get(side.name) || { count: 0, kind: side.kind };
      current.count += 1;
      counts.set(side.name, current);
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  const best = sorted[0];
  if (!best || transfers.length === 0) return { name: "", kind: "UNKNOWN", share: 0 };
  return { name: best[0], kind: best[1].kind, share: best[1].count / transfers.length };
}

async function reviewOne(candidate: ChainCandidate): Promise<{ summary: EntityFlowSummary; transfers: ClassifiedTransfer[] }> {
  const token = candidate.token;
  const chain = candidate.scan_chain;
  const contract = candidate.contract_address;
  const transfersR = await moralisGet(`/erc20/${contract}/transfers?chain=${chain}&limit=100&order=DESC`);
  const ownersR = await moralisGet(`/erc20/${contract}/owners?chain=${chain}&limit=50&order=DESC`);

  const transfers = firstArray(transfersR.data, ["result", "transfers"]).map((row: MoralisTransfer) => classifyTransfer(token, chain, row));
  const owners = firstArray(ownersR.data, ["result", "owners"]) as MoralisOwner[];
  const labeled = transfers.filter((row) => row.fromKind !== "UNKNOWN" || row.toKind !== "UNKNOWN");
  const cexIn = transfers.filter((row) => row.direction === "TO_CEX_PROXY");
  const cexOut = transfers.filter((row) => row.direction === "FROM_CEX_PROXY");
  const dex = transfers.filter((row) => row.direction === "TO_DEX_POOL" || row.direction === "FROM_DEX_POOL");
  const bridge = transfers.filter((row) => row.direction === "TO_BRIDGE" || row.direction === "FROM_BRIDGE");
  const fundMm = transfers.filter((row) => row.direction === "TO_FUND_OR_MM" || row.direction === "FROM_FUND_OR_MM");
  const unknown = transfers.filter((row) => row.direction === "BETWEEN_UNKNOWN_WALLETS");
  const top = topEntity(transfers);
  const topHolder = owners[0] || {};
  const top10HolderPctSupply = owners.slice(0, 10).reduce((sum, owner) => sum + (typeof owner.percentage_relative_to_total_supply === "number" ? owner.percentage_relative_to_total_supply : 0), 0);

  const baseSummary: EntityFlowSummary = {
    token,
    chain,
    priority: candidate.priority,
    opportunityScore: num(candidate.opportunity_score),
    fragilityScore: num(candidate.fragility_score),
    tradabilityScore: num(candidate.tradability_score),
    transferStatus: transfersR.status,
    transferRows: transfers.length,
    entityLabelCoverage: transfers.length > 0 ? labeled.length / transfers.length : 0,
    cexInCount: cexIn.length,
    cexOutCount: cexOut.length,
    dexCount: dex.length,
    bridgeCount: bridge.length,
    fundMmCount: fundMm.length,
    unknownCount: unknown.length,
    cexInValue: cexIn.reduce((sum, row) => sum + row.valueDecimal, 0),
    cexOutValue: cexOut.reduce((sum, row) => sum + row.valueDecimal, 0),
    topEntityName: top.name,
    topEntityKind: top.kind,
    topEntityShare: top.share,
    holdersStatus: ownersR.status,
    holderRows: owners.length,
    topHolderAddress: topHolder.owner_address || "",
    topHolderEntity: topHolder.entity || topHolder.owner_address_label || "",
    topHolderIsContract: typeof topHolder.is_contract === "boolean" ? topHolder.is_contract : null,
    topHolderPctSupply: typeof topHolder.percentage_relative_to_total_supply === "number" ? topHolder.percentage_relative_to_total_supply : null,
    top10HolderPctSupply: owners.length > 0 ? top10HolderPctSupply : null,
    decision: "WATCH_LOW_CONFIDENCE",
    reason: "",
  };
  const decision = reviewDecision(baseSummary);
  baseSummary.decision = decision.decision;
  baseSummary.reason = decision.reason;
  return { summary: baseSummary, transfers };
}

function parseArgs(): { limit: number } {
  const arg = process.argv.find((value) => value.startsWith("--limit="))?.split("=")[1];
  const limit = Number(arg || "5");
  return { limit: Number.isFinite(limit) && limit > 0 ? limit : 5 };
}

function buildReport(summaries: EntityFlowSummary[]): string {
  const lines = [
    "# Entity Flow Review",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Decisions",
    "",
    "| token | decision | coverage | cex_in | cex_out | dex | unknown | top_entity | top_holder_pct | reason |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |",
  ];
  for (const row of summaries) {
    lines.push(`| ${row.token} | ${row.decision} | ${(row.entityLabelCoverage * 100).toFixed(1)}% | ${row.cexInCount} | ${row.cexOutCount} | ${row.dexCount} | ${row.unknownCount} | ${row.topEntityName || ""} | ${row.topHolderPctSupply === null ? "" : row.topHolderPctSupply.toFixed(2) + "%"} | ${row.reason} |`);
  }
  lines.push(
    "",
    "## Limits",
    "",
    "- Moralis entity/label fields are proxy labels, not proof of buy/sell intent.",
    "- CEX direction is transfer direction only; it does not prove exchange execution.",
    "- The review uses the most recent transfer sample, not a full historical event study."
  );
  return lines.join("\n");
}

async function main() {
  loadDotenv();
  const { limit } = parseArgs();
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const candidates = rowsToObjects<ChainCandidate>(CANDIDATES_PATH)
    .filter((row) => row.scan_chain && row.contract_address)
    .slice(0, limit);

  const summaries: EntityFlowSummary[] = [];
  const transferRows: ClassifiedTransfer[] = [];
  for (const candidate of candidates) {
    const result = await reviewOne(candidate);
    summaries.push(result.summary);
    transferRows.push(...result.transfers);
  }

  const summaryPath = join(OUT_DIR, "entity_flow_review_latest.csv");
  const transferPath = join(OUT_DIR, "entity_flow_transfers_latest.csv");
  const reportPath = join(REPORTS_DIR, "entity_flow_review_latest.md");

  writeCsv(summaryPath, [
    ["checked_at", "token", "chain", "priority", "opportunity_score", "fragility_score", "tradability_score", "transfer_status", "transfer_rows", "entity_label_coverage", "cex_in_count", "cex_out_count", "dex_count", "bridge_count", "fund_mm_count", "unknown_count", "cex_in_value", "cex_out_value", "top_entity_name", "top_entity_kind", "top_entity_share", "holders_status", "holder_rows", "top_holder_address", "top_holder_entity", "top_holder_is_contract", "top_holder_pct_supply", "top10_holder_pct_supply", "decision", "reason"],
    ...summaries.map((row) => [new Date().toISOString(), row.token, row.chain, row.priority, row.opportunityScore, row.fragilityScore, row.tradabilityScore, row.transferStatus, row.transferRows, pct(row.entityLabelCoverage), row.cexInCount, row.cexOutCount, row.dexCount, row.bridgeCount, row.fundMmCount, row.unknownCount, row.cexInValue.toFixed(6), row.cexOutValue.toFixed(6), row.topEntityName, row.topEntityKind, pct(row.topEntityShare), row.holdersStatus, row.holderRows, row.topHolderAddress, row.topHolderEntity, row.topHolderIsContract === null ? "" : String(row.topHolderIsContract), pct(row.topHolderPctSupply), pct(row.top10HolderPctSupply), row.decision, row.reason]),
  ]);

  writeCsv(transferPath, [
    ["token", "chain", "timestamp", "tx_hash", "value_decimal", "from_address", "to_address", "from_kind", "to_kind", "direction", "from_entity", "to_entity", "from_label", "to_label"],
    ...transferRows.map((row) => [row.token, row.chain, row.timestamp, row.txHash, row.valueDecimal.toFixed(6), row.fromAddress, row.toAddress, row.fromKind, row.toKind, row.direction, row.fromEntity, row.toEntity, row.fromLabel, row.toLabel]),
  ]);

  writeFileSync(reportPath, buildReport(summaries), "utf-8");

  console.log("=== Entity Flow Review ===");
  for (const row of summaries) {
    console.log(`${row.token}: ${row.decision} coverage=${(row.entityLabelCoverage * 100).toFixed(1)}% cexIn=${row.cexInCount} cexOut=${row.cexOutCount} dex=${row.dexCount} unknown=${row.unknownCount}`);
  }
  console.log(`Summary: ${summaryPath}`);
  console.log(`Transfers: ${transferPath}`);
  console.log(`Report: ${reportPath}`);
}

const isMain = process.argv[1]?.includes("entity_flow_review");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
