import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const ONCHAIN_DIR = join(ROOT, "data", "altcoin", "intelligence", "onchain");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "onchain");
const ENTITY_FLOW_PATH = join(ONCHAIN_DIR, "entity_flow_review_latest.csv");
const TRANSFERS_PATH = join(ONCHAIN_DIR, "entity_flow_transfers_latest.csv");

export type HolderFlowDeltaDecision =
  | "TOP_HOLDER_ACCUMULATION_PROXY"
  | "TOP_HOLDER_DISTRIBUTION_RISK"
  | "TOP_HOLDER_FLOW_MIXED"
  | "NO_RECENT_TOP_HOLDER_FLOW"
  | "TOP_HOLDER_FLOW_LOW_CONFIDENCE";

interface EntityFlowRow {
  token: string;
  chain: string;
  top_holder_address: string;
  top_holder_pct_supply: string;
  top10_holder_pct_supply: string;
}

interface TransferRow {
  token: string;
  chain: string;
  timestamp: string;
  value_decimal: string;
  from_address: string;
  to_address: string;
  from_kind: string;
  to_kind: string;
}

export interface HolderFlowDeltaInput {
  topHolderPctSupply: number;
  observedTransfers: number;
  topHolderTransfers: number;
  inboundCount: number;
  outboundCount: number;
  inboundValue: number;
  outboundValue: number;
  cexToTopCount: number;
  topToCexCount: number;
  cexToTopValue: number;
  topToCexValue: number;
  dexToTopCount: number;
  topToDexCount: number;
  unknownToTopCount: number;
  topToUnknownCount: number;
}

