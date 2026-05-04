import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const RAW_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_validation", "raw");
const FEATURES_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_validation", "features");

interface DailyRow {
  date: string; timestamp: number; price: number;
  market_cap: number; volume: number; implied_supply: number;
}

interface FeatureRow {
  symbol: string;
  date: string;
  timestamp: number;
  // Price features
  price: number;
  market_cap: number;
  volume: number;
  implied_supply: number;
  price_return_1d: number;
  price_return_3d: number;
  price_return_7d: number;
  market_cap_return_1d: number;
  implied_supply_change_1d: number;
  implied_supply_change_7d: number;
  // Volume features
  volume_3d_avg: number;
  volume_7d_avg: number;
  volume_30d_avg: number;
  volume_zscore_7d: number;
  volume_zscore_30d: number;
  // Range/volatility
  price_range_3d: number;
  price_range_7d: number;
  realized_volatility_3d: number;
  realized_volatility_7d: number;
  distance_to_7d_high: number;
  distance_to_30d_high: number;
  // Compression
  compression_score: number;
  // Divergence
  price_market_cap_divergence: number;
  // Data quality
  data_quality_score: number;
  data_days_available: number;
  // Labels
  is_positive_sample: number;
  event_date: string;
  relative_day_to_event: number;
}

function computeFeatures(rows: DailyRow[], symbol: string, isPositive: boolean, eventDate: string): FeatureRow[] {
  const n = rows.length;
  if (n < 14) return [];

  const features: FeatureRow[] = [];

  for (let i = 30; i < n; i++) {
    const cur = rows[i];
    const prev1 = i >= 1 ? rows[i - 1] : cur;
    const prev3 = i >= 3 ? rows[i - 3] : cur;
    const prev7 = i >= 7 ? rows[i - 7] : cur;

    // Returns
    const ret1d = prev1.price > 0 ? (cur.price - prev1.price) / prev1.price : 0;
    const ret3d = prev3.price > 0 ? (cur.price - prev3.price) / prev3.price : 0;
    const ret7d = prev7.price > 0 ? (cur.price - prev7.price) / prev7.price : 0;
    const mcapRet1d = prev1.market_cap > 0 ? (cur.market_cap - prev1.market_cap) / prev1.market_cap : 0;
    const supplyChg1d = prev1.implied_supply > 0 ? (cur.implied_supply - prev1.implied_supply) / prev1.implied_supply : 0;
    const supplyChg7d = prev7.implied_supply > 0 ? (cur.implied_supply - prev7.implied_supply) / prev7.implied_supply : 0;

    // Volume stats
    const volSlice3 = rows.slice(Math.max(0, i - 2), i + 1).map(r => r.volume);
    const volSlice7 = rows.slice(Math.max(0, i - 6), i + 1).map(r => r.volume);
    const volSlice30 = rows.slice(Math.max(0, i - 29), i + 1).map(r => r.volume);
    const vol3dAvg = volSlice3.reduce((a, b) => a + b, 0) / volSlice3.length;
    const vol7dAvg = volSlice7.reduce((a, b) => a + b, 0) / volSlice7.length;
    const vol30dAvg = volSlice30.reduce((a, b) => a + b, 0) / volSlice30.length;
    const vol30dStd = Math.sqrt(volSlice30.reduce((s, v) => s + (v - vol30dAvg) ** 2, 0) / volSlice30.length);
    const volZ7d = vol30dStd > 0 ? (vol7dAvg - vol30dAvg) / vol30dStd : 0;
    const volZ30d = vol30dStd > 0 ? (cur.volume - vol30dAvg) / vol30dStd : 0;

    // Range
    const prices3 = rows.slice(Math.max(0, i - 2), i + 1).map(r => r.price);
    const prices7 = rows.slice(Math.max(0, i - 6), i + 1).map(r => r.price);
    const prices30 = rows.slice(Math.max(0, i - 29), i + 1).map(r => r.price);
    const range3d = (Math.max(...prices3) - Math.min(...prices3)) / Math.min(...prices3);
    const range7d = (Math.max(...prices7) - Math.min(...prices7)) / Math.min(...prices7);
    const high7d = Math.max(...prices7);
    const high30d = Math.max(...prices30);
    const dist7d = (cur.price - high7d) / high7d;
    const dist30d = (cur.price - high30d) / high30d;

    // Realized volatility
    const rets3: number[] = [];
    for (let j = i - 2; j <= i; j++) {
      if (j > 0) rets3.push(Math.log(rows[j].price / rows[j - 1].price));
    }
    const rets7: number[] = [];
    for (let j = i - 6; j <= i; j++) {
      if (j > 0) rets7.push(Math.log(rows[j].price / rows[j - 1].price));
    }
    const rv3 = rets3.length > 0 ? Math.sqrt(rets3.reduce((s, r) => s + r * r, 0) / rets3.length) : 0;
    const rv7 = rets7.length > 0 ? Math.sqrt(rets7.reduce((s, r) => s + r * r, 0) / rets7.length) : 0;

    // Compression score: low range + low vol relative to history
    const rangePercentile = prices30.filter(p => (Math.max(...prices3) - Math.min(...prices3)) / Math.min(...prices3) <= range3d).length / prices30.length;
    const volPercentile = volSlice30.filter(v => v <= vol7dAvg).length / volSlice30.length;
    const compressionScore = (1 - rangePercentile) * (1 - volPercentile);

    // Market cap / price divergence
    const divergence = ret1d !== 0 ? Math.abs(mcapRet1d - ret1d) / Math.abs(ret1d) : 0;

    // Data quality
    const dataQuality = 0.3 // CoinGecko price/mcap/vol available
      + (rows.length > 60 ? 0.2 : rows.length > 30 ? 0.1 : 0) // History length
      + 0.0; // No DEX/onchain/social

    // Event label
    let relativeDay = 999;
    if (eventDate && eventDate !== "none") {
      const eventTs = new Date(eventDate).getTime();
      relativeDay = Math.round((cur.timestamp - eventTs) / 86400000);
    }

    features.push({
      symbol, date: cur.date, timestamp: cur.timestamp,
      price: cur.price, market_cap: cur.market_cap,
      volume: cur.volume, implied_supply: cur.implied_supply,
      price_return_1d: ret1d, price_return_3d: ret3d, price_return_7d: ret7d,
      market_cap_return_1d: mcapRet1d,
      implied_supply_change_1d: supplyChg1d, implied_supply_change_7d: supplyChg7d,
      volume_3d_avg: vol3dAvg, volume_7d_avg: vol7dAvg, volume_30d_avg: vol30dAvg,
      volume_zscore_7d: volZ7d, volume_zscore_30d: volZ30d,
      price_range_3d: range3d, price_range_7d: range7d,
      realized_volatility_3d: rv3, realized_volatility_7d: rv7,
      distance_to_7d_high: dist7d, distance_to_30d_high: dist30d,
      compression_score: compressionScore,
      price_market_cap_divergence: divergence,
      data_quality_score: dataQuality,
      data_days_available: n,
      is_positive_sample: isPositive ? 1 : 0,
      event_date: eventDate,
      relative_day_to_event: relativeDay,
    });
  }

  return features;
}

