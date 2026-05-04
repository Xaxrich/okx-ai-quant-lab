import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fetchPaginated } from "../data/fetch_candles.js";
import { sma } from "../indicators/sma.js";
import { atr } from "../indicators/atr.js";
import { rsi } from "../indicators/rsi.js";

const FEATURES_DIR = join(import.meta.dirname, "..", "..", "data", "altcoin", "features");

interface Candle { ts: number; open: number; high: number; low: number; close: number; volume: number; }

interface FeatureRow {
  token: string; chain: string; contract: string;
  eventId: string; eventDate: string; window: string; date: string; label: string;
  // Price
  return_1d: number; return_3d: number; return_7d: number; return_14d: number; return_30d: number;
  relative_return_vs_btc_7d: number; relative_return_vs_eth_7d: number;
  distance_to_30d_high: number; distance_to_60d_high: number;
  volatility_7d: number; volatility_30d: number; volatility_compression_score: number; atr_14: number;
  // Volume
  volume_1d: number; volume_7d_avg: number; volume_30d_avg: number;
  volume_zscore_7d: number; volume_zscore_30d: number;
  // RSI
  rsi_14: number;
  // Data quality
  data_quality_score: number;
}

interface TokenIdentity {
  symbol: string; name: string; chain: string; contract: string;
  okxInstId: string; cgId: string; launchDate: string;
  athPrice: number; athDate: string;
  dataAvailability: { cex: boolean; derivatives: boolean; onchain: boolean; dex: boolean; social: boolean };
}

// Token identities from CoinGecko research
const TOKENS: TokenIdentity[] = [
  {
    symbol: "PEPE", name: "Pepe", chain: "Ethereum",
    contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
    okxInstId: "PEPE-USDT", cgId: "pepe", launchDate: "2023-04-01",
    athPrice: 0.00002803, athDate: "2024-12-09",
    dataAvailability: { cex: true, derivatives: false, onchain: false, dex: false, social: false },
  },
  {
    symbol: "WIF", name: "dogwifhat", chain: "Solana",
    contract: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    okxInstId: "WIF-USDT", cgId: "dogwifhat", launchDate: "2023-11-01",
    athPrice: 4.83, athDate: "2024-03-31",
    dataAvailability: { cex: true, derivatives: false, onchain: false, dex: false, social: false },
  },
  {
    symbol: "BONK", name: "Bonk", chain: "Solana",
    contract: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    okxInstId: "BONK-USDT", cgId: "bonk", launchDate: "2022-12-25",
    athPrice: 0.00005825, athDate: "2024-11-20",
    dataAvailability: { cex: true, derivatives: false, onchain: false, dex: false, social: false },
  },
];

function computeReturns(candles: Candle[], idx: number): Record<string, number> {
  const close = candles[idx].close;
  return {
    return_1d: idx >= 1 ? (close - candles[idx - 1].close) / candles[idx - 1].close : 0,
    return_3d: idx >= 3 ? (close - candles[idx - 3].close) / candles[idx - 3].close : 0,
    return_7d: idx >= 7 ? (close - candles[idx - 7].close) / candles[idx - 7].close : 0,
    return_14d: idx >= 14 ? (close - candles[idx - 14].close) / candles[idx - 14].close : 0,
    return_30d: idx >= 30 ? (close - candles[idx - 30].close) / candles[idx - 30].close : 0,
  };
}