export interface HolderFlowDeltaResult {
  token: string;
  chain: string;
  topHolderAddress: string;
  topHolderPctSupply: number;
  top10HolderPctSupply: number;
  transferRows: number;
  topHolderTransferRows: number;
  inboundCount: number;
  outboundCount: number;
  inboundValue: number;
  outboundValue: number;
  netTopHolderValue: number;
  cexToTopCount: number;
  topToCexCount: number;
  cexToTopValue: number;
  topToCexValue: number;
  dexToTopCount: number;
  topToDexCount: number;
  unknownToTopCount: number;
  topToUnknownCount: number;
  firstSeen: string;
  lastSeen: string;
  accumulationPressure: number;
  distributionPressure: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  decision: HolderFlowDeltaDecision;
  reason: string;
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

function num(value: string | number | undefined): number {
  const parsed = Number(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function pressure(value: number, count: number): number {
  return Math.min(100, Math.round(Math.log10(Math.max(0, value) + 1) * 12 + count * 10));
}

export function classifyHolderFlowDelta(input: HolderFlowDeltaInput): Pick<HolderFlowDeltaResult, "accumulationPressure" | "distributionPressure" | "confidence" | "decision" | "reason"> {
  const netValue = input.inboundValue - input.outboundValue;
  const accumulationPressure = pressure(input.cexToTopValue + input.dexToTopCount * 10 + Math.max(0, netValue), input.cexToTopCount + input.dexToTopCount + input.unknownToTopCount);
  const distributionPressure = pressure(input.topToCexValue + input.topToDexCount * 10 + Math.max(0, -netValue), input.topToCexCount + input.topToDexCount + input.topToUnknownCount);
  const confidence: "HIGH" | "MEDIUM" | "LOW" = input.topHolderTransfers >= 5 && input.observedTransfers >= 80
    ? "HIGH"
    : input.topHolderTransfers >= 2 && input.observedTransfers >= 30
      ? "MEDIUM"
      : "LOW";

  if (input.topHolderTransfers === 0) {
    return {
      accumulationPressure,
      distributionPressure,
      confidence: "LOW",
      decision: "NO_RECENT_TOP_HOLDER_FLOW",
      reason: "top holder did not appear in the latest transfer sample",
    };
  }

  if (input.topToCexCount > 0 && input.topToCexValue >= input.cexToTopValue && distributionPressure >= Math.max(20, accumulationPressure)) {
    return {
      accumulationPressure,
      distributionPressure,
      confidence,
      decision: "TOP_HOLDER_DISTRIBUTION_RISK",
      reason: "top holder sent tokens toward CEX proxies in the latest transfer sample",
    };
  }

  if (netValue > 0 && input.topToCexCount === 0 && input.topToDexCount === 0 && accumulationPressure >= 20) {
    return {
      accumulationPressure,
      distributionPressure,
      confidence,
      decision: "TOP_HOLDER_ACCUMULATION_PROXY",
      reason: "top holder net balance rose without direct CEX/DEX outflow in the latest sample",
    };
  }

  if (input.inboundCount > 0 && input.outboundCount > 0) {
    return {
      accumulationPressure,
      distributionPressure,
      confidence,
      decision: "TOP_HOLDER_FLOW_MIXED",
      reason: "top holder has both inbound and outbound flow; direction is not clean",
    };
  }

  return {
    accumulationPressure,
    distributionPressure,
    confidence,
    decision: confidence === "LOW" ? "TOP_HOLDER_FLOW_LOW_CONFIDENCE" : "TOP_HOLDER_FLOW_MIXED",
    reason: "top holder flow exists but sample strength or direction is insufficient",
  };
}

function summarizeHolderFlow(entity: EntityFlowRow, transfers: TransferRow[]): HolderFlowDeltaResult {
  const top = normalizeAddress(entity.top_holder_address);
  const tokenTransfers = transfers.filter((row) => row.token === entity.token);
  const scoped = tokenTransfers.filter((row) => normalizeAddress(row.from_address) === top || normalizeAddress(row.to_address) === top);
  const inbound = scoped.filter((row) => normalizeAddress(row.to_address) === top);
  const outbound = scoped.filter((row) => normalizeAddress(row.from_address) === top);
  const cexToTop = inbound.filter((row) => row.from_kind === "CEX");
  const topToCex = outbound.filter((row) => row.to_kind === "CEX");
  const dexToTop = inbound.filter((row) => row.from_kind === "DEX");
  const topToDex = outbound.filter((row) => row.to_kind === "DEX");
  const unknownToTop = inbound.filter((row) => row.from_kind === "UNKNOWN");
  const topToUnknown = outbound.filter((row) => row.to_kind === "UNKNOWN");
  const timestamps = scoped.map((row) => Date.parse(row.timestamp)).filter(Number.isFinite);
  const inboundValue = inbound.reduce((sum, row) => sum + num(row.value_decimal), 0);
  const outboundValue = outbound.reduce((sum, row) => sum + num(row.value_decimal), 0);
  const cexToTopValue = cexToTop.reduce((sum, row) => sum + num(row.value_decimal), 0);
  const topToCexValue = topToCex.reduce((sum, row) => sum + num(row.value_decimal), 0);
  const classified = classifyHolderFlowDelta({
    topHolderPctSupply: num(entity.top_holder_pct_supply),
    observedTransfers: tokenTransfers.length,
    topHolderTransfers: scoped.length,
    inboundCount: inbound.length,
    outboundCount: outbound.length,
    inboundValue,
    outboundValue,
    cexToTopCount: cexToTop.length,
    topToCexCount: topToCex.length,
    cexToTopValue,
    topToCexValue,
    dexToTopCount: dexToTop.length,
    topToDexCount: topToDex.length,
    unknownToTopCount: unknownToTop.length,
    topToUnknownCount: topToUnknown.length,
  });

  return {
    token: entity.token,
    chain: entity.chain,
    topHolderAddress: entity.top_holder_address,
    topHolderPctSupply: num(entity.top_holder_pct_supply),
    top10HolderPctSupply: num(entity.top10_holder_pct_supply),
    transferRows: tokenTransfers.length,
    topHolderTransferRows: scoped.length,
    inboundCount: inbound.length,
    outboundCount: outbound.length,
    inboundValue,
    outboundValue,
    netTopHolderValue: inboundValue - outboundValue,
    cexToTopCount: cexToTop.length,
    topToCexCount: topToCex.length,
    cexToTopValue,
    topToCexValue,
    dexToTopCount: dexToTop.length,
    topToDexCount: topToDex.length,
    unknownToTopCount: unknownToTop.length,
    topToUnknownCount: topToUnknown.length,
    firstSeen: timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : "",
    lastSeen: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : "",
    ...classified,
  };
}

function buildReport(rows: HolderFlowDeltaResult[]): string {
  const lines = [
    "# Holder Flow Delta Review",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| token | decision | confidence | holder_pct | top_tx | net_value | cex_to_top | top_to_cex | accum | distrib | reason |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const row of rows) {
    lines.push(`| ${row.token} | ${row.decision} | ${row.confidence} | ${row.topHolderPctSupply.toFixed(2)}% | ${row.topHolderTransferRows} | ${row.netTopHolderValue.toFixed(4)} | ${row.cexToTopValue.toFixed(4)} | ${row.topToCexValue.toFixed(4)} | ${row.accumulationPressure} | ${row.distributionPressure} | ${row.reason} |`);
  }
  lines.push(
    "",
    "## Limits",
    "",
    "- This is a transfer-sample delta proxy, not a full historical holder balance time series.",
    "- Token-unit values are comparable within a token only; they are not USD-normalized.",
    "- A top-holder CEX transfer is treated as distribution risk, not proof of exchange selling."
  );
  return lines.join("\n");
}

async function main() {
  if (!existsSync(ONCHAIN_DIR)) mkdirSync(ONCHAIN_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const entities = rowsToObjects<EntityFlowRow>(ENTITY_FLOW_PATH).filter((row) => row.top_holder_address);
  const transfers = rowsToObjects<TransferRow>(TRANSFERS_PATH);
  const rows = entities.map((entity) => summarizeHolderFlow(entity, transfers));

  const outPath = join(ONCHAIN_DIR, "holder_flow_delta_review_latest.csv");
  const reportPath = join(REPORTS_DIR, "holder_flow_delta_review_latest.md");
  writeCsv(outPath, [
    ["checked_at", "token", "chain", "top_holder_address", "top_holder_pct_supply", "top10_holder_pct_supply", "transfer_rows", "top_holder_transfer_rows", "inbound_count", "outbound_count", "inbound_value", "outbound_value", "net_top_holder_value", "cex_to_top_count", "top_to_cex_count", "cex_to_top_value", "top_to_cex_value", "dex_to_top_count", "top_to_dex_count", "unknown_to_top_count", "top_to_unknown_count", "first_seen", "last_seen", "accumulation_pressure", "distribution_pressure", "confidence", "decision", "reason"],
    ...rows.map((row) => [new Date().toISOString(), row.token, row.chain, row.topHolderAddress, row.topHolderPctSupply, row.top10HolderPctSupply, row.transferRows, row.topHolderTransferRows, row.inboundCount, row.outboundCount, row.inboundValue.toFixed(6), row.outboundValue.toFixed(6), row.netTopHolderValue.toFixed(6), row.cexToTopCount, row.topToCexCount, row.cexToTopValue.toFixed(6), row.topToCexValue.toFixed(6), row.dexToTopCount, row.topToDexCount, row.unknownToTopCount, row.topToUnknownCount, row.firstSeen, row.lastSeen, row.accumulationPressure, row.distributionPressure, row.confidence, row.decision, row.reason]),
  ]);
  writeFileSync(reportPath, buildReport(rows), "utf-8");

  console.log("=== Holder Flow Delta Review ===");
  for (const row of rows) {
    console.log(`${row.token}: ${row.decision} conf=${row.confidence} topTx=${row.topHolderTransferRows} net=${row.netTopHolderValue.toFixed(2)} topToCex=${row.topToCexValue.toFixed(2)}`);
  }
  console.log(`Output: ${outPath}`);
  console.log(`Report: ${reportPath}`);
}

const isMain = process.argv[1]?.includes("holder_flow_delta_review");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
