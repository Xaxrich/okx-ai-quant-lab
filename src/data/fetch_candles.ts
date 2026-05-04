import { okxJson } from "../connectors/okx_cli.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const RAW_DIR = join(import.meta.dirname, "..", "..", "data", "raw");
const PROCESSED_DIR = join(import.meta.dirname, "..", "..", "data", "processed");

// OKX API returns candles as arrays: [ts, o, h, l, c, vol, volCcy, volCcy2, confirm]
export type RawCandle = string[];

export interface NormalizedCandle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volumeCcy: number;
}

export async function fetchCandles(
  instId: string,
  bar: string = "1H",
  limit: number = 100
): Promise<RawCandle[]> {
  const result = await okxJson([
    "market",
    "candles",
    instId,
    "--bar",
    bar,
    "--limit",
    String(limit),
  ]);

  if (!result.ok) {
    throw new Error(`Failed to fetch candles for ${instId}/${bar}: ${result.stderr}`);
  }

  const data = result.data as RawCandle[];
  if (!Array.isArray(data)) {
    throw new Error(`Unexpected response format for ${instId}/${bar}`);
  }

  return data;
}

export function normalizeCandles(candles: RawCandle[]): NormalizedCandle[] {
  return candles
    .map((c) => ({
      ts: parseInt(c[0]),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
      volumeCcy: parseFloat(c[6]),
    }))
    .sort((a, b) => a.ts - b.ts);
}

export function candlesToCSV(candles: NormalizedCandle[]): string {
  const header = "ts,open,high,low,close,volume,volumeCcy";
  const rows = candles.map(
    (c) => `${c.ts},${c.open},${c.high},${c.low},${c.close},${c.volume},${c.volumeCcy}`
  );
  return [header, ...rows].join("\n");
}

export async function fetchAndSave(
  instId: string,
  bar: string = "1H",
  limit: number = 100
): Promise<NormalizedCandle[]> {
  const candles = await fetchCandles(instId, bar, limit);
  const normalized = normalizeCandles(candles);

  if (!existsSync(RAW_DIR)) mkdirSync(RAW_DIR, { recursive: true });
  if (!existsSync(PROCESSED_DIR)) mkdirSync(PROCESSED_DIR, { recursive: true });

  writeFileSync(
    join(RAW_DIR, `${instId}_${bar}.json`),
    JSON.stringify(candles, null, 2)
  );

  writeFileSync(
    join(PROCESSED_DIR, `${instId}_${bar}.csv`),
    candlesToCSV(normalized)
  );

  return normalized;
}

export async function fetchPaginated(
  instId: string,
  bar: string = "1H",
  targetCount: number = 1000,
  pageLimit: number = 100
): Promise<NormalizedCandle[]> {
  const allCandles: NormalizedCandle[] = [];
  let afterTs: number | undefined;

  const pages = Math.ceil(targetCount / pageLimit);

  for (let page = 0; page < pages; page++) {
    const args = [
      "market", "candles", instId,
      "--bar", bar,
      "--limit", String(pageLimit),
    ];
    if (afterTs) {
      args.push("--after", String(afterTs));
    }

    const result = await okxJson(args);

    if (!result.ok) {
      console.error(`  Page ${page + 1} failed: ${result.stderr}`);
      break;
    }

    const data = result.data as RawCandle[];
    if (!Array.isArray(data) || data.length === 0) break;

    const normalized = normalizeCandles(data);
    allCandles.push(...normalized);

    afterTs = normalized[0].ts;

    console.log(`  Page ${page + 1}: fetched ${data.length}, total ${allCandles.length}`);

    if (data.length < pageLimit) break;
  }

  // Deduplicate by timestamp
  const deduped = dedupByTs(allCandles);
  console.log(`  Deduped: ${deduped.length} unique candles`);

  return deduped;
}

function dedupByTs(candles: NormalizedCandle[]): NormalizedCandle[] {
  const seen = new Set<number>();
  const result: NormalizedCandle[] = [];
  for (const c of candles) {
    if (!seen.has(c.ts)) {
      seen.add(c.ts);
      result.push(c);
    }
  }
  return result.sort((a, b) => a.ts - b.ts);
}

async function main() {
  const instIds = (process.env.DEFAULT_INST_IDS || "BTC-USDT,ETH-USDT,SOL-USDT").split(",");
  const bars = (process.env.DEFAULT_BARS || "1H,4H,1D").split(",");
  const targetCount = parseInt(process.env.CANDLE_LIMIT || "1000");

  for (const instId of instIds) {
    for (const bar of bars) {
      try {
        console.log(`Fetching ${instId.trim()}/${bar.trim()} (target: ${targetCount})...`);
        const data = await fetchPaginated(instId.trim(), bar.trim(), targetCount);

        if (!existsSync(RAW_DIR)) mkdirSync(RAW_DIR, { recursive: true });
        if (!existsSync(PROCESSED_DIR)) mkdirSync(PROCESSED_DIR, { recursive: true });

        writeFileSync(
          join(RAW_DIR, `${instId.trim()}_${bar.trim()}.json`),
          JSON.stringify(data, null, 2)
        );
        writeFileSync(
          join(PROCESSED_DIR, `${instId.trim()}_${bar.trim()}.csv`),
          candlesToCSV(data)
        );

        console.log(`Saved ${instId.trim()}/${bar.trim()}: ${data.length} candles\n`);
      } catch (err: any) {
        console.error(`Failed ${instId.trim()}/${bar.trim()}: ${err.message}\n`);
      }
    }
  }
}

const isMain = process.argv[1]?.includes("fetch_candles");
if (isMain) main();
