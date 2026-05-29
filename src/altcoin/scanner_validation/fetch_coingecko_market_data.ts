import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fetchCompatWithFallback as fetch } from "../../utils/http.js";

const RAW_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_validation", "raw");
const CG_BASE = "https://api.coingecko.com/api/v3";

interface CoinGeckoMarketData {
  prices: [number, number][];       // [timestamp_ms, price]
  market_caps: [number, number][];  // [timestamp_ms, market_cap]
  total_volumes: [number, number][];// [timestamp_ms, volume]
}

interface DailyRow {
  date: string;
  timestamp: number;
  price: number;
  market_cap: number;
  volume: number;
  implied_supply: number;
}

async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url);
      if (resp.status === 429) {
        const wait = (i + 1) * 30000;
        console.log(`  Rate limited, waiting ${wait / 1000}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!resp.ok) {
        console.log(`  HTTP ${resp.status} for ${url.split("/").pop()?.split("?")[0]}`);
        return null;
      }
      return await resp.json();
    } catch (err: any) {
      console.log(`  Fetch error: ${err.message}`);
      if (i < retries - 1) await new Promise(r => setTimeout(r, 5000));
    }
  }
  return null;
}

async function fetchCoinGeckoData(coingeckoId: string, days: number = 90): Promise<CoinGeckoMarketData | null> {
  const url = `${CG_BASE}/coins/${coingeckoId}/market_chart?vs_currency=usd&days=${days}`;
  console.log(`  Fetching ${coingeckoId} (${days}d)...`);
  const data = await fetchWithRetry(url);
  return data as CoinGeckoMarketData | null;
}

function marketDataToDaily(md: CoinGeckoMarketData): DailyRow[] {
  // CoinGecko returns data at irregular intervals. Aggregate to daily.
  const dailyMap = new Map<string, { prices: number[]; mcap: number; vol: number }>();

  // Use last data point of each day
  for (let i = 0; i < md.prices.length; i++) {
    const [ts, price] = md.prices[i];
    const date = new Date(ts).toISOString().slice(0, 10);
    const existing = dailyMap.get(date);
    if (!existing || ts > (existing.prices[0] || 0)) {
      const mcap = i < md.market_caps.length ? md.market_caps[i][1] : 0;
      const vol = i < md.total_volumes.length ? md.total_volumes[i][1] : 0;
      dailyMap.set(date, { prices: [ts, price], mcap, vol });
    }
  }

  const rows: DailyRow[] = [];
  for (const [date, data] of dailyMap) {
    const price = data.prices[1];
    const mcap = data.mcap;
    rows.push({
      date,
      timestamp: new Date(date).getTime(),
      price,
      market_cap: mcap,
      volume: data.vol,
      implied_supply: price > 0 ? mcap / price : 0,
    });
  }

  return rows.sort((a, b) => a.timestamp - b.timestamp);
}

async function main() {
  console.log("=== CoinGecko Market Data Fetcher ===\n");

  if (!existsSync(RAW_DIR)) mkdirSync(RAW_DIR, { recursive: true });

  const samples = [
    { id: "block-street", symbol: "BSB" },
    { id: "lab", symbol: "LAB" },
    { id: "pepe", symbol: "PEPE" },
    { id: "bonk", symbol: "BONK" },
    { id: "dogwifhat", symbol: "WIF" },
    { id: "dogecoin", symbol: "DOGE" },
    { id: "shiba-inu", symbol: "SHIB" },
    { id: "floki", symbol: "FLOKI" },
    { id: "aevo", symbol: "AEVO" },
    { id: "constitutiondao", symbol: "PEOPLE" },
    { id: "ethereum", symbol: "ETH" },
    { id: "bitcoin", symbol: "BTC" },
    { id: "solana", symbol: "SOL" },
    { id: "arbitrum", symbol: "ARB" },
    { id: "optimism", symbol: "OP" },
  ];

  for (const sample of samples) {
    const md = await fetchCoinGeckoData(sample.id, 90);
    if (!md || md.prices.length === 0) {
      console.log(`  ${sample.symbol}: NO DATA`);
      continue;
    }

    const daily = marketDataToDaily(md);
    const path = join(RAW_DIR, `${sample.symbol}_coingecko_daily.json`);
    writeFileSync(path, JSON.stringify(daily, null, 2));
    console.log(`  ${sample.symbol}: ${daily.length} daily rows saved`);
  }

  console.log(`\nData saved to ${RAW_DIR}`);
}

main().catch(console.error);
