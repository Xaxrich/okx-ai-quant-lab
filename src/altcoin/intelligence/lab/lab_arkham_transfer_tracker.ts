import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { arkhamGet, isArkhamConfigured } from "../arkham/arkham_client.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const SNAP_DIR = join(OUT_DIR, "transfer_snapshots");
const LAB_CONTRACT = "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A";

interface TransferEvent {
  time: string;
  from: string;
  to: string;
  fromEntity: string | null;
  toEntity: string | null;
  fromEntityType: string | null;
  toEntityType: string | null;
  valueUSD: number;
  tokenValue: number;
}

interface TransferSnapshot {
  timestamp: string;
  hoursCovered: number;
  totalTransfers: number;
  totalVolumeUSD: number;
  cexInflowUSD: number;
  cexOutflowUSD: number;
  cexNetflowUSD: number;
  whaleTransfers: TransferEvent[];
  topInflows: TransferEvent[];
  topOutflows: TransferEvent[];
  summary: string;
}

// ── Fetch recent transfers ──
async function fetchTransfers(hoursBack: number = 6): Promise<TransferEvent[]> {
  if (!isArkhamConfigured()) return [];

  const now = Math.floor(Date.now() / 1000);
  const timeGte = now - hoursBack * 3600;

  try {
    // Use the simple transfer histogram first (FREE endpoint)
    const r = await arkhamGet(
      `/transfers/histogram/simple?chains=bsc&tokens=${LAB_CONTRACT}&timeGte=${timeGte}&timeLte=${now}`,
      { token: "LAB-transfers", cacheTtlHours: 0.5 }
    );

    // Also try the full transfers endpoint
    const r2 = await arkhamGet(
      `/transfers?chains=bsc&tokens=${LAB_CONTRACT}&timeGte=${timeGte}&timeLte=${now}&limit=50&flow=all`,
      { token: "LAB-transfers-full", allowHeavyOverride: true, cacheTtlHours: 0.5 }
    );

    const transfers: TransferEvent[] = [];

    // Parse full transfers if available
    if (r2.ok && r2.data) {
      const data = r2.data as any;
      const items = Array.isArray(data) ? data : data?.transfers || data?.data || [];
      for (const t of items) {
        const fromAddr = t.fromAddress?.address || t.from || "?";
        const toAddr = t.toAddress?.address || t.to || "?";
        const fromEnt = t.fromAddress?.arkhamEntity;
        const toEnt = t.toAddress?.arkhamEntity;
        transfers.push({
          time: t.time || t.timestamp || new Date().toISOString(),
          from: fromAddr,
          to: toAddr,
          fromEntity: fromEnt?.name || null,
          toEntity: toEnt?.name || null,
          fromEntityType: fromEnt?.type || null,
          toEntityType: toEnt?.type || null,
          valueUSD: parseFloat(t.historicalUSD || t.usd || "0"),
          tokenValue: parseFloat(t.unitValue || t.value || "0"),
        });
      }
    }

    return transfers;
  } catch { return []; }
}

