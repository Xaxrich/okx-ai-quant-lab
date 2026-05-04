export interface DexLiquiditySnapshot {
  token: string;
  timestamp: string;
  pairCount: number;
  totalLiquidityUsd: number;
  totalVolume24h: number;
  buyCount24h: number;
  sellCount24h: number;
  buySellRatio: number | null;
  tokenLevelTurnover: number | null;
  primaryPairLiquidityShare: number | null;
  liquidityChange1d: number | null;
  liquidityChange7d: number | null;
  lpWithdrawalFlag: boolean;
  lpAdditionFlag: boolean;
  botTradeRatioProxy: number | null;
  uniqueTraders24h: number | null;
  source: "dexscreener" | "geckoterminal" | "bitquery" | "unavailable";
  dataQuality: "HIGH" | "MEDIUM" | "LOW";
  limitations: string[];
}

export interface DexLiquidityTimeSeriesFeatures {
  token: string;
  timestamp: string;
  totalLiquidityUsd: number;
  liquidityTrend7d: "INCREASING" | "STABLE" | "DECREASING" | "UNKNOWN";
  liquiditySpikeFlag: boolean;
  liquidityDropFlag: boolean;
  turnover7dAvg: number | null;
  turnoverTrend: "INCREASING" | "STABLE" | "DECREASING" | "UNKNOWN";
  buySellRatio7dAvg: number | null;
  botActivityProxy: "NONE" | "LOW" | "MODERATE" | "HIGH" | "UNKNOWN";
  liquidityFragilityScore: number;
  organicActivityScore: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}
