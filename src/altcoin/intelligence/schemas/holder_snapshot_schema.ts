export interface TopHolderEntry {
  address: string;
  balance: number;
  percentage: number;
  label: string | null;
}

export interface HolderSnapshot {
  token: string;
  chain: string;
  contract: string;
  timestamp: string;
  holderCount: number;
  top10HolderPct: number;
  top20HolderPct: number;
  top50HolderPct: number;
  top100HolderPct: number;
  topHolders: TopHolderEntry[];
  giniProxy: number | null;
  source: "etherscan" | "bscscan" | "basescan" | "manual" | "unavailable";
  dataQuality: "HIGH" | "MEDIUM" | "LOW";
  limitations: string[];
}

export interface HolderTimeSeriesFeatures {
  token: string;
  timestamp: string;
  holderCount: number;
  holderCountChange1d: number | null;
  holderCountChange7d: number | null;
  holderCountChange14d: number | null;
  top10HolderConcentration: number;
  top50HolderConcentration: number;
  top10Delta1d: number | null;
  top10Delta7d: number | null;
  whaleBalanceChange1d: number | null;
  newHolderGrowthRate: number | null;
  retailHolderGrowthProxy: number | null;
  accumulationProxy: "NONE" | "WEAK" | "MODERATE" | "STRONG";
  distributionRiskProxy: "NONE" | "WEAK" | "MODERATE" | "STRONG";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  missingEvidence: string[];
}
