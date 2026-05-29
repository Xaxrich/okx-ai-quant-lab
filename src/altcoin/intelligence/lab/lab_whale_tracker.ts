import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { arkhamGet, isArkhamConfigured } from "../arkham/arkham_client.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const SNAPSHOT_DIR = join(OUT_DIR, "whale_snapshots");
const LAB_CONTRACT = "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A";

interface WhaleHolder {
  rank: number;
  address: string;
  entityName: string | null;
  entityType: string | null;
  label: string | null;
  pctOfCap: number;
  balance: string;
  balanceUsd: number;
  classification: "WHALE_CEX" | "WHALE_UNKNOWN" | "WHALE_TEAM_VC" | "DOLPHIN" | "FISH" | "RETAIL";
  isCex: boolean;
  isLabelled: boolean;
}

interface WhaleSnapshot {
  timestamp: string;
  token: string;
  totalHolders: number;
  labelledCount: number;
  unknownCount: number;
  cexCount: number;
  top1Share: number;
  top5Share: number;
  top10Share: number;
  topCexShare: number;
  topUnknownShare: number;
  cexTotalShare: number;
  unknownWhaleShare: number;
  holderConcentration: number;
  whaleList: WhaleHolder[];
  dumpPotential: {
    totalWhaleShare: number;
    whaleShareOnCex: number;
    whaleShareOffCex: number;
    estimatedDumpableUsd: number;
    marketCap: number;
    dumpRatio: number;
  };
}

// ── Classification (pct is fraction: 0.2 = 20%) ──
function classifyHolder(
  pct: number, entityType: string | null, hasLabel: boolean, isCex: boolean
): WhaleHolder["classification"] {
  if (isCex) return "WHALE_CEX";
  if (pct >= 0.10) return "WHALE_TEAM_VC";
  if (pct >= 0.05) return hasLabel ? "WHALE_TEAM_VC" : "WHALE_UNKNOWN";
  if (pct >= 0.005) return "DOLPHIN";
  if (pct >= 0.001) return "FISH";
  return "RETAIL";
}

// ── Fetch current holders ──
async function fetchHolders(): Promise<WhaleHolder[]> {
  const holders: WhaleHolder[] = [];
  if (!isArkhamConfigured()) return holders;

  const r = await arkhamGet(`/token/holders/bsc/${LAB_CONTRACT}?limit=20`, { token: "LAB" });
  if (!r.ok || !r.data) return holders;

  const data = r.data as any;
  const topHolders = data?.addressTopHolders || {};

  for (const [, list] of Object.entries(topHolders)) {
    const items = list as any[];
    for (let i = 0; i < items.length; i++) {
      const h = items[i];
      const addr = h.address?.address || "?";
      const entity = h.address?.arkhamEntity;
      const labelObj = h.address?.arkhamLabel;
      const entityName = entity?.name || null;
      const entityType = entity?.type || null;
      const label = labelObj?.name || null;
      const pct = parseFloat(h.pctOfCap) || 0;
      const balance = String(h.balance || "0");
      const balanceUsd = parseFloat(h.usd || "0");
      const isCex = (entityType || "").toLowerCase() === "cex";
      const hasLabel = !!entity || !!labelObj;

      holders.push({
        rank: i + 1,
        address: addr,
        entityName,
        entityType,
        label,
        pctOfCap: pct,
        balance,
        balanceUsd,
        classification: classifyHolder(pct, entityType, hasLabel, isCex),
        isCex,
        isLabelled: hasLabel,
      });
    }
  }
  return holders;
}

