import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

// Token configuration schema for the reusable analysis framework

export interface TokenConfig {
  symbol: string;
  coingecko_id: string;
  chain: string;
  contract?: string;
  okx_inst_id?: string;
  category: "P0_EXPLOSIVE" | "P1_STRONG" | "P2_MOMENTUM" | "CONTROL" | "WATCH";
  breakout_date?: string;
  peak_date?: string;
  notes?: string;
}

// LAB is the reference implementation
export const LAB_CONFIG: TokenConfig = {
  symbol: "LAB",
  coingecko_id: "lab",
  chain: "bsc",
  contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A",
  okx_inst_id: "LAB-USDT-SWAP",
  category: "P0_EXPLOSIVE",
  breakout_date: "2026-04-23",
  peak_date: "2026-05-02",
  notes: "Reference implementation. 7d return 464%. BSC chain. Main DEX: PancakeSwap. Derivatives: KuCoin(26%)+Bitget(23%)+Binance(15%)."
};

// Watchlist of additional tokens (to be expanded)
export const WATCHLIST: TokenConfig[] = [
  LAB_CONFIG,
  {
    symbol: "PEPE",
    coingecko_id: "pepe",
    chain: "ethereum",
    contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
    okx_inst_id: "PEPE-USDT-SWAP",
    category: "CONTROL",
    notes: "Meme coin control. 7d return 9.4%. ETH chain."
  },
  {
    symbol: "BSB",
    coingecko_id: "block-street",
    chain: "ethereum",
    contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411",
    okx_inst_id: "BSB-USDT-SWAP",
    category: "P0_EXPLOSIVE",
    breakout_date: "2026-04-25",
    peak_date: "2026-05-04",
    notes: "7d return 253%. ETH chain."
  },
  {
    symbol: "UB",
    coingecko_id: "unibase",
    chain: "bsc",
    contract: "0x40b8129b786d766267a7a118cf8c07e31cdb6fde",
    category: "P0_EXPLOSIVE",
    breakout_date: "2026-04-25",
    peak_date: "2026-05-02",
    notes: "7d return 256%. BSC chain."
  },
];

// ── Reusable indicator framework ──

export interface IndicatorSnapshot {
  timestamp: string;
  token: string;
  // Core
  price_usd: number;
  return_24h: number;
  volume_24h: number;
  market_cap: number;
  // CoinGlass
  oi_total_usd: number;
  oi_change_4h: number;
  oi_change_24h: number;
  funding_rate_percent: number;
  funding_streak: number;
  liq_4h: number;
  // Advanced
  oi_concentration_hhi: number;
  oi_top3_share: number;
  oi_acceleration: number;
  funding_oi_divergence: string;
  liq_bias: number;
  // DEX
  dex_buy_count: number;
  dex_sell_count: number;
  dex_buy_ratio: number;
  dex_volume_24h: number;
  dex_liquidity: number;
  // Risk
  risk_score: number;
  risk_state: string;
  market_phase: string;
  // Meta
  data_freshness: string;
  cg_budget_remaining: number;
  limitations: string;
}

// Generate config file for new tokens
export function saveWatchlist(path: string) {
  writeFileSync(path, JSON.stringify(WATCHLIST, null, 2));
}

export function loadWatchlist(path: string): TokenConfig[] {
  if (!existsSync(path)) return WATCHLIST;
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return WATCHLIST; }
}
