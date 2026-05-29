import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join, relative } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const OUT_DIR = join(ROOT, "data", "altcoin", "intelligence", "data_supply");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "data_supply");

type Priority = "P0" | "P1" | "P2";
type UsageStatus =
  | "USED_IN_PRIMARY_SIGNAL"
  | "CACHED_NOT_USED_IN_PRIMARY_SIGNAL"
  | "FETCHER_PRESENT_NOT_CACHED"
  | "DOCS_ONLY_NOT_WIRED";

interface DataSpec {
  id: string;
  priority: Priority;
  source: string;
  dataset: string;
  capability: string;
  accumulationUse: string;
  officialUrl: string;
  cachePaths: string[];
  fetchKeywords: string[];
  primarySignalKeywords: string[];
  validationKeywords: string[];
  nextAction: string;
}

interface AuditRow extends DataSpec {
  cacheFilesFound: string;
  cacheRowCount: number;
  fetcherEvidence: string;
  primarySignalEvidence: string;
  validationEvidence: string;
  usageStatus: UsageStatus;
  dataGap: string;
}

const PRIMARY_SIGNAL_FILES = [
  join(ROOT, "src", "altcoin", "intelligence", "validation", "score_decomposition.ts"),
  join(ROOT, "src", "altcoin", "intelligence", "validation", "chain_scan_gate.ts"),
  join(ROOT, "src", "altcoin", "intelligence", "accumulation", "accumulation_pattern.ts"),
  join(ROOT, "src", "altcoin", "intelligence", "accumulation", "validate_accumulation.ts"),
  join(ROOT, "src", "altcoin", "intelligence", "onchain", "directional_chain_scan.ts"),
  join(ROOT, "src", "altcoin", "intelligence", "onchain", "qualified_subset_scan.ts"),
  join(ROOT, "src", "altcoin", "intelligence", "onchain", "scan_readiness.ts"),
  join(ROOT, "scripts", "opportunity_cycle_runner.ts"),
];

const VALIDATION_FILES = [
  join(ROOT, "src", "altcoin", "intelligence", "validation"),
  join(ROOT, "src", "altcoin", "intelligence", "metric_loop"),
  join(ROOT, "src", "altcoin", "intelligence", "no_arkham"),
  join(ROOT, "__tests__"),
];

