export type SourceProvider =
  | "okx"
  | "coinglass"
  | "coingecko"
  | "dexscreener"
  | "moralis"
  | "arkham"
  | "etherscan"
  | "bscscan"
  | "dune"
  | "nansen"
  | "glassnode"
  | "coinmetrics";

export type ResultTier =
  | "RESEARCH_CANDIDATE"
  | "DEEP_REVIEW_CANDIDATE"
  | "EXECUTION_REVIEW_CANDIDATE"
  | "WATCH_ONLY"
  | "REPAIR_ONLY"
  | "REJECTED";

export type SourceRole =
  | "market"
  | "derivatives"
  | "cex_flow"
  | "holder"
  | "entity"
  | "dex_microstructure"
  | "smart_money"
  | "regime"
  | "quality";

export interface SourceEndpointSpec {
  provider: SourceProvider;
  endpoint: string;
  role: SourceRole;
  requiredFor: ResultTier[];
  freshnessSlaSeconds: number;
  authRequired: boolean;
  rawSnapshotRequired: boolean;
  notes: string;
}

export const SOURCE_REGISTRY: SourceEndpointSpec[] = [
  {
    provider: "okx",
    endpoint: "public/instruments+tickers",
    role: "market",
    requiredFor: ["RESEARCH_CANDIDATE", "DEEP_REVIEW_CANDIDATE", "EXECUTION_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 15 * 60,
    authRequired: false,
    rawSnapshotRequired: true,
    notes: "Swap universe, price, volume, spread, and instrument lifecycle.",
  },
  {
    provider: "okx",
    endpoint: "public/open-interest+funding-rate",
    role: "derivatives",
    requiredFor: ["RESEARCH_CANDIDATE", "DEEP_REVIEW_CANDIDATE", "EXECUTION_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 15 * 60,
    authRequired: false,
    rawSnapshotRequired: true,
    notes: "Single-exchange OI/funding sanity for OKX instruments.",
  },
  {
    provider: "okx",
    endpoint: "market/books",
    role: "market",
    requiredFor: ["EXECUTION_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 2 * 60,
    authRequired: false,
    rawSnapshotRequired: true,
    notes: "Depth and slippage pre-trade sanity.",
  },
  {
    provider: "coinglass",
    endpoint: "futures/oi-funding-liquidation",
    role: "derivatives",
    requiredFor: ["RESEARCH_CANDIDATE", "DEEP_REVIEW_CANDIDATE", "EXECUTION_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 30 * 60,
    authRequired: true,
    rawSnapshotRequired: true,
    notes: "Cross-exchange derivatives regime and short-exec blockers.",
  },
  {
    provider: "coinglass",
    endpoint: "futures/crowding-long-short-cvd",
    role: "derivatives",
    requiredFor: ["DEEP_REVIEW_CANDIDATE", "EXECUTION_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 30 * 60,
    authRequired: true,
    rawSnapshotRequired: true,
    notes: "Crowding, long/short ratio, taker flow, and CVD if available.",
  },
  {
    provider: "coingecko",
    endpoint: "onchain/pool-ohlcv",
    role: "dex_microstructure",
    requiredFor: ["RESEARCH_CANDIDATE", "DEEP_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 24 * 60 * 60,
    authRequired: true,
    rawSnapshotRequired: true,
    notes: "DEX price/volume history and pool context.",
  },
  {
    provider: "coingecko",
    endpoint: "onchain/pool-trades",
    role: "dex_microstructure",
    requiredFor: ["DEEP_REVIEW_CANDIDATE", "EXECUTION_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 24 * 60 * 60,
    authRequired: true,
    rawSnapshotRequired: true,
    notes: "Trade count, median trade size, and absorption validation.",
  },
  {
    provider: "coingecko",
    endpoint: "onchain/holders-chart+top-holders",
    role: "holder",
    requiredFor: ["DEEP_REVIEW_CANDIDATE", "EXECUTION_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 24 * 60 * 60,
    authRequired: true,
    rawSnapshotRequired: true,
    notes: "Holder count delta and top-holder concentration.",
  },
  {
    provider: "dexscreener",
    endpoint: "pairs",
    role: "dex_microstructure",
    requiredFor: ["RESEARCH_CANDIDATE", "DEEP_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 60 * 60,
    authRequired: false,
    rawSnapshotRequired: true,
    notes: "DEX venue discovery, liquidity, and pair quality.",
  },
  {
    provider: "moralis",
    endpoint: "erc20/transfers",
    role: "cex_flow",
    requiredFor: ["RESEARCH_CANDIDATE", "DEEP_REVIEW_CANDIDATE", "EXECUTION_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 60 * 60,
    authRequired: true,
    rawSnapshotRequired: true,
    notes: "Token transfer windows and CEX-flow proxy.",
  },
  {
    provider: "moralis",
    endpoint: "erc20/owners",
    role: "holder",
    requiredFor: ["DEEP_REVIEW_CANDIDATE", "EXECUTION_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 24 * 60 * 60,
    authRequired: true,
    rawSnapshotRequired: true,
    notes: "Holder balances and holder-delta time series.",
  },
  {
    provider: "arkham",
    endpoint: "entity+address-intelligence",
    role: "entity",
    requiredFor: ["DEEP_REVIEW_CANDIDATE", "EXECUTION_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 24 * 60 * 60,
    authRequired: true,
    rawSnapshotRequired: true,
    notes: "High-confidence entity attribution and label validation.",
  },
  {
    provider: "arkham",
    endpoint: "token-top-flow+counterparties",
    role: "entity",
    requiredFor: ["DEEP_REVIEW_CANDIDATE", "EXECUTION_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 24 * 60 * 60,
    authRequired: true,
    rawSnapshotRequired: true,
    notes: "Top flow source/destination, counterparties, and concentration.",
  },
  {
    provider: "etherscan",
    endpoint: "v2/token-transfers+holders",
    role: "cex_flow",
    requiredFor: ["REPAIR_ONLY", "DEEP_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 24 * 60 * 60,
    authRequired: true,
    rawSnapshotRequired: true,
    notes: "EVM fallback for transfer/holder repair.",
  },
  {
    provider: "bscscan",
    endpoint: "token-transfers+holders",
    role: "cex_flow",
    requiredFor: ["REPAIR_ONLY", "DEEP_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 24 * 60 * 60,
    authRequired: true,
    rawSnapshotRequired: true,
    notes: "BSC repair path for current BSC coverage gap.",
  },
  {
    provider: "dune",
    endpoint: "spellbook/token-transfers+dex-trades",
    role: "quality",
    requiredFor: ["DEEP_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 24 * 60 * 60,
    authRequired: true,
    rawSnapshotRequired: true,
    notes: "Curated table reconciliation for transfers and DEX trades.",
  },
  {
    provider: "nansen",
    endpoint: "smart-money+labels+dex-trades",
    role: "smart_money",
    requiredFor: ["DEEP_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 24 * 60 * 60,
    authRequired: true,
    rawSnapshotRequired: true,
    notes: "Smart-money and profitable-wallet enrichment if access exists.",
  },
  {
    provider: "glassnode",
    endpoint: "asset-regime+exchange-flow",
    role: "regime",
    requiredFor: ["DEEP_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 24 * 60 * 60,
    authRequired: true,
    rawSnapshotRequired: true,
    notes: "Aggregate on-chain and market regime context where coverage exists.",
  },
  {
    provider: "coinmetrics",
    endpoint: "network-data-pro",
    role: "regime",
    requiredFor: ["DEEP_REVIEW_CANDIDATE"],
    freshnessSlaSeconds: 24 * 60 * 60,
    authRequired: true,
    rawSnapshotRequired: true,
    notes: "Institutional network and market data regime cross-check.",
  },
];

export function getSourceEndpoint(provider: SourceProvider, endpoint: string): SourceEndpointSpec | undefined {
  return SOURCE_REGISTRY.find((spec) => spec.provider === provider && spec.endpoint === endpoint);
}

export function listSourcesForTier(tier: ResultTier): SourceEndpointSpec[] {
  return SOURCE_REGISTRY.filter((spec) => spec.requiredFor.includes(tier));
}

export function requiredSourceKeysForTier(tier: ResultTier): string[] {
  return listSourcesForTier(tier).map((spec) => `${spec.provider}:${spec.endpoint}`).sort();
}
