export interface ArkhamEndpoint {
  method: string;
  path: string;
  group: string;
  description: string;
  heavy: boolean;
  requiresChain: boolean;
  requiresAddress: boolean;
  requiresEntity: boolean;
  params: string[];
}

export const ARKHAM_ENDPOINTS: ArkhamEndpoint[] = [
  // Health / Metadata
  { method: "GET", path: "/health", group: "health", description: "API health check", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: false, params: [] },
  { method: "GET", path: "/chains", group: "health", description: "Supported chains", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: false, params: [] },

  // Intelligence
  { method: "GET", path: "/intelligence/address/{address}", group: "intelligence", description: "Address intelligence", heavy: false, requiresChain: true, requiresAddress: true, requiresEntity: false, params: ["chain"] },
  { method: "GET", path: "/intelligence/address/{address}/all", group: "intelligence", description: "Address intelligence all chains", heavy: false, requiresChain: false, requiresAddress: true, requiresEntity: false, params: [] },
  { method: "GET", path: "/intelligence/address_enriched/{address}", group: "intelligence", description: "Enriched address intelligence", heavy: false, requiresChain: true, requiresAddress: true, requiresEntity: false, params: ["chain"] },
  { method: "GET", path: "/intelligence/address_enriched/{address}/all", group: "intelligence", description: "Enriched intelligence all chains", heavy: false, requiresChain: false, requiresAddress: true, requiresEntity: false, params: [] },
  { method: "GET", path: "/intelligence/entity/{entity}", group: "intelligence", description: "Entity intelligence", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: true, params: [] },
  { method: "GET", path: "/intelligence/entity/{entity}/summary", group: "intelligence", description: "Entity summary statistics", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: true, params: [] },
  { method: "GET", path: "/intelligence/entity_predictions/{entity}", group: "intelligence", description: "Entity predictions", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: true, params: [] },
  { method: "GET", path: "/intelligence/contract/{chain}/{address}", group: "intelligence", description: "Contract intelligence", heavy: false, requiresChain: true, requiresAddress: true, requiresEntity: false, params: [] },
  { method: "GET", path: "/intelligence/token/{chain}/{address}", group: "intelligence", description: "Token intelligence by chain/address", heavy: false, requiresChain: true, requiresAddress: true, requiresEntity: false, params: [] },
  { method: "GET", path: "/intelligence/token/{id}", group: "intelligence", description: "Token intelligence by pricing ID", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: false, params: [] },
  { method: "GET", path: "/intelligence/search", group: "intelligence", description: "Search addresses, entities, tokens", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: false, params: ["q"] },
  { method: "GET", path: "/intelligence/entity_types", group: "intelligence", description: "Get all entity types", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: false, params: [] },

  // Token
  { method: "GET", path: "/token/holders/{chain}/{address}", group: "token", description: "Top token holders", heavy: false, requiresChain: true, requiresAddress: true, requiresEntity: false, params: ["limit"] },
  { method: "GET", path: "/token/holders/{id}", group: "token", description: "Top token holders by pricing ID", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: false, params: ["limit"] },
  { method: "GET", path: "/token/top_flow/{chain}/{address}", group: "token", description: "Top token flow by chain/address", heavy: true, requiresChain: true, requiresAddress: true, requiresEntity: false, params: ["limit", "timeGte", "timeLte"] },
  { method: "GET", path: "/token/top_flow/{id}", group: "token", description: "Top token flow by pricing ID", heavy: true, requiresChain: false, requiresAddress: false, requiresEntity: false, params: ["limit", "timeGte", "timeLte"] },
  { method: "GET", path: "/token/volume/{chain}/{address}", group: "token", description: "Token volume by chain/address", heavy: true, requiresChain: true, requiresAddress: true, requiresEntity: false, params: ["timeGte", "timeLte"] },
  { method: "GET", path: "/token/volume/{id}", group: "token", description: "Token volume by pricing ID", heavy: true, requiresChain: false, requiresAddress: false, requiresEntity: false, params: ["timeGte", "timeLte"] },
  { method: "GET", path: "/token/trending", group: "token", description: "Trending tokens", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: false, params: [] },
  { method: "GET", path: "/token/top", group: "token", description: "Top tokens by activity", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: false, params: [] },
  { method: "GET", path: "/token/balance/{chain}/{address}", group: "token", description: "Token balance on chain", heavy: false, requiresChain: true, requiresAddress: true, requiresEntity: false, params: [] },
  { method: "GET", path: "/token/balance/{id}", group: "token", description: "Token balance all chains", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: false, params: [] },
  { method: "GET", path: "/token/addresses/{id}", group: "token", description: "Chain addresses for a token", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: false, params: [] },
  { method: "GET", path: "/token/market/{id}", group: "token", description: "Current market data", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: false, params: [] },
  { method: "GET", path: "/token/price/history/{id}", group: "token", description: "Token price history", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: false, params: ["from", "to"] },

  // Transfers / Swaps
  { method: "GET", path: "/transfers", group: "transfers", description: "Get transfers", heavy: true, requiresChain: false, requiresAddress: false, requiresEntity: false, params: ["chains", "tokens", "timeGte", "timeLte", "limit", "flow"] },
  { method: "GET", path: "/transfers/histogram", group: "transfers", description: "Detailed transfer histogram", heavy: true, requiresChain: false, requiresAddress: false, requiresEntity: false, params: ["chains", "tokens", "timeGte", "timeLte"] },
  { method: "GET", path: "/transfers/histogram/simple", group: "transfers", description: "Simple transfer histogram", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: false, params: ["chains", "tokens", "timeGte", "timeLte"] },
  { method: "GET", path: "/swaps", group: "transfers", description: "Get swaps", heavy: true, requiresChain: false, requiresAddress: false, requiresEntity: false, params: ["chains", "tokens", "timeGte", "timeLte", "limit"] },

  // Balances / Portfolio / History
  { method: "GET", path: "/balances/address/{address}", group: "balances", description: "Token balances for address", heavy: false, requiresChain: false, requiresAddress: true, requiresEntity: false, params: ["chain"] },
  { method: "GET", path: "/balances/entity/{entity}", group: "balances", description: "Token balances for entity", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: true, params: ["chain"] },
  { method: "GET", path: "/portfolio/address/{address}", group: "portfolio", description: "Address portfolio history", heavy: false, requiresChain: false, requiresAddress: true, requiresEntity: false, params: [] },
  { method: "GET", path: "/portfolio/entity/{entity}", group: "portfolio", description: "Entity portfolio history", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: true, params: [] },
  { method: "GET", path: "/portfolio/timeSeries/address/{address}", group: "portfolio", description: "Address portfolio time series", heavy: true, requiresChain: false, requiresAddress: true, requiresEntity: false, params: ["token"] },
  { method: "GET", path: "/portfolio/timeSeries/entity/{entity}", group: "portfolio", description: "Entity portfolio time series", heavy: true, requiresChain: false, requiresAddress: false, requiresEntity: true, params: ["token"] },
  { method: "GET", path: "/history/address/{address}", group: "history", description: "Historical data for address", heavy: true, requiresChain: false, requiresAddress: true, requiresEntity: false, params: [] },
  { method: "GET", path: "/history/entity/{entity}", group: "history", description: "Historical data for entity", heavy: true, requiresChain: false, requiresAddress: false, requiresEntity: true, params: [] },

  // Counterparties / Flow
  { method: "GET", path: "/counterparties/address/{address}", group: "counterparties", description: "Top counterparties for address", heavy: true, requiresChain: false, requiresAddress: true, requiresEntity: false, params: [] },
  { method: "GET", path: "/counterparties/entity/{entity}", group: "counterparties", description: "Top counterparties for entity", heavy: true, requiresChain: false, requiresAddress: false, requiresEntity: true, params: [] },
  { method: "GET", path: "/flow/address/{address}", group: "flow", description: "Historical USD flows for address", heavy: true, requiresChain: false, requiresAddress: true, requiresEntity: false, params: [] },
  { method: "GET", path: "/flow/entity/{entity}", group: "flow", description: "Historical USD flows for entity", heavy: true, requiresChain: false, requiresAddress: false, requiresEntity: true, params: [] },

  // Market / Networks
  { method: "GET", path: "/marketdata/altcoin_index", group: "market", description: "Altcoin Index", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: false, params: [] },
  { method: "GET", path: "/networks/status", group: "networks", description: "Current network status", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: false, params: [] },

  // Volume (transfer volume stats)
  { method: "GET", path: "/volume/address/{address}", group: "volume", description: "Transfer volume for address", heavy: true, requiresChain: false, requiresAddress: true, requiresEntity: false, params: [] },
  { method: "GET", path: "/volume/entity/{entity}", group: "volume", description: "Transfer volume for entity", heavy: true, requiresChain: false, requiresAddress: false, requiresEntity: true, params: [] },

  // Entity balance changes
  { method: "GET", path: "/intelligence/entity_balance_changes", group: "intelligence", description: "Entity balance changes", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: false, params: ["chains", "timeGte", "timeLte"] },

  // Clusters
  { method: "GET", path: "/cluster/{id}/summary", group: "clusters", description: "Cluster summary", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: true, params: [] },

  // Tags
  { method: "GET", path: "/tag/{id}/params", group: "tags", description: "Tag parameters", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: true, params: [] },
  { method: "GET", path: "/tag/{id}/summary", group: "tags", description: "Tag summary", heavy: false, requiresChain: false, requiresAddress: false, requiresEntity: true, params: [] },
];

export function getEndpointsByGroup(): Map<string, ArkhamEndpoint[]> {
  const map = new Map<string, ArkhamEndpoint[]>();
  for (const ep of ARKHAM_ENDPOINTS) {
    const list = map.get(ep.group) || [];
    list.push(ep);
    map.set(ep.group, list);
  }
  return map;
}

export function getHeavyEndpoints(): ArkhamEndpoint[] {
  return ARKHAM_ENDPOINTS.filter(e => e.heavy);
}

export function getEndpointsForTokenDiscovery(): ArkhamEndpoint[] {
  return ARKHAM_ENDPOINTS.filter(e =>
    e.group === "token" || e.group === "intelligence" || e.group === "transfers"
  );
}
