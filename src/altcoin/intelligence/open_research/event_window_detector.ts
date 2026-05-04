import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const CACHE_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "scanner_v02", "cache", "price_features");
const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "open_research", "events");
const REGISTRY_PATH = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "scanner_v02", "registry", "token_metadata_registry.csv");

interface Candle { ts: number; price: number; mcap: number; volume: number; }

interface EventWindow {
  token: string;
  preEventStart: string; preEventEnd: string;
  breakoutDate: string;
  accelerationStart: string; accelerationEnd: string;
  localPeakDate: string;
  postPeakStart: string; postPeakEnd: string;
  crashDate: string | null;
  cooldownEnd: string | null;
  maxReturn7d: number; maxReturn14d: number; maxReturn30d: number;
  maxDrawdownAfterPeak: number;
  dataQuality: string;
  notes: string;
}

const STUDY_TOKENS = ["BSB", "LAB", "PEPE", "WIF", "BONK", "FLOKI"];

function loadCandles(token: string): Candle[] {
  // Load from cache
  const registry = readFileSync(REGISTRY_PATH, "utf-8").split("\n").slice(1)
    .map(l => { const p = l.split(","); return { symbol: p[0], cgId: p[3] }; });
  const reg = registry.find(r => r.symbol === token);
  if (!reg) return [];

  const cachePath = join(CACHE_DIR, `${reg.cgId}_90d.json`);
  if (!existsSync(cachePath)) return [];

  const cache = JSON.parse(readFileSync(cachePath, "utf-8"));
  const prices = cache.prices || [];
  const mcaps = cache.market_caps || [];
  const vols = cache.total_volumes || [];

  // Downsample to daily: take last data point of each day
  const dailyMap = new Map<string, Candle>();
  for (let i = 0; i < prices.length; i++) {
    const ts = prices[i][0];
    const date = new Date(ts).toISOString().slice(0, 10);
    const existing = dailyMap.get(date);
    if (!existing || ts > existing.ts) {
      dailyMap.set(date, {
        ts,
        price: prices[i][1],
        mcap: mcaps[i]?.[1] || 0,
        volume: vols[i]?.[1] || 0,
      });
    }
  }
  return [...dailyMap.values()].sort((a, b) => a.ts - b.ts);
}

function detectEventWindows(token: string, candles: Candle[]): EventWindow | null {
  if (candles.length < 30) return null;

  const closes = candles.map(c => c.price);
  const vols = candles.map(c => c.volume);
  const n = closes.length;

  // Find max 7d return and its date
  let maxRet7d = -Infinity, maxRetIdx = 0;
  for (let i = 7; i < n; i++) {
    const r = (closes[i] - closes[i - 7]) / closes[i - 7];
    if (r > maxRet7d) { maxRet7d = r; maxRetIdx = i; }
  }

  // Find max 14d and 30d returns around the same window
  let maxRet14d = 0, maxRet30d = 0;
  for (let i = Math.max(14, maxRetIdx - 3); i <= Math.min(n - 1, maxRetIdx + 3); i++) {
    if (i >= 14) { const r = (closes[i] - closes[i - 14]) / closes[i - 14]; if (r > maxRet14d) maxRet14d = r; }
    if (i >= 30) { const r = (closes[i] - closes[i - 30]) / closes[i - 30]; if (r > maxRet30d) maxRet30d = r; }
  }

  // Peak: highest close within 7 days after max return
  const peakStart = Math.max(0, maxRetIdx - 3);
  const peakEnd = Math.min(n - 1, maxRetIdx + 10);
  let peakIdx = peakStart;
  for (let i = peakStart; i <= peakEnd; i++) {
    if (closes[i] > closes[peakIdx]) peakIdx = i;
  }

  // Max drawdown after peak
  let maxDd = 0;
  let peakVal = closes[peakIdx];
  for (let i = peakIdx; i < n; i++) {
    if (closes[i] > peakVal) peakVal = closes[i];
    const dd = (peakVal - closes[i]) / peakVal;
    if (dd > maxDd) maxDd = dd;
  }

  // Crash date: first day after peak with >15% drop
  let crashDate: string | null = null;
  for (let i = peakIdx + 1; i < n; i++) {
    if ((closes[i] - closes[i - 1]) / closes[i - 1] < -0.15) {
      crashDate = new Date(candles[i].ts).toISOString().slice(0, 10);
      break;
    }
  }

  const fmt = (ts: number) => new Date(ts).toISOString().slice(0, 10);

  return {
    token,
    preEventStart: fmt(candles[Math.max(0, maxRetIdx - 35)].ts),
    preEventEnd: fmt(candles[Math.max(0, maxRetIdx - 8)].ts),
    breakoutDate: fmt(candles[maxRetIdx].ts),
    accelerationStart: fmt(candles[Math.max(0, maxRetIdx - 5)].ts),
    accelerationEnd: fmt(candles[Math.min(n - 1, maxRetIdx + 3)].ts),
    localPeakDate: fmt(candles[peakIdx].ts),
    postPeakStart: fmt(candles[peakIdx].ts),
    postPeakEnd: fmt(candles[Math.min(n - 1, peakIdx + 14)].ts),
    crashDate,
    cooldownEnd: crashDate ? fmt(candles[Math.min(n - 1, peakIdx + 30)].ts) : null,
    maxReturn7d: maxRet7d,
    maxReturn14d: maxRet14d,
    maxReturn30d: maxRet30d,
    maxDrawdownAfterPeak: maxDd,
    dataQuality: candles.length >= 60 ? "GOOD" : candles.length >= 30 ? "ADEQUATE" : "LOW",
    notes: "",
  };
}

async function main() {
  console.log("=== Event Window Detector ===\n");
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const allEvents: EventWindow[] = [];

  for (const token of STUDY_TOKENS) {
    console.log(`${token}: loading candles...`);
    const candles = loadCandles(token);
    console.log(`  ${candles.length} daily candles`);

    if (candles.length < 30) {
      console.log(`  DATA_INSUFFICIENT — need >= 30 daily candles\n`);
      continue;
    }

    const event = detectEventWindows(token, candles);
    if (!event) { console.log(`  No clear event window detected.\n`); continue; }

    allEvents.push(event);
    console.log(`  Breakout: ${event.breakoutDate} | Peak: ${event.localPeakDate} | Crash: ${event.crashDate || "none"}`);
    console.log(`  Max 7d return: ${(event.maxReturn7d*100).toFixed(0)}% | Max DD after peak: ${(event.maxDrawdownAfterPeak*100).toFixed(0)}%\n`);

    writeFileSync(join(OUT_DIR, `${token}_event_windows.json`), JSON.stringify(event, null, 2));
  }

  // Summary
  console.log(`=== Detected ${allEvents.length} event windows ===\n`);
  for (const e of allEvents) {
    console.log(`${e.token}: breakout=${e.breakoutDate} peak=${e.localPeakDate} 7d=${(e.maxReturn7d*100).toFixed(0)}% dd=${(e.maxDrawdownAfterPeak*100).toFixed(0)}%`);
  }

  writeFileSync(join(OUT_DIR, "all_event_windows.json"), JSON.stringify(allEvents, null, 2));
}

main().catch(console.error);