// ── Compare snapshots ──
function compareSnapshots(prev: WhaleSnapshot, curr: WhaleSnapshot): string[] {
  const alerts: string[] = [];

  // Top holder share changes
  if (Math.abs(curr.top1Share - prev.top1Share) > 0.01) {
    alerts.push(`Top1持股从${(prev.top1Share * 100).toFixed(1)}%→${(curr.top1Share * 100).toFixed(1)}%`);
  }
  if (Math.abs(curr.top5Share - prev.top5Share) > 0.02) {
    const dir = curr.top5Share > prev.top5Share ? "集中" : "分散";
    alerts.push(`Top5持股${dir}: ${(prev.top5Share * 100).toFixed(1)}%→${(curr.top5Share * 100).toFixed(1)}%`);
  }

  // CEX share changes (whales moving to CEX = sell pressure)
  if (Math.abs(curr.cexTotalShare - prev.cexTotalShare) > 0.01) {
    const dir = curr.cexTotalShare > prev.cexTotalShare ? "流入CEX(潜在卖压)" : "流出CEX(潜在吸筹)";
    alerts.push(`CEX持仓${dir}: ${(prev.cexTotalShare * 100).toFixed(1)}%→${(curr.cexTotalShare * 100).toFixed(1)}%`);
  }

  // Individual whale changes
  for (const cw of curr.whaleList) {
    const pw = prev.whaleList.find(w => w.address === cw.address);
    if (pw && Math.abs(cw.pctOfCap - pw.pctOfCap) > 0.005) {
      const dir = cw.pctOfCap > pw.pctOfCap ? "增持" : "减持";
      const id = cw.entityName || cw.address.slice(0, 8);
      alerts.push(`${id}: ${dir} ${(Math.abs(cw.pctOfCap - pw.pctOfCap) * 100).toFixed(1)}%`);
    }
  }

  // New whales / exiting whales (whale = >0.5% supply)
  const prevAddrs = new Set(prev.whaleList.filter(w => w.pctOfCap >= 0.005).map(w => w.address));
  const currAddrs = new Set(curr.whaleList.filter(w => w.pctOfCap >= 0.005).map(w => w.address));
  const newWhales = [...currAddrs].filter(a => !prevAddrs.has(a));
  const exited = [...prevAddrs].filter(a => !currAddrs.has(a));
  if (newWhales.length > 0) alerts.push(`新增鲸鱼地址: ${newWhales.length}个`);
  if (exited.length > 0) alerts.push(`退出鲸鱼级别: ${exited.length}个地址`);

  return alerts;
}