async function main() {
  console.log("=== Scanner Feature Computation ===\n");

  if (!existsSync(FEATURES_DIR)) mkdirSync(FEATURES_DIR, { recursive: true });

  const positiveSet = new Set(["BSB", "LAB", "PEPE", "BONK", "WIF"]);
  const eventDates: Record<string, string> = {
    BSB: "2026-04-25", LAB: "2026-04-23",
    PEPE: "2025-12-28", BONK: "2025-07-12", WIF: "2025-12-30",
  };

  const allFeatures: FeatureRow[] = [];
  const files = readdirSync(RAW_DIR).filter(f => f.endsWith(".json"));

  for (const file of files) {
    const symbol = file.replace("_coingecko_daily.json", "");
    const rows = JSON.parse(readFileSync(join(RAW_DIR, file), "utf-8")) as DailyRow[];
    const isPositive = positiveSet.has(symbol);
    const eventDate = eventDates[symbol] || "none";

    console.log(`  ${symbol}: ${rows.length} rows, positive=${isPositive}`);

    const feats = computeFeatures(rows, symbol, isPositive, eventDate);
    allFeatures.push(...feats);
  }

  // Write combined feature table
  if (allFeatures.length > 0) {
    const headers = Object.keys(allFeatures[0]).join(",");
    const csv = [headers, ...allFeatures.map(r => Object.values(r).join(","))].join("\n");
    writeFileSync(join(FEATURES_DIR, "scanner_feature_table.csv"), csv);
    console.log(`\nWrote ${allFeatures.length} feature rows to scanner_feature_table.csv`);
  }
}

main().catch(console.error);