// ── Main ──
async function main() {
  console.log("=== LAB Arkham Transfer Tracker ===\n");
  if (!existsSync(SNAP_DIR)) mkdirSync(SNAP_DIR, { recursive: true });

  if (!isArkhamConfigured()) {
    console.log("Arkham API not configured. Checking for cached data...");
    // Try reading latest snapshot
    try {
      const { readdirSync } = await import("fs");
      const files = readdirSync(SNAP_DIR).filter(f => f.startsWith("transfers_") && f.endsWith(".json")).sort();
      if (files.length > 0) {
        const latest = JSON.parse(readFileSync(join(SNAP_DIR, files[files.length - 1]), "utf-8"));
        console.log(`Latest cached snapshot: ${latest.timestamp} | ${latest.totalTransfers} transfers | Netflow $${(latest.cexNetflowUSD/1e3).toFixed(0)}K`);
        return;
      }
    } catch { /* */ }
    console.log("No cached data. Skipping.");
    return;
  }

  console.log("Fetching transfers (last 6h)...");
  const transfers = await fetchTransfers(6);

  if (transfers.length === 0) {
    console.log("No transfers found in the last 6 hours.");
    return;
  }

  // ── Analysis ──
  const CEX_NAMES = new Set(["binance", "bybit", "bitget", "kucoin", "gate", "okx", "mexc", "gate-io"]);
  function isCexEntity(name: string | null, type: string | null): boolean {
    if (!name && !type) return false;
    if (type?.toLowerCase() === "cex") return true;
    if (name && CEX_NAMES.has(name.toLowerCase())) return true;
    return false;
  }

  let cexInflow = 0, cexOutflow = 0;
  const whaleThreshold = 50000; // $50K minimum for whale transfer

  for (const t of transfers) {
    const toCex = isCexEntity(t.toEntity, t.toEntityType);
    const fromCex = isCexEntity(t.fromEntity, t.fromEntityType);
    if (toCex && !fromCex) cexInflow += t.valueUSD;   // Whale → CEX = potential sell
    if (fromCex && !toCex) cexOutflow += t.valueUSD;   // CEX → Whale = potential buy/accumulation
  }

  const whaleTransfers = transfers
    .filter(t => t.valueUSD >= whaleThreshold)
    .sort((a, b) => b.valueUSD - a.valueUSD);

  const topInflows = transfers
    .filter(t => isCexEntity(t.toEntity, t.toEntityType) && !isCexEntity(t.fromEntity, t.fromEntityType))
    .sort((a, b) => b.valueUSD - a.valueUSD)
    .slice(0, 10);

  const topOutflows = transfers
    .filter(t => isCexEntity(t.fromEntity, t.fromEntityType) && !isCexEntity(t.toEntity, t.toEntityType))
    .sort((a, b) => b.valueUSD - a.valueUSD)
    .slice(0, 10);

  const netflow = cexInflow - cexOutflow;

  // Build summary
  let summary = "";
  if (netflow > 1e6) {
    summary = `⚠ 鲸鱼向CEX净流入 $${(netflow/1e6).toFixed(1)}M — 潜在卖压`;
  } else if (netflow < -1e6) {
    summary = `✅ 鲸鱼从CEX净流出 $${(Math.abs(netflow)/1e6).toFixed(1)}M — 潜在吸筹`;
  } else if (netflow > 0) {
    summary = `轻度流入 $${(netflow/1e3).toFixed(0)}K`;
  } else if (netflow < 0) {
    summary = `轻度流出 $${(Math.abs(netflow)/1e3).toFixed(0)}K`;
  } else {
    summary = "无显著CEX净流";
  }

  const snapshot: TransferSnapshot = {
    timestamp: new Date().toISOString(),
    hoursCovered: 6,
    totalTransfers: transfers.length,
    totalVolumeUSD: transfers.reduce((s, t) => s + t.valueUSD, 0),
    cexInflowUSD: cexInflow,
    cexOutflowUSD: cexOutflow,
    cexNetflowUSD: netflow,
    whaleTransfers: whaleTransfers.slice(0, 20),
    topInflows,
    topOutflows,
    summary,
  };

  // Save
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const snapPath = join(SNAP_DIR, `transfers_${ts}.json`);
  writeFileSync(snapPath, JSON.stringify(snapshot, null, 2));

  // Console
  console.log(`\n── 转账追踪结果 ──`);
  console.log(`总转账: ${transfers.length} | 总金额: $${(snapshot.totalVolumeUSD/1e6).toFixed(2)}M`);
  console.log(`CEX流入: $${(cexInflow/1e3).toFixed(0)}K | CEX流出: $${(cexOutflow/1e3).toFixed(0)}K | 净流: $${(netflow/1e3).toFixed(0)}K`);
  console.log(`鲸鱼级转账 (>$50K): ${whaleTransfers.length}笔`);
  console.log(`判断: ${summary}`);

  if (topInflows.length > 0) {
    console.log(`\n── 最大CEX流入 (潜在卖压) ──`);
    topInflows.slice(0, 5).forEach(t => {
      const from = t.fromEntity || t.from.slice(0, 8);
      const to = t.toEntity || t.to.slice(0, 8);
      console.log(`  ${from} → ${to}: $${(t.valueUSD/1e3).toFixed(0)}K`);
    });
  }

  if (topOutflows.length > 0) {
    console.log(`\n── 最大CEX流出 (潜在吸筹) ──`);
    topOutflows.slice(0, 5).forEach(t => {
      const from = t.fromEntity || t.from.slice(0, 8);
      const to = t.toEntity || t.to.slice(0, 8);
      console.log(`  ${from} → ${to}: $${(t.valueUSD/1e3).toFixed(0)}K`);
    });
  }
}

main().catch(console.error);
