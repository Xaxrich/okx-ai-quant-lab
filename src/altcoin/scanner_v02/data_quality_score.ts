export function computeIdentityQuality(reg: {
  coingecko_id: string; cmc_id: string; symbol: string;
  primary_chain: string; contract_address: string;
  manual_confirmation_required: string;
}): { score: number; missing: string[] } {
  let score = 0;
  const missing: string[] = [];
  if (reg.coingecko_id && reg.coingecko_id.length > 0) score += 0.25; else missing.push("coingecko_id");
  if (reg.cmc_id && reg.cmc_id.length > 0) score += 0.25; else missing.push("cmc_id");
  if (reg.symbol && reg.symbol.length > 0) score += 0.15; else missing.push("symbol");
  if (reg.primary_chain && reg.primary_chain.length > 0) score += 0.15; else missing.push("primary_chain");
  if ((reg.contract_address && reg.contract_address.length > 5) || reg.manual_confirmation_required === "native") score += 0.20; else missing.push("contract_address");
  return { score: Math.round(score * 100) / 100, missing };
}

export function computeFeatureCoverage(opts: {
  hasPriceFeatures: boolean; hasDexAggregation: boolean;
  hasSupplyScope: boolean; hasCmcSupply: boolean; hasBuySellTxns: boolean;
}): { score: number; missing: string[] } {
  let score = 0;
  const missing: string[] = [];
  if (opts.hasPriceFeatures) score += 0.25; else missing.push("price_features_90d");
  if (opts.hasDexAggregation) score += 0.25; else missing.push("dex_aggregation");
  if (opts.hasSupplyScope) score += 0.25; else missing.push("supply_scope");
  if (opts.hasCmcSupply) score += 0.15; else missing.push("cmc_supply_fields");
  if (opts.hasBuySellTxns) score += 0.10; else missing.push("buy_sell_txns");
  return { score: Math.round(score * 100) / 100, missing };
}

export function overallDataQuality(identityScore: number, featureScore: number): number {
  return Math.round((0.4 * identityScore + 0.6 * featureScore) * 100) / 100;
}

export function dataQualityLabel(identityScore: number, featureScore: number): "NEED_MORE_DATA" | "INSUFFICIENT_DEEP_DATA" | "SUFFICIENT" {
  if (identityScore < 0.5) return "NEED_MORE_DATA";
  if (featureScore < 0.5) return "INSUFFICIENT_DEEP_DATA";
  return "SUFFICIENT";
}