function computeVolatility(candles: Candle[], idx: number, period: number): number {
  if (idx < period) return 0;
  const returns: number[] = [];
  for (let i = idx - period + 1; i <= idx; i++) {
    returns.push(Math.log(candles[i].close / candles[i - 1].close));
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(period);
}

function extractFeatures(
  token: TokenIdentity,
  candles: Candle[],
  btcCandles: Candle[],
  ethCandles: Candle[],
): FeatureRow[] {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  const atr14 = atr(highs, lows, closes, 14);
  const rsi14 = rsi(closes, 14);

  // Find breakout events: max 7d return
  const events: { idx: number; date: string; return7d: number }[] = [];
  for (let i = 7; i < closes.length; i++) {
    const r7d = (closes[i] - closes[i - 7]) / closes[i - 7];
    if (r7d > 0.30) { // 30%+ in 7 days
      // Merge nearby events (within 14 days)
      const lastEvent = events[events.length - 1];
      if (lastEvent && i - lastEvent.idx < 14) continue;
      events.push({ idx: i, date: new Date(candles[i].ts).toISOString().slice(0, 10), return7d: r7d });
    }
  }

  const rows: FeatureRow[] = [];

  // Generate feature rows for windows around each event
  for (const event of events) {
    const windows = [-30, -14, -7, -3, 0, 3, 7, 14, 30];
    for (const w of windows) {
      const idx = event.idx + w;
      if (idx < 30 || idx >= candles.length) continue;

      const returns = computeReturns(candles, idx);
      const vol7d = computeVolatility(candles, idx, 7);
      const vol30d = computeVolatility(candles, idx, 30);
      const volCompression = vol30d > 0 ? 1 - (vol7d / vol30d) : 0;

      // Volume stats
      const volSlice7d = volumes.slice(Math.max(0, idx - 7), idx + 1);
      const volSlice30d = volumes.slice(Math.max(0, idx - 30), idx + 1);
      const vol7dAvg = volSlice7d.reduce((a, b) => a + b, 0) / volSlice7d.length;
      const vol30dAvg = volSlice30d.reduce((a, b) => a + b, 0) / volSlice30d.length;
      const volStd = Math.sqrt(volSlice30d.reduce((s, v) => s + (v - vol30dAvg) ** 2, 0) / volSlice30d.length);
      const volZ7d = volStd > 0 ? (vol7dAvg - vol30dAvg) / volStd : 0;
      const volZ30d = volStd > 0 ? (volSlice30d[volSlice30d.length - 1] - vol30dAvg) / volStd : 0;

      // Relative to BTC/ETH
      const btcClose = idx < btcCandles.length ? btcCandles[idx].close : 0;
      const ethClose = idx < ethCandles.length ? ethCandles[idx].close : 0;
      const btcRet7d = idx >= 7 && idx < btcCandles.length
        ? (btcClose - btcCandles[idx - 7].close) / btcCandles[idx - 7].close : 0;
      const ethRet7d = idx >= 7 && idx < ethCandles.length
        ? (ethClose - ethCandles[idx - 7].close) / ethCandles[idx - 7].close : 0;

      // Distance to highs
      const high30d = Math.max(...closes.slice(Math.max(0, idx - 30), idx + 1));
      const high60d = Math.max(...closes.slice(Math.max(0, idx - 60), idx + 1));
      const dist30d = (closes[idx] - high30d) / high30d;
      const dist60d = (closes[idx] - high60d) / high60d;

      // Data quality: what we have vs what's ideal
      const dataQuality = token.dataAvailability.cex ? 0.4 : 0
        + (token.dataAvailability.onchain ? 0.2 : 0)
        + (token.dataAvailability.derivatives ? 0.2 : 0)
        + (token.dataAvailability.social ? 0.1 : 0)
        + (token.dataAvailability.dex ? 0.1 : 0);

      rows.push({
        token: token.symbol, chain: token.chain, contract: token.contract,
        eventId: `event_${event.date}`, eventDate: event.date,
        window: `T${w >= 0 ? "+" : ""}${w}`,
        date: new Date(candles[idx].ts).toISOString().slice(0, 10),
        label: w < 0 ? "pre_breakout" : w === 0 ? "breakout" : "post_breakout",
        ...returns,
        relative_return_vs_btc_7d: returns.return_7d - btcRet7d,
        relative_return_vs_eth_7d: returns.return_7d - ethRet7d,
        distance_to_30d_high: dist30d,
        distance_to_60d_high: dist60d,
        volatility_7d: vol7d, volatility_30d: vol30d,
        volatility_compression_score: volCompression,
        atr_14: atr14[idx] ?? 0,
        volume_1d: volumes[idx], volume_7d_avg: vol7dAvg, volume_30d_avg: vol30dAvg,
        volume_zscore_7d: volZ7d, volume_zscore_30d: volZ30d,
        rsi_14: rsi14[idx] ?? 50,
        data_quality_score: Math.round(dataQuality * 100) / 100,
      });
    }
  }

  return rows;
}

async function main() {
  console.log("=== Altcoin Feature Extractor ===\n");

  if (!existsSync(FEATURES_DIR)) mkdirSync(FEATURES_DIR, { recursive: true });

  // Pull BTC and ETH as benchmarks
  console.log("Loading BTC-USDT benchmark...");
  const btcCandles = await fetchPaginated("BTC-USDT", "1D", 300);

  console.log("Loading ETH-USDT benchmark...");
  const ethCandles = await fetchPaginated("ETH-USDT", "1D", 300);

  const allRows: FeatureRow[] = [];

  for (const token of TOKENS) {
    console.log(`\nProcessing ${token.symbol}...`);
    try {
      const candles = await fetchPaginated(token.okxInstId, "1D", 300);
      if (candles.length < 30) {
        console.log(`  Only ${candles.length} candles — skipping feature extraction.`);
        continue;
      }

      const candArr: Candle[] = candles.map(c => ({
        ts: c.ts, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
      }));

      const btcArr: Candle[] = btcCandles.map(c => ({
        ts: c.ts, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
      }));

      const ethArr: Candle[] = ethCandles.map(c => ({
        ts: c.ts, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
      }));

      const rows = extractFeatures(token, candArr, btcArr, ethArr);
      allRows.push(...rows);
      console.log(`  Events found: ${new Set(rows.map(r => r.eventId)).size}`);
      console.log(`  Feature rows: ${rows.length}`);
    } catch (err: any) {
      console.log(`  ERROR: ${err.message}`);
    }
  }

  // Write combined CSV
  if (allRows.length > 0) {
    const headers = Object.keys(allRows[0]).join(",");
    const csvRows = allRows.map(r => Object.values(r).join(","));
    const csv = [headers, ...csvRows].join("\n");

    const allPath = join(FEATURES_DIR, "all_tokens_feature_table.csv");
    writeFileSync(allPath, csv);
    console.log(`\nWrote ${allRows.length} rows to ${allPath}`);
  } else {
    console.log("\nNo features extracted. Data too sparse.");
  }

  // Write data availability matrix
  const availLines = ["token,cex,derivatives,onchain,dex,social,launch_date,ath_date,data_window_start,data_window_end,ath_price,current_price,decline_from_ath_pct"];
  for (const token of TOKENS) {
    try {
      const candles = await fetchPaginated(token.okxInstId, "1D", 2);
      const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
      const firstPrice = candles.length > 0 ? candles[0].close : 0;
      const declineFromAth = token.athPrice > 0 ? ((currentPrice - token.athPrice) / token.athPrice * 100).toFixed(1) : "N/A";
      availLines.push(`${token.symbol},${token.dataAvailability.cex},${token.dataAvailability.derivatives},${token.dataAvailability.onchain},${token.dataAvailability.dex},${token.dataAvailability.social},${token.launchDate},${token.athDate},2025-07-07,2026-05-02,${token.athPrice},${currentPrice},${declineFromAth}%`);
    } catch {
      availLines.push(`${token.symbol},true,false,false,false,false,${token.launchDate},${token.athDate},2025-07-07,2026-05-02,${token.athPrice},${0},N/A`);
    }
  }
  const availPath = join(import.meta.dirname, "..", "..", "reports", "altcoin", "data_availability_matrix.md");
  if (!existsSync(join(import.meta.dirname, "..", "..", "reports", "altcoin"))) {
    mkdirSync(join(import.meta.dirname, "..", "..", "reports", "altcoin"), { recursive: true });
  }
  writeFileSync(availPath, availLines.join("\n"));
  console.log(`Data availability matrix: ${availPath}`);

  // Summary
  console.log("\n=== Feature Extraction Complete ===");
  console.log(`Tokens: ${TOKENS.map(t => t.symbol).join(", ")}`);
  console.log(`Total feature rows: ${allRows.length}`);
  console.log(`Data sources: CEX (OKX) only`);
  console.log(`MISSING: on-chain, DEX, derivatives, social`);
  console.log(`Time window: 2025-07-07 to 2026-05-02 (post-ATH for all tokens)`);
  console.log(`\nLIMITATION: Main breakout events for PEPE/WIF/BONK occurred in 2023-2024.`);
  console.log(`Our data covers the POST-ATH decline period only.`);
}

main().catch(console.error);
