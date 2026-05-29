// Detect bot networks by tracing DEX trader funding sources
// Uses Moralis API to check if multiple "retail" addresses share the same funding wallet

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fetchCompatWithFallback as fetch } from "../../../utils/http.js";

const MORALIS_KEY = process.env.MORALIS_API_KEY || "";
const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";
const LAB_CONTRACT = "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A";
const DEX_POOL = "0x085f29091ee8a818ede960a89bd578fe4ac8e824"; // Uniswap BSC pool
const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");

async function moralisGet(endpoint: string): Promise<any> {
  const r = await fetch(`${MORALIS_BASE}${endpoint}`, {
    headers: { "X-API-Key": MORALIS_KEY, "Accept": "application/json" }
  });
  if (!r.ok) throw new Error(`Moralis ${r.status}`);
  return r.json();
}

interface Transfer {
  from: string; to: string; value: number; hash: string; time: string;
  fromEntity?: string; toEntity?: string;
}

async function main() {
  console.log("=== LAB Bot Network Detector ===\n");
  if (!MORALIS_KEY) { console.log("MORALIS_API_KEY not set"); return; }

  // ── Step 1: Collect recent DEX pool transfers ──
  console.log("Step 1: Fetching recent DEX transfers...");
  let allTransfers: Transfer[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 5; page++) {
    const url = `/erc20/${LAB_CONTRACT}/transfers?chain=bsc&limit=100&order=DESC${cursor ? `&cursor=${cursor}` : ""}`;
    const data = await moralisGet(url);
    const results = data.result || [];
    cursor = data.cursor;

    for (const t of results) {
      const from = t.from_address?.toLowerCase();
      const to = t.to_address?.toLowerCase();
      const isDexTrade = from === DEX_POOL.toLowerCase() || to === DEX_POOL.toLowerCase();
      if (isDexTrade) {
        allTransfers.push({
          from, to,
          value: parseFloat(t.value_decimal || "0"),
          hash: t.transaction_hash,
          time: t.block_timestamp,
          fromEntity: t.from_address_entity || t.from_address_label || undefined,
          toEntity: t.to_address_entity || t.to_address_label || undefined,
        });
      }
    }
    if (results.length < 100) break;
  }

  console.log(`  DEX trades found: ${allTransfers.length}`);

  // Extract unique trader addresses (non-pool)
  const traders = new Set<string>();
  for (const t of allTransfers) {
    if (t.from !== DEX_POOL.toLowerCase()) traders.add(t.from);
    if (t.to !== DEX_POOL.toLowerCase()) traders.add(t.to);
  }
  console.log(`  Unique traders: ${traders.size}`);

  // ── Step 2: Classify trade sizes ──
  const sizes = allTransfers.map(t => t.value).sort((a, b) => b - a);
  const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  const largeThreshold = avg * 5;
  const smallTrades = sizes.filter(s => s < avg * 0.5);
  const largeTrades = sizes.filter(s => s > largeThreshold);

  console.log(`\nStep 2: Trade size distribution:`);
  console.log(`  Total trades: ${sizes.length}`);
  console.log(`  Average: $${avg.toFixed(0)}`);
  console.log(`  Median: $${sizes[Math.floor(sizes.length / 2)].toFixed(0)}`);
  console.log(`  Max: $${sizes[0].toFixed(0)} | Min: $${sizes[sizes.length - 1].toFixed(4)}`);
  console.log(`  Small (<$${ (avg*0.5).toFixed(0) }): ${smallTrades.length} (${(smallTrades.length/sizes.length*100).toFixed(0)}%)`);
  console.log(`  Large (>$${largeThreshold.toFixed(0)}): ${largeTrades.length} (${(largeTrades.length/sizes.length*100).toFixed(0)}%)`);

  // ── Step 3: Check entities ──
  const entities = new Set<string>();
  for (const t of allTransfers) {
    if (t.fromEntity) entities.add(t.fromEntity);
    if (t.toEntity) entities.add(t.toEntity);
  }
  console.log(`\nStep 3: Known entities in DEX trades:`);
  const entityArr = [...entities].filter(Boolean);
  console.log(`  ${entityArr.length > 0 ? entityArr.join(", ") : "None labeled"}`);
  if (entityArr.length === 0) {
    console.log("  ⚠️ No entity labels → all traders are unknown addresses");
  }

  // ── Step 4: Trace top traders' funding sources ──
  console.log(`\nStep 4: Tracing funding sources for top traders...`);
  const traderVolumes: Map<string, number> = new Map();
  for (const t of allTransfers) {
    const trader = t.from !== DEX_POOL.toLowerCase() ? t.from : t.to;
    traderVolumes.set(trader, (traderVolumes.get(trader) || 0) + t.value);
  }
  const topTraders = [...traderVolumes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // For each top trader, get all their transfers (not just DEX)
  const fundingMap: Map<string, string[]> = new Map();
  for (const [addr, vol] of topTraders) {
    try {
      const data = await moralisGet(`/erc20/${LAB_CONTRACT}/transfers?chain=bsc&limit=5&order=ASC&wallet_addresses=${addr}`);
      const results = data.result || [];
      const funders = results
        .map((t: any) => t.from_address)
        .filter((f: unknown): f is string => typeof f === "string" && f.length > 0);
      const uniqueFunders = [...new Set<string>(funders)];
      fundingMap.set(addr, uniqueFunders);
      console.log(`  ${addr.slice(0,10)}... ($${vol.toFixed(0)}) — 资金来源: ${uniqueFunders.length}个地址`);
      for (const f of uniqueFunders.slice(0, 3)) {
        // Check if funder is labeled
        const funderTransfers = results.filter((t: any) => t.from_address === f);
        const entity = funderTransfers[0]?.from_address_entity || funderTransfers[0]?.from_address_label;
        console.log(`    ← ${f.slice(0,10)}... ${entity ? `[${entity}]` : "[未知]"}`);
      }
    } catch {
      console.log(`  ${addr.slice(0,10)}... ($${vol.toFixed(0)}) — 查询失败`);
    }
    await new Promise(r => setTimeout(r, 300)); // Rate limit
  }

  // ── Step 5: Check for shared funding sources ──
  console.log(`\nStep 5: Shared funding source analysis...`);
  const funderToTraders: Map<string, string[]> = new Map();
  for (const [trader, funders] of fundingMap) {
    for (const funder of funders) {
      const list = funderToTraders.get(funder) || [];
      list.push(trader);
      funderToTraders.set(funder, list);
    }
  }

  let botNetworkFound = false;
  for (const [funder, fundedTraders] of funderToTraders) {
    if (fundedTraders.length >= 2) {
      botNetworkFound = true;
      console.log(`  ⚠️ 钱包 ${funder.slice(0,10)}... 向 ${fundedTraders.length}个DEX交易地址提供过资金!`);
      console.log(`     这些地址可能是同一实体的Bot网络`);
    }
  }

  if (!botNetworkFound) {
    console.log("  ✅ 未发现共享资金来源——这些DEX交易地址似乎是独立的");
  }

  // ── Summary ──
  console.log(`\n── 结论 ──`);
  console.log(`DEX交易均额: $${avg.toFixed(0)} | 中位数: $${sizes[Math.floor(sizes.length/2)].toFixed(0)}`);
  console.log(`大额交易(>$${largeThreshold.toFixed(0)}): ${largeTrades.length}/${sizes.length}`);
  console.log(`已知实体: ${entityArr.length > 0 ? entityArr.join(", ") : "无——全部匿名"}`);
  console.log(`Bot网络: ${botNetworkFound ? "发现!" : "未发现（在${topTraders.length}个样本中）"}`);
}

main().catch(console.error);