const SPECS: DataSpec[] = [
  {
    id: "cg_pool_ohlcv",
    priority: "P0",
    source: "CoinGecko Onchain",
    dataset: "pool OHLCV",
    capability: "/onchain/networks/{network}/pools/{pool}/ohlcv/{timeframe}",
    accumulationUse: "Detect quiet ranges, volatility compression, DEX volume expansion, and pool-level absorption.",
    officialUrl: "https://docs.coingecko.com/reference/pool-ohlcv-contract-address",
    cachePaths: ["data/altcoin/intelligence/coingecko/pools/pool_ohlcv_features.csv", "data/altcoin/intelligence/dex_history/features/dex_history_feature_table.csv"],
    fetchKeywords: ["pool_ohlcv", "ohlcv"],
    primarySignalKeywords: ["pool_ohlcv", "dex_history", "compression"],
    validationKeywords: ["DEX_001", "dex_history"],
    nextAction: "Promote compression and pool volume z-score into accumulation detector and future primary gate.",
  },
  {
    id: "cg_pool_trades",
    priority: "P0",
    source: "CoinGecko Onchain",
    dataset: "pool trades",
    capability: "/onchain/networks/{network}/pools/{pool}/trades",
    accumulationUse: "Separate repeated small demand from one-shot candles; measure taker side, trade count, and trade size distribution.",
    officialUrl: "https://docs.coingecko.com/reference/pool-trades-contract-address",
    cachePaths: [],
    fetchKeywords: ["poolTrades", "trades"],
    primarySignalKeywords: ["poolTrades", "trade_count", "trade_size"],
    validationKeywords: ["poolTrades", "trade_count"],
    nextAction: "Add trade-count and median trade-size features before treating DEX volume as absorption.",
  },
  {
    id: "cg_holder_chart",
    priority: "P0",
    source: "CoinGecko Onchain",
    dataset: "holders chart and top holders",
    capability: "/onchain/networks/{network}/tokens/{token}/holders_chart and top holders",
    accumulationUse: "Validate holder-count growth and concentration changes during quiet price windows.",
    officialUrl: "https://docs.coingecko.com/reference/token-holders-chart-token-address",
    cachePaths: [],
    fetchKeywords: ["top_holders", "holders_chart", "topHolders"],
    primarySignalKeywords: ["holder_count", "holders_chart", "top_holders"],
    validationKeywords: ["holder_count", "holders_chart"],
    nextAction: "Wire holder-count delta into absorption score; use top-holder concentration as risk penalty.",
  },
  {
    id: "dexscreener_boost_orders",
    priority: "P1",
    source: "DexScreener",
    dataset: "token boosts and paid orders",
    capability: "/token-boosts/latest/v1 and /orders/v1/{chainId}/{tokenAddress}",
    accumulationUse: "Flag paid visibility and marketing-driven moves so they are not mistaken for organic accumulation.",
    officialUrl: "https://docs.dexscreener.com/api/reference",
    cachePaths: [],
    fetchKeywords: ["token-boosts", "orders", "dexscreener"],
    primarySignalKeywords: ["token-boosts", "boost", "orders"],
    validationKeywords: ["dexscreener"],
    nextAction: "Add boost/order risk column to distinguish paid attention from organic pre-breakout structure.",
  },
  {
    id: "dexscreener_pairs",
    priority: "P0",
    source: "DexScreener",
    dataset: "pair snapshots",
    capability: "/latest/dex/pairs/{chainId}/{pairId} and /tokens/v1/{chainId}/{tokenAddresses}",
    accumulationUse: "Cross-check DEX liquidity, FDV, pair count, age, and short-window volume.",
    officialUrl: "https://docs.dexscreener.com/api/reference",
    cachePaths: ["data/altcoin/scanner_v02/features/dex_token_level_features.csv", "data/altcoin/scanner_v02/features/dex_token_level_features_universe.csv"],
    fetchKeywords: ["dexscreener", "pairs"],
    primarySignalKeywords: ["token_level_dex_turnover", "total_dex_liquidity_usd", "buy_sell_ratio"],
    validationKeywords: ["dex_liq_score", "token_level_dex_turnover"],
    nextAction: "Already used in scanner; add pair-age and venue-concentration checks.",
  },
  {
    id: "moralis_transfers",
    priority: "P0",
    source: "Moralis",
    dataset: "token transfers with entity labels",
    capability: "/erc20/{address}/transfers",
    accumulationUse: "Measure CEX proxy inflow/outflow, DEX-pool routing, and unknown-wallet churn over 1h/4h/24h windows.",
    officialUrl: "https://docs.moralis.com/web3-data-api/evm/reference/get-token-transfers",
    cachePaths: ["data/altcoin/intelligence/moralis/transfers/moralis_token_transfers.csv", "data/altcoin/intelligence/onchain/cex_flow_window_scan_latest.csv"],
    fetchKeywords: ["moralis", "transfers"],
    primarySignalKeywords: ["cex_flow", "CEX_INFLOW_RISK", "CEX_OUTFLOW_OR_NEUTRAL", "net_cex"],
    validationKeywords: ["moralis", "cex_flow"],
    nextAction: "Already gates chain candidates; persist windows per signal snapshot for strict point-in-time validation.",
  },
  {
    id: "moralis_holders",
    priority: "P0",
    source: "Moralis",
    dataset: "token owners and holder balances",
    capability: "/erc20/{address}/owners",
    accumulationUse: "Detect ownership broadening, whale concentration, and holder quality when Arkham coverage is weak.",
    officialUrl: "https://docs.moralis.com/web3-data-api/evm/reference/get-token-owners",
    cachePaths: ["data/altcoin/intelligence/moralis/holders"],
    fetchKeywords: ["owners", "holders_available", "moralis"],
    primarySignalKeywords: ["holders_available", "holder_count", "top_holder"],
    validationKeywords: ["moralis_data_quality", "holders_available"],
    nextAction: "Convert holder snapshots into time-series features instead of only readiness rows.",
  },
  {
    id: "etherscan_v2_holders",
    priority: "P1",
    source: "Etherscan V2",
    dataset: "top holders and token transfers",
    capability: "Token holder, token transfer, and address-tag endpoints",
    accumulationUse: "Fallback EVM ground truth for holder concentration and transfer history when commercial APIs disagree.",
    officialUrl: "https://docs.etherscan.io/etherscan-v2",
    cachePaths: ["data/altcoin/intelligence/etherscan"],
    fetchKeywords: ["etherscan", "ETHERSCAN"],
    primarySignalKeywords: ["etherscan", "top_holder", "token_transfer"],
    validationKeywords: ["etherscan"],
    nextAction: "Add a fallback Etherscan V2 fetcher for EVM tokens with poor Moralis/Arkham coverage.",
  },
  {
    id: "arkham_holder_entity",
    priority: "P0",
    source: "Arkham",
    dataset: "holder entity labels and concentration",
    capability: "token holders with entity labels",
    accumulationUse: "Penalize unresolved whale concentration; identify CEX, fund, market-maker, and unknown-holder risk.",
    officialUrl: "https://arkhamintelligence.com/api",
    cachePaths: ["data/altcoin/intelligence/arkham/features/arkham_holder_entity_features.csv"],
    fetchKeywords: ["arkham_holder_entity", "token_holders"],
    primarySignalKeywords: ["holder_identity", "entity_label_coverage", "holder_decision"],
    validationKeywords: ["arkham_holder_entity_validation"],
    nextAction: "Already gates readiness; include concentration deltas in accumulation score when historical snapshots exist.",
  },
  {
    id: "arkham_transfer_entity",
    priority: "P0",
    source: "Arkham",
    dataset: "segmented transfer entity flow",
    capability: "entity-labeled transfers and top-flow windows",
    accumulationUse: "Identify repeated exchange outflow, fund/market-maker routing, and low-quality unknown-wallet churn.",
    officialUrl: "https://arkhamintelligence.com/api",
    cachePaths: ["data/altcoin/intelligence/arkham/features/arkham_transfer_entity_features.csv", "data/altcoin/intelligence/arkham/features/arkham_segmented_transfer_entity_features.csv"],
    fetchKeywords: ["arkham_transfer_entity", "segmented_transfer"],
    primarySignalKeywords: ["entity_flow", "segmented_transfer", "transfer_entity"],
    validationKeywords: ["arkham_transfer_entity_validation", "arkham_segmented_transfer_validation"],
    nextAction: "Promote only coverage-safe features into accumulation detector; keep raw entity claims as evidence, not proof.",
  },
  {
    id: "okx_oi_funding",
    priority: "P0",
    source: "OKX",
    dataset: "open interest and funding",
    capability: "/api/v5/public/open-interest and /api/v5/public/funding-rate-history",
    accumulationUse: "Confirm spot/on-chain accumulation is not already a crowded perpetual long.",
    officialUrl: "https://www.okx.com/docs-v5/en/#public-data-rest-api-get-open-interest",
    cachePaths: ["data/altcoin/intelligence/derivatives/features/derivatives_feature_table.csv", "data/altcoin/intelligence/derivatives/features/okx_oi_funding_price_feature_table.csv"],
    fetchKeywords: ["open-interest", "funding-rate"],
    primarySignalKeywords: ["funding", "open_interest", "oi_change", "crowded_longs"],
    validationKeywords: ["OKX_OI_001", "funding_zscore"],
    nextAction: "Already researched; integrate funding-neutral plus moderate OI-growth into accumulation detector.",
  },
  {
    id: "okx_trading_statistics",
    priority: "P1",
    source: "OKX",
    dataset: "long-short ratio and taker volume",
    capability: "/api/v5/rubik/stat/contracts/long-short-account-ratio and taker-volume",
    accumulationUse: "Detect whether derivatives positioning is balanced or crowded before entry planning.",
    officialUrl: "https://www.okx.com/docs-v5/en/#trading-statistics-rest-api-get-contract-long-short-ratio",
    cachePaths: [],
    fetchKeywords: ["long-short", "taker-volume", "trading_statistics"],
    primarySignalKeywords: ["long_short", "taker_volume"],
    validationKeywords: ["long_short", "taker_volume"],
    nextAction: "Move capability probe into feature table and add crowding penalty.",
  },
  {
    id: "coinglass_derivatives",
    priority: "P0",
    source: "CoinGlass",
    dataset: "OI, funding, liquidation",
    capability: "open interest, funding rate, liquidation history",
    accumulationUse: "Use multi-exchange derivatives data to reject overheated or liquidation-driven moves.",
    officialUrl: "https://docs.coinglass.com/reference",
    cachePaths: ["data/altcoin/intelligence/coinglass/features/coinglass_derivatives_features.csv"],
    fetchKeywords: ["coinglass", "liquidation", "funding"],
    primarySignalKeywords: ["coinglass", "liq_z_7d", "funding_overheated", "oi_z_7d"],
    validationKeywords: ["CG_OI_001", "CG_LIQ_001", "coinglass"],
    nextAction: "Promote neutral-funding/moderate-OI pattern into accumulation detector; keep liquidation spikes as risk.",
  },
  {
    id: "coinglass_crowding",
    priority: "P1",
    source: "CoinGlass",
    dataset: "long/short and exchange OI split",
    capability: "long-short ratios, top-trader ratios, exchange OI",
    accumulationUse: "Differentiate healthy base-building from crowded narrative chasing.",
    officialUrl: "https://docs.coinglass.com/reference",
    cachePaths: [],
    fetchKeywords: ["longShort", "long_short", "exchange_list"],
    primarySignalKeywords: ["long_short", "top_trader", "exchange_oi"],
    validationKeywords: ["long_short", "coinglass"],
    nextAction: "Convert probes into a stable feature builder after schema confirmation.",
  },
];

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
      out.push(...listFiles(path));
    } else if (/\.(ts|md|csv|json|yaml|yml)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function matchingEvidence(paths: string[], keywords: string[]): string[] {
  if (keywords.length === 0) return [];
  const lowered = keywords.map((keyword) => keyword.toLowerCase());
  const matches: string[] = [];
  for (const path of paths) {
    const text = readText(path).toLowerCase();
    if (lowered.some((keyword) => text.includes(keyword))) {
      matches.push(relative(ROOT, path).replace(/\\/g, "/"));
    }
  }
  return matches.slice(0, 8);
}

function cacheEvidence(cachePaths: string[]): { files: string[]; rows: number } {
  const files: string[] = [];
  let rows = 0;
  for (const cachePath of cachePaths) {
    const full = join(ROOT, cachePath);
    if (!existsSync(full)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      const nested = listFiles(full).filter((path) => statSync(path).isFile());
      files.push(...nested.slice(0, 6).map((path) => relative(ROOT, path).replace(/\\/g, "/")));
      rows += nested.reduce((sum, path) => sum + rowCount(path), 0);
    } else {
      files.push(cachePath);
      rows += rowCount(full);
    }
  }
  return { files: files.slice(0, 10), rows };
}

function rowCount(path: string): number {
  if (path.endsWith(".csv")) {
    const csv = readCsv(path);
    return csv?.rows.length || 0;
  }
  if (path.endsWith(".json")) return 1;
  return 0;
}

function decideStatus(cacheRows: number, fetcherEvidence: string[], primaryEvidence: string[]): UsageStatus {
  if (primaryEvidence.length > 0 && cacheRows > 0) return "USED_IN_PRIMARY_SIGNAL";
  if (cacheRows > 0) return "CACHED_NOT_USED_IN_PRIMARY_SIGNAL";
  if (fetcherEvidence.length > 0) return "FETCHER_PRESENT_NOT_CACHED";
  return "DOCS_ONLY_NOT_WIRED";
}

function dataGap(status: UsageStatus): string {
  switch (status) {
    case "USED_IN_PRIMARY_SIGNAL":
      return "No primary wiring gap; check feature freshness and point-in-time persistence.";
    case "CACHED_NOT_USED_IN_PRIMARY_SIGNAL":
      return "High-value data exists locally but is not part of the primary opportunity signal.";
    case "FETCHER_PRESENT_NOT_CACHED":
      return "Code can probably fetch this data, but no reusable cache/table was found.";
    case "DOCS_ONLY_NOT_WIRED":
      return "External capability identified; no local fetcher/cache/primary signal wiring found.";
  }
}

export function buildHighValueDataAudit(): AuditRow[] {
  const sourceFiles = listFiles(join(ROOT, "src"))
    .concat(listFiles(join(ROOT, "scripts")), listFiles(join(ROOT, "docs")))
    .filter((path) => !path.endsWith("high_value_data_audit.ts"));
  const primaryFiles = PRIMARY_SIGNAL_FILES.flatMap((path) => existsSync(path) && statSync(path).isDirectory() ? listFiles(path) : [path]).filter(existsSync);
  const validationFiles = VALIDATION_FILES.flatMap((path) => existsSync(path) && statSync(path).isDirectory() ? listFiles(path) : [path]).filter(existsSync);

  return SPECS.map((spec) => {
    const cache = cacheEvidence(spec.cachePaths);
    const fetcherEvidence = matchingEvidence(sourceFiles, spec.fetchKeywords);
    const primarySignalEvidence = matchingEvidence(primaryFiles, spec.primarySignalKeywords);
    const validationEvidence = matchingEvidence(validationFiles, spec.validationKeywords);
    const usageStatus = decideStatus(cache.rows, fetcherEvidence, primarySignalEvidence);
    return {
      ...spec,
      cacheFilesFound: cache.files.join(";"),
      cacheRowCount: cache.rows,
      fetcherEvidence: fetcherEvidence.join(";"),
      primarySignalEvidence: primarySignalEvidence.join(";"),
      validationEvidence: validationEvidence.join(";"),
      usageStatus,
      dataGap: dataGap(usageStatus),
    };
  });
}

function buildReport(rows: AuditRow[]): string {
  const p0Gaps = rows.filter((row) => row.priority === "P0" && row.usageStatus !== "USED_IN_PRIMARY_SIGNAL");
  const lines = [
    "# High Value Data Audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This audit checks whether data that is useful for pre-breakout accumulation recognition is cached, fetched, used in the primary signal, and validated.",
    "",
    "## P0 Gaps",
    "",
  ];

  if (p0Gaps.length === 0) {
    lines.push("No P0 primary wiring gaps detected.");
  } else {
    lines.push("| id | source | dataset | status | cache_rows | gap | next_action |");
    lines.push("| --- | --- | --- | --- | ---: | --- | --- |");
    for (const row of p0Gaps) {
      lines.push(`| ${row.id} | ${row.source} | ${row.dataset} | ${row.usageStatus} | ${row.cacheRowCount} | ${row.dataGap} | ${row.nextAction} |`);
    }
  }

  lines.push(
    "",
    "## Full Matrix",
    "",
    "| priority | id | status | cached | fetcher | primary_signal | validation |",
    "| --- | --- | --- | ---: | --- | --- | --- |",
  );
  for (const row of rows) {
    lines.push(`| ${row.priority} | ${row.id} | ${row.usageStatus} | ${row.cacheRowCount} | ${row.fetcherEvidence || ""} | ${row.primarySignalEvidence || ""} | ${row.validationEvidence || ""} |`);
  }

  lines.push(
    "",
    "## Source URLs",
    "",
    ...rows.map((row) => `- ${row.id}: ${row.officialUrl}`),
  );

  return lines.join("\n");
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const rows = buildHighValueDataAudit();
  const outPath = join(OUT_DIR, "high_value_data_audit_latest.csv");
  const reportPath = join(REPORTS_DIR, "high_value_data_audit_latest.md");

  writeCsv(outPath, [
    ["checked_at", "priority", "id", "source", "dataset", "capability", "accumulation_use", "usage_status", "cache_rows", "cache_files_found", "fetcher_evidence", "primary_signal_evidence", "validation_evidence", "data_gap", "next_action", "official_url"],
    ...rows.map((row) => [new Date().toISOString(), row.priority, row.id, row.source, row.dataset, row.capability, row.accumulationUse, row.usageStatus, row.cacheRowCount, row.cacheFilesFound, row.fetcherEvidence, row.primarySignalEvidence, row.validationEvidence, row.dataGap, row.nextAction, row.officialUrl]),
  ]);
  writeFileSync(reportPath, buildReport(rows), "utf-8");

  const p0GapCount = rows.filter((row) => row.priority === "P0" && row.usageStatus !== "USED_IN_PRIMARY_SIGNAL").length;
  console.log("=== High Value Data Audit ===");
  console.log(`Rows: ${rows.length}`);
  console.log(`P0 gaps: ${p0GapCount}`);
  console.log(`Output: ${outPath}`);
  console.log(`Report: ${reportPath}`);
}

const isMain = process.argv[1]?.includes("high_value_data_audit");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
