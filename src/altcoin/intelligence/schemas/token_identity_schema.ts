export interface TokenIdentity {
  symbol: string;
  name: string;
  coingeckoId: string;
  cmcId: string | null;
  primaryChain: string;
  chains: string[];
  isMultichain: boolean;
  isNative: boolean;
  contracts: { chain: string; address: string }[];
  cexListings: string[];
  dexPairs: string[];
  launchDate: string | null;
  athPrice: number | null;
  athDate: string | null;
  dataQuality: "HIGH" | "MEDIUM" | "LOW";
  missingFields: string[];
}
