export interface TransferFlowSnapshot {
  token: string;
  chain: string;
  contract: string;
  timestamp: string;
  transferCount1d: number;
  transferVolume1d: number;
  largeTransferCount1d: number;
  largeTransferVolume1d: number;
  toCexCount: number | null;
  toCexVolume: number | null;
  fromCexCount: number | null;
  fromCexVolume: number | null;
  netCexFlowProxy: number | null;
  knownEntityCoverage: number;
  source: "etherscan" | "bscscan" | "basescan" | "manual" | "unavailable";
  dataQuality: "HIGH" | "MEDIUM" | "LOW";
  limitations: string[];
}

export type EntityLabelType = "CEX" | "DEX_POOL" | "PROJECT_TEAM" | "VESTING" | "BRIDGE" | "LP" | "WHALE" | "UNKNOWN";

export interface AddressLabel {
  address: string;
  chain: string;
  labelType: EntityLabelType;
  entityName: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  source: string;
  notes: string;
}