// ── Main ──
async function main() {
  console.log("=== LAB Whale Tracker ===\n");
  if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });

  // Fetch current
  console.log("Fetching Arkham holders...");
  const holders = await fetchHolders();

  if (holders.length === 0) {
    // Try reading from parsed CSV as fallback
    console.log("Arkham fetch failed, trying cached data...");
    const parsedPath = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham", "parsed", "arkham_token_holders.csv");
    if (existsSync(parsedPath)) {
      const rows = readFileSync(parsedPath, "utf-8").trim().split("\n").slice(1);
      for (const row of rows) {
        const cols = row.split(",");
        if (cols[0] !== "LAB") continue;
        const addr = cols[2] || "";
        // CSV: token(0),chain(1),addr(2),entity_id(3),entity_name(4),entity_type(5),label(6),balance(7),balance_usd(8),pct(9)
        const entityName = cols[4] || null;
        const entityType = cols[5] || null;
        const label = cols[6] || null;
        const balance = cols[7] || "0";
        const balanceUsd = parseFloat(cols[8] || "0");
        const pct = parseFloat(cols[9] || "0");

        const isCex = (entityType || "").toLowerCase() === "cex";
        const hasLabel = !!entityName || !!label;

        holders.push({
          rank: holders.length + 1,
          address: addr,
          entityName: entityName || null,
          entityType: entityType || null,
          label: label || null,
          pctOfCap: pct,
          balance,
          balanceUsd,
          classification: classifyHolder(pct, entityType, hasLabel || !!label, isCex),
          isCex,
          isLabelled: hasLabel || !!label,
        });
      }
    }
  }

  if (holders.length === 0) {
    console.log("No holder data available.");
    return;
  }

  // Compute aggregate metrics
  const labelled = holders.filter(h => h.isLabelled);
  const cexHolders = holders.filter(h => h.isCex);
  const unknownWhales = holders.filter(h => h.classification === "WHALE_UNKNOWN" || h.classification === "WHALE_TEAM_VC");

  const top1 = holders[0]?.pctOfCap || 0;
  const top5 = holders.slice(0, 5).reduce((s, h) => s + h.pctOfCap, 0);
  const top10 = holders.slice(0, 10).reduce((s, h) => s + h.pctOfCap, 0);
  const cexShare = cexHolders.reduce((s, h) => s + h.pctOfCap, 0);
  const unknownWhaleShare = unknownWhales.reduce((s, h) => s + h.pctOfCap, 0);

  // Dump potential: non-CEX whale holdings that could be sold
  const whaleOffCex = unknownWhales.filter(h => !h.isCex);
  const whaleOffCexShare = whaleOffCex.reduce((s, h) => s + h.pctOfCap, 0);

  // Estimate market cap from fast-watch price and top holder
  let mcap = 0;
  let price = 0;
  const fwPath = join(OUT_DIR, "lab_fast_watch_v2.csv");
  if (existsSync(fwPath)) {
    const lines = readFileSync(fwPath, "utf-8").trim().split("\n");
    if (lines.length > 1) {
      const lastRow = lines[lines.length - 1].split(",");
      const header = lines[0].split(",");
      const priceIdx = header.indexOf("price_usd");
      if (priceIdx >= 0) price = parseFloat(lastRow[priceIdx] || "0");
    }
  }
  // Estimate MCap: if top holder has valid balanceUsd, use that; otherwise estimate from price
  if (holders[0]?.balanceUsd > 0 && holders[0]?.pctOfCap > 0) {
    mcap = holders[0].balanceUsd / holders[0].pctOfCap;
  } else if (price > 0 && holders[0]?.pctOfCap > 0) {
    // Rough estimate: assume total supply ≈ top holder balance / pct
    const topBalance = parseFloat(holders[0].balance || "0");
    if (topBalance > 0) {
      const estSupply = topBalance / holders[0].pctOfCap;
      mcap = estSupply * price;
    }
  }
  // Update holder USD balances if they were 0
  if (price > 0) {
    for (const h of holders) {
      if (h.balanceUsd === 0) {
        const bal = parseFloat(h.balance || "0");
        if (bal > 0) h.balanceUsd = bal * price;
      }
    }
  }

  const dumpableUsd = mcap * whaleOffCexShare;

  const snapshot: WhaleSnapshot = {
    timestamp: new Date().toISOString(),
    token: "LAB",
    totalHolders: holders.length,
    labelledCount: labelled.length,
    unknownCount: holders.length - labelled.length,
    cexCount: cexHolders.length,
    top1Share: top1,
    top5Share: top5,
    top10Share: top10,
    topCexShare: cexHolders[0]?.pctOfCap || 0,
    topUnknownShare: unknownWhales[0]?.pctOfCap || 0,
    cexTotalShare: cexShare,
    unknownWhaleShare,
    holderConcentration: top5, // HHI-like: top5 share as concentration
    whaleList: holders,
    dumpPotential: {
      totalWhaleShare: cexShare + unknownWhaleShare,
      whaleShareOnCex: cexShare,
      whaleShareOffCex: whaleOffCexShare,
      estimatedDumpableUsd: dumpableUsd,
      marketCap: mcap,
      dumpRatio: whaleOffCexShare > 0 ? cexShare / whaleOffCexShare : 0,
    },
  };

  // Write snapshot
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const snapPath = join(SNAPSHOT_DIR, `whale_${ts}.json`);
  writeFileSync(snapPath, JSON.stringify(snapshot, null, 2), "utf-8");

  // Compare with previous
  const { readdirSync } = await import("fs");
  const files = existsSync(SNAPSHOT_DIR) ? readdirSync(SNAPSHOT_DIR).filter(f => f.startsWith("whale_") && f.endsWith(".json")).sort() : [];
  let changeAlerts: string[] = [];
  if (files.length >= 2) {
    const prevFile = files[files.length - 2];
    try {
      const prevData = JSON.parse(readFileSync(join(SNAPSHOT_DIR, prevFile), "utf-8")) as WhaleSnapshot;
      changeAlerts = compareSnapshots(prevData, snapshot);
    } catch { /* */ }
  }

  // Console output
  console.log(`\n── LAB 鲸鱼情报 ──`);
  console.log(`快照: ${snapshot.timestamp.slice(0, 19).replace("T", " ")} (北京)`);
  console.log(`持币者: ${holders.length} | 已标记 ${labelled.length}/${holders.length} | CEX ${cexHolders.length}`);
  console.log(`\n持仓集中度:`);
  console.log(`  Top1: ${(top1 * 100).toFixed(1)}% | Top5: ${(top5 * 100).toFixed(1)}% | Top10: ${(top10 * 100).toFixed(1)}%`);
  console.log(`  CEX合计: ${(cexShare * 100).toFixed(1)}% | 未知鲸鱼: ${(unknownWhaleShare * 100).toFixed(1)}%`);

  console.log(`\n── 巨鲸明细 ──`);
  for (const h of holders) {
    if (h.pctOfCap < 0.001) break;
    const id = h.entityName || h.label || h.address.slice(0, 10);
    const type = h.isCex ? "CEX" : h.classification === "WHALE_TEAM_VC" ? "TEAM/VC" : h.classification === "WHALE_UNKNOWN" ? "未知巨鲸" : h.classification;
    console.log(`  ${h.rank}. ${id} | ${(h.pctOfCap * 100).toFixed(2)}% | $${(h.balanceUsd / 1e6).toFixed(1)}M | ${type}`);
  }

  console.log(`\n── 抛压评估 ──`);
  console.log(`  估算市值: $${(mcap / 1e6).toFixed(1)}M`);
  console.log(`  非CEX鲸鱼持仓: ${(whaleOffCexShare * 100).toFixed(1)}% (≈$${(dumpableUsd / 1e6).toFixed(1)}M)`);
  console.log(`  CEX/非CEX比: ${snapshot.dumpPotential.dumpRatio.toFixed(2)} (${snapshot.dumpPotential.dumpRatio > 1 ? 'CEX主导' : '非CEX主导'})`);
  console.log(`  注: 非CEX鲸鱼=潜在抛压源(尚未转入交易所)`);

  if (changeAlerts.length > 0) {
    console.log(`\n── 变化警报 ──`);
    changeAlerts.forEach(a => console.log(`  ⚠ ${a}`));
  }

  // Write summary for commander consumption
  const summary = [
    `【LAB 鲸鱼追踪｜${new Date().toISOString().slice(0, 19).replace("T", " ")} 北京】`,
    "",
    `持币集中度: Top1 ${(top1 * 100).toFixed(1)}% | Top5 ${(top5 * 100).toFixed(1)}% | Top10 ${(top10 * 100).toFixed(1)}%`,
    `已标记: ${labelled.length}/${holders.length} | CEX: ${cexHolders.length}个(${(cexShare * 100).toFixed(1)}%) | 未知鲸鱼: ${(unknownWhaleShare * 100).toFixed(1)}%`,
    "",
    `巨鲸排名:`,
    ...holders.filter(h => h.pctOfCap >= 0.005).map(h => {
      const id = h.entityName || h.label || h.address.slice(0, 10);
      return `  ${h.rank}. ${id} | ${(h.pctOfCap * 100).toFixed(2)}% | ${h.classification}`;
    }),
    "",
    `抛压评估:`,
    `  非CEX鲸鱼可抛售: ≈$${(dumpableUsd / 1e6).toFixed(1)}M (${(whaleOffCexShare * 100).toFixed(1)}%)`,
    `  CEX持仓: ${(cexShare * 100).toFixed(1)}% (已在交易所→随时可卖)`,
    `  结构: ${snapshot.dumpPotential.dumpRatio > 1 ? 'CEX持仓>非CEX，流动性抛压为主' : '非CEX持仓>CEX，潜在抛压更大'}`,
    "",
    changeAlerts.length > 0 ? `变化:\n${changeAlerts.map(a => `  - ${a}`).join("\n")}` : "较上次快照无显著变化",
    "",
    `不构成交易建议。`,
  ].join("\n");

  writeFileSync(join(OUT_DIR, "whale_intel_latest.txt"), summary, "utf-8");
  console.log(`\n摘要已写入: ${OUT_DIR}/whale_intel_latest.txt`);
  console.log(`快照已保存: ${snapPath}`);
}

main().catch(console.error);
