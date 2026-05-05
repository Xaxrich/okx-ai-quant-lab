import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { arkhamGet, isArkhamConfigured } from "./arkham_client.js";
import { writeCsv } from "../../../utils/csv.js";
import { buildBudgetPlan, getRemainingHeavyBudget, estimateBatchCalls } from "./arkham_usage_budget.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "arkham");
const REGISTRY_PATH = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "metric_loop", "metric_registry.csv");

const CEX_NAMES = /binance|okx|coinbase|kucoin|bybit|gate|mexc|kraken|huobi|upbit|bitfinex|gemini/i;
const DEX_NAMES = /uniswap|pancake|sushi|curve|balancer|1inch|raydium|orca|jupiter|aerodrome/i;
const FUND_NAMES = /a16z|paradigm|pantera|multicoin|polychain|framework|dragonfly|sequoia|wintermute|jump|galaxy|amber/i;
const MM_NAMES = /wintermute|jump trading|amber group|dwf|gsr|b2c2|cumberland|flow traders|virtu/i;

function getDirection(fromType: string, fromName: string, toType: string, toName: string): string {
  const c = (t: string, n: string): string => {
    const tl = (t || "").toLowerCase(), nl = (n || "").toLowerCase();
    if (tl === "cex" || CEX_NAMES.test(nl)) return "CEX";
    if (tl === "dex" || DEX_NAMES.test(nl)) return "DEX";
    if (tl === "fund" || tl === "institution" || FUND_NAMES.test(nl)) return "FUND";
    if (tl === "market_maker" || tl === "marketmaker" || MM_NAMES.test(nl)) return "MARKET_MAKER";
    return tl || "UNKNOWN";
  };
  const tc = c(toType, toName), fc = c(fromType, fromName);
  if (tc === "CEX") return "TO_ARKHAM_LABELED_CEX_PROXY";
  if (fc === "CEX") return "FROM_ARKHAM_LABELED_CEX_PROXY";
  if (tc === "DEX") return "TO_ARKHAM_LABELED_DEX_PROXY";
  if (fc === "DEX") return "FROM_ARKHAM_LABELED_DEX_PROXY";
  if (tc === "MARKET_MAKER") return "TO_MARKET_MAKER_PROXY";
  if (fc === "MARKET_MAKER") return "FROM_MARKET_MAKER_PROXY";
  if (tc === "FUND") return "TO_FUND_OR_INSTITUTION_PROXY";
  if (fc === "FUND") return "FROM_FUND_OR_INSTITUTION_PROXY";
  if (fc !== "UNKNOWN" || tc !== "UNKNOWN") return "BETWEEN_LABELED_ENTITIES";
  return "BETWEEN_UNKNOWN_WALLETS";
}

function makeSegments(baseDate: string, peakDate: string): {id: string, start: string, end: string}[] {
  const b = new Date(baseDate), p = new Date(peakDate);
  const peakOffset = Math.round((p.getTime() - b.getTime()) / 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return [
    { id: "SEG_A", start: fmt(new Date(b.getTime() - 30*86400000)), end: fmt(new Date(b.getTime() - 15*86400000)) },
    { id: "SEG_B", start: fmt(new Date(b.getTime() - 14*86400000)), end: fmt(new Date(b.getTime() - 8*86400000)) },
    { id: "SEG_C", start: fmt(new Date(b.getTime() - 7*86400000)), end: fmt(new Date(b.getTime() - 1*86400000)) },
    { id: "SEG_D", start: fmt(new Date(b.getTime())), end: fmt(new Date(b.getTime() + 3*86400000)) },
    { id: "SEG_E", start: fmt(new Date(b.getTime() + (peakOffset-3)*86400000)), end: fmt(new Date(b.getTime() + (peakOffset+3)*86400000)) },
    { id: "SEG_F", start: fmt(new Date(b.getTime() + (peakOffset+4)*86400000)), end: fmt(new Date(b.getTime() + (peakOffset+7)*86400000)) },
  ];
}

async function fetchSegment(
  chain: string, addr: string, tGte: number, tLte: number,
  sortDir: string, maxPages: number, token: string
): Promise<{ rows: any[]; pages: number; apiBlocked: boolean }> {
  const all: any[] = [];
  let apiBlocked = false;
  for (let p = 0; p < maxPages; p++) {
    const q = `/transfers?chains=${chain}&tokens=${addr}&timeGte=${tGte}&timeLte=${tLte}&sortKey=time&sortDir=${sortDir}&limit=100&offset=${p * 100}&flow=all`;
    const r = await arkhamGet(q, { token, allowHeavyOverride: true, cacheTtlHours: 24 });
    if (r.status === "ARKHAM_DAILY_LIMIT") { apiBlocked = true; break; }
    if (!r.ok) break;
    const data = r.data as any;
    const rows = Array.isArray(data) ? data : (data?.transfers || []);
    if (rows.length === 0) break;
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return { rows: all, pages: Math.ceil(all.length / 100), apiBlocked };
}

const P0_CONFIGS = [
  { sym: "LAB", chain: "bsc", baseDate: "2026-04-23", peakDate: "2026-05-02" },
  { sym: "UB", chain: "bsc", baseDate: "2026-04-25", peakDate: "2026-05-02" },
  { sym: "BSB", chain: "ethereum", baseDate: "2026-04-25", peakDate: "2026-05-04" },
];

const CONTROLS = [
  { sym: "PEPE", chain: "ethereum", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", cgId: "pepe", group: "CONTROL", peakDate: "2026-04-29", baseDate: "2026-04-22" },
  { sym: "FLOKI", chain: "ethereum", contract: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e", cgId: "floki", group: "CONTROL", peakDate: "2026-04-29", baseDate: "2026-04-22" },
  { sym: "PENDLE", chain: "ethereum", contract: "0x808507121b80c02388fad14726482e061b8da827", cgId: "pendle", group: "P2", peakDate: "2026-05-04", baseDate: "2026-04-27" },
  { sym: "ONDO", chain: "ethereum", contract: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3", cgId: "ondo-finance", group: "P2", peakDate: "2026-05-04", baseDate: "2026-04-27" },
];

type BatchType = "pseudo" | "calendar-lab" | "calendar-ub" | "calendar-bsb";

function getBatchConfigs(batch: BatchType): { controls: typeof CONTROLS; p0: typeof P0_CONFIGS[0] | null; windowType: string } {
  if (batch === "pseudo") return { controls: CONTROLS, p0: null, windowType: "PSEUDO_EVENT" };
  if (batch === "calendar-lab") return { controls: CONTROLS, p0: P0_CONFIGS[0], windowType: "CALENDAR_MATCHED" };
  if (batch === "calendar-ub") return { controls: CONTROLS, p0: P0_CONFIGS[1], windowType: "CALENDAR_MATCHED" };
  if (batch === "calendar-bsb") return { controls: CONTROLS, p0: P0_CONFIGS[2], windowType: "CALENDAR_MATCHED" };
  return { controls: CONTROLS, p0: null, windowType: "PSEUDO_EVENT" };
}

async function main() {
  const batch = (process.argv.find(a => a.startsWith("--batch=")) || "--batch=pseudo").split("=")[1] as BatchType;
  const dryRun = process.argv.includes("--dry-run");

  console.log(`=== Arkham Control-Only Segmented Transfer Loop ===\n`);
  console.log(`Batch: ${batch} | Dry-run: ${dryRun}\n`);

  if (!isArkhamConfigured()) { console.log("NOT_CONFIGURED"); return; }

  for (const d of ["features", "analysis"]) { const p = join(OUT_DIR, d); if (!existsSync(p)) mkdirSync(p, { recursive: true }); }
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const { controls, p0, windowType } = getBatchConfigs(batch);
  const tokens = controls.length;
  const segments = 5; // A-E (F is future for most batches)
  const maxPagesPerDir = 3;
  const sortDirs = 2;
  const plannedCalls = estimateBatchCalls(tokens, segments, sortDirs, maxPagesPerDir);
  const budget = buildBudgetPlan(batch, tokens, segments, sortDirs, maxPagesPerDir);

  console.log(`Budget: used=${budget.heavyUsed}/${budget.heavyLimit}, planned=${plannedCalls}, remaining=${budget.heavyRemaining}, canRun=${budget.canRun}\n`);

  if (dryRun) {
    console.log("DRY-RUN: would extract control transfers for:");
    for (const c of controls) {
      const baseDate = p0 ? p0.baseDate : c.baseDate;
      const peakDate = p0 ? p0.peakDate : c.peakDate;
      const segs = makeSegments(baseDate, peakDate);
      console.log(`  ${c.sym} ${windowType} (${p0 ? p0.sym : c.sym}): ${segs.length} segments, ${plannedCalls / tokens} calls`);
    }
    console.log(`\nTotal planned heavy calls: ${plannedCalls}`);
    console.log(`Current heavy budget: ${budget.heavyRemaining} remaining`);
    console.log(budget.canRun ? "BUDGET_OK" : "BUDGET_INSUFFICIENT — run when quota resets");
    return;
  }

  if (!budget.canRun) {
    console.log("BUDGET_INSUFFICIENT — aborting extraction. Use --dry-run to preview.");
    // Write budget status report
    const budgetLines = ["# Arkham Budget Status", "", `Generated: ${new Date().toISOString()}`, "",
      `Batch: ${batch}`, `Heavy used: ${budget.heavyUsed}/${budget.heavyLimit}`,
      `Planned calls: ${plannedCalls}`, `Remaining: ${budget.heavyRemaining}`,
      "", "**BUDGET_INSUFFICIENT** — wait for daily quota reset."];
    writeFileSync(join(REPORTS_DIR, "arkham_budget_status.md"), budgetLines.join("\n"));
    return;
  }

  // ── Extraction ──
  console.log("── Extracting Control Transfers ──\n");
  const today = new Date().toISOString().slice(0, 10);
  const auditRows: string[][] = [["token","sample_group","window_type","matched_p0","segment","segment_start","segment_end","pages","rows","unique_tx","min_ts","max_ts","status","limitations"]];
  const allParsed: any[] = [];

  for (const c of controls) {
    const baseDate = p0 ? p0.baseDate : c.baseDate;
    const peakDate = p0 ? p0.peakDate : c.peakDate;
    const matchedP0 = p0 ? p0.sym : c.sym;
    const segs = makeSegments(baseDate, peakDate);

    for (const seg of segs) {
      const isFuture = seg.start > today || seg.end > today;
      if (isFuture) {
        auditRows.push([c.sym, c.group, windowType, matchedP0, seg.id, seg.start, seg.end, "0", "0", "0", "", "", "FUTURE_WINDOW_NOT_OBSERVABLE_YET", `Beyond ${today}`]);
        continue;
      }

      const chain = c.chain === "bsc" ? "bsc" : c.chain;
      const tGte = Math.floor(new Date(seg.start).getTime() / 1000);
      const tLte = Math.floor(new Date(seg.end).getTime() / 1000) + 86400;

      let apiBlocked = false;
      const segRows: any[] = [];

      for (const sortDir of ["asc", "desc"]) {
        if (apiBlocked) break;
        const { rows, apiBlocked: blocked } = await fetchSegment(chain, c.contract, tGte, tLte, sortDir, maxPagesPerDir, c.sym);
        if (blocked) { apiBlocked = true; break; }
        segRows.push(...rows);
      }

      if (apiBlocked) {
        auditRows.push([c.sym, c.group, windowType, matchedP0, seg.id, seg.start, seg.end, "0", "0", "0", "", "", "API_BLOCKED_BY_BUDGET", "Daily heavy limit reached"]);
        continue;
      }

      // Dedup
      const hashSet = new Set<string>();
      const deduped: any[] = [];
      for (const row of segRows) {
        const h = row.transactionHash || row.id || "";
        if (h && hashSet.has(h)) continue;
        if (h) hashSet.add(h);
        deduped.push(row);
      }

      const timestamps = deduped.map(r => r.blockTimestamp || "").filter(Boolean).sort();
      const status = deduped.length > 50 ? "SEGMENT_READY"
        : deduped.length > 0 ? "SEGMENT_PARTIAL"
        : "TRUE_EMPTY_WINDOW";

      auditRows.push([c.sym, c.group, windowType, matchedP0, seg.id, seg.start, seg.end, String(Math.ceil(segRows.length / 100)), String(deduped.length), String(hashSet.size), timestamps[0] || "", timestamps[timestamps.length-1] || "", status, ""]);

      // Parse
      for (const row of deduped) {
        const fromE = row.fromAddress?.arkhamEntity || {}, toE = row.toAddress?.arkhamEntity || {};
        allParsed.push({
          token: c.sym, sample_group: c.group, window_type: windowType, matched_p0: matchedP0, segment: seg.id,
          date: (row.blockTimestamp || "").slice(0, 10),
          from_name: fromE.name || "", from_type: fromE.type || "",
          to_name: toE.name || "", to_type: toE.type || "",
          usd: row.historicalUSD != null ? parseFloat(row.historicalUSD) : null,
          direction: getDirection(fromE.type || "", fromE.name || "", toE.type || "", toE.name || ""),
        });
      }
      console.log(`  ${c.sym} ${seg.id}: ${deduped.length} txns ${status}`);
    }
  }

  writeCsv(join(OUT_DIR, "analysis", "arkham_control_only_segmented_fetch_audit.csv"), auditRows);
  console.log(`\nControl parsed: ${allParsed.length}`);

  // ── Control Features ──
  console.log("\n── Control Features ──\n");
  const byKey = new Map<string, any[]>();
  for (const p of allParsed) {
    const key = `${p.token}|${p.window_type}|${p.matched_p0}|${p.segment}`;
    const list = byKey.get(key) || []; list.push(p); byKey.set(key, list);
  }

  const featRows: string[][] = [["token","sample_group","window_type","matched_p0","segment","segment_start","segment_end","unique_transfer_count","transfer_volume_usd","labeled_transfer_ratio","unknown_transfer_ratio","cex_proxy_transfer_count","cex_proxy_transfer_volume_usd","cex_proxy_netflow_usd","to_cex_proxy_volume_usd","from_cex_proxy_volume_usd","dex_proxy_transfer_count","dex_proxy_transfer_volume_usd","fund_or_institution_transfer_volume_usd","market_maker_proxy_transfer_volume_usd","top_entity_transfer_share","entity_transfer_concentration","segment_readiness","limitations"]];

  // Build segment date lookup from audit
  const segDates = new Map<string, { start: string; end: string }>();
  for (const a of auditRows.slice(1)) { segDates.set(`${a[0]}|${a[2]}|${a[3]}|${a[4]}`, { start: a[5], end: a[6] }); }

  for (const [key, txns] of byKey) {
    const sd = segDates.get(key) || { start: "", end: "" };
    const count = txns.length;
    const vol = txns.reduce((s: number, tx: any) => s + (tx.usd || 0), 0);
    const labeled = txns.filter((tx: any) => tx.from_name || tx.to_name).length;
    const lr = count > 0 ? labeled / count : 0;
    const cex = txns.filter((tx: any) => tx.direction.includes("CEX")).length;
    const cexVol = txns.filter((tx: any) => tx.direction.includes("CEX")).reduce((s: number, tx: any) => s + (tx.usd || 0), 0);
    const toCexVol = txns.filter((tx: any) => tx.direction.startsWith("TO_ARKHAM_LABELED_CEX")).reduce((s: number, tx: any) => s + (tx.usd || 0), 0);
    const fromCexVol = txns.filter((tx: any) => tx.direction.startsWith("FROM_ARKHAM_LABELED_CEX")).reduce((s: number, tx: any) => s + (tx.usd || 0), 0);
    const dex = txns.filter((tx: any) => tx.direction.includes("DEX")).length;
    const dexVol = txns.filter((tx: any) => tx.direction.includes("DEX")).reduce((s: number, tx: any) => s + (tx.usd || 0), 0);
    const fundVol = txns.filter((tx: any) => tx.direction.includes("FUND")).reduce((s: number, tx: any) => s + (tx.usd || 0), 0);
    const mmVol = txns.filter((tx: any) => tx.direction.includes("MARKET_MAKER")).reduce((s: number, tx: any) => s + (tx.usd || 0), 0);
    const entityVols = new Map<string, number>();
    for (const tx of txns) { for (const e of [{ n: tx.from_name }, { n: tx.to_name }]) { if (e.n) entityVols.set(e.n, (entityVols.get(e.n) || 0) + (tx.usd || 0)); } }
    const sorted = Array.from(entityVols.entries()).sort((a, b) => b[1] - a[1]);
    const labeledVol = Array.from(entityVols.values()).reduce((s, v) => s + v, 0);
    const topShare = labeledVol > 0 && sorted[0] ? sorted[0][1] / labeledVol : null;
    const hhi = labeledVol > 0 ? sorted.reduce((s, [, v]) => s + (v / labeledVol) ** 2, 0) : null;
    const [tok, wt, mp0, seg] = key.split("|");
    const readiness = count > 50 ? "SEGMENT_READY" : count > 0 ? "SEGMENT_PARTIAL" : "TRUE_EMPTY_WINDOW";

    featRows.push([tok, txns[0]?.sample_group || "", wt, mp0, seg, sd.start, sd.end, String(count), vol.toFixed(2), lr.toFixed(3), count > 0 ? ((count - labeled) / count).toFixed(3) : "1.000", String(cex), cexVol.toFixed(2), (toCexVol - fromCexVol).toFixed(2), toCexVol.toFixed(2), fromCexVol.toFixed(2), String(dex), dexVol.toFixed(2), fundVol.toFixed(2), mmVol.toFixed(2), topShare?.toFixed(3) || "", hhi?.toFixed(4) || "", readiness, ""]);
  }

  writeCsv(join(OUT_DIR, "features", "arkham_control_segmented_transfer_features.csv"), featRows);
  console.log(`Control features: ${featRows.length - 1} rows`);

  // ── Unified v3 ──
  console.log("\n── Unified v3 ──\n");
  const p0Path = join(OUT_DIR, "features", "arkham_segmented_transfer_entity_features.csv");
  const unifiedRows: string[][] = [featRows[0].map(h => h === "segment_readiness" ? "segment_readiness" : h)]; // reuse header, add source
  const uHeader = [...featRows[0], "source_file"];
  unifiedRows[0] = uHeader;

  if (existsSync(p0Path)) {
    const p0Lines = readFileSync(p0Path, "utf-8").split("\n");
    const p0H = p0Lines[0].split(",");
    for (const line of p0Lines.slice(1)) {
      if (!line.trim()) continue;
      const cols = line.split(",");
      const obj: any = {}; p0H.forEach((k, i) => { obj[k] = cols[i] || ""; });
      // Map to unified format
      unifiedRows.push([obj.token, obj.sample_group, "P0_EVENT", obj.token, obj.segment, obj.segment_start || "", obj.segment_end || "", obj.unique_transfer_count, obj.transfer_volume_usd, obj.labeled_transfer_ratio, obj.unknown_transfer_ratio, obj.cex_proxy_transfer_count, obj.cex_proxy_transfer_volume_usd, obj.cex_proxy_netflow_usd, "", "", obj.dex_proxy_transfer_count, obj.dex_proxy_transfer_volume_usd, obj.fund_or_institution_transfer_volume_usd, obj.market_maker_proxy_transfer_volume_usd, obj.top_entity_transfer_share, obj.entity_transfer_concentration, obj.segment_readiness, obj.limitations, "phase6.4f"]);
    }
  }

  for (const r of featRows.slice(1)) {
    unifiedRows.push([...r, "phase6.4h"]);
  }

  writeCsv(join(OUT_DIR, "features", "arkham_segmented_transfer_entity_features_v3.csv"), unifiedRows);
  console.log(`Unified v3: ${unifiedRows.length - 1} rows`);

  // ── AK_STE v3 Validation ──
  console.log("\n── AK_STE v3 Validation ──\n");
  const p0Feats = unifiedRows.slice(1).filter(r => r[2] === "P0_EVENT");
  const ctrlFeats = unifiedRows.slice(1).filter(r => r[2] === windowType);

  if (ctrlFeats.length < 3) {
    console.log("INSUFFICIENT_CONTROL_DATA — skipping validation");
  } else {
    const mIdx: Record<string, number> = {};
    uHeader.forEach((h, i) => { mIdx[h] = i; });

    const valMetrics = [
      { id: "AK_STE_001", name: "transfer_count", idx: mIdx["unique_transfer_count"] || 7 },
      { id: "AK_STE_005", name: "cex_proxy_count", idx: mIdx["cex_proxy_transfer_count"] || 11 },
      { id: "AK_STE_010", name: "dex_proxy_volume", idx: mIdx["dex_proxy_transfer_volume_usd"] || 17 },
    ];

    const valRows: string[][] = [["metric_id","control_window","p0_mean","control_mean","p0_median","control_median","trigger_discrimination","ratio_discrimination","classification","decision","limitations"]];

    for (const m of valMetrics) {
      if (m.idx < 0) continue;
      const p0Vals = p0Feats.map(r => parseFloat(r[m.idx] || "")).filter(v => !isNaN(v));
      const ctrlVals = ctrlFeats.map(r => parseFloat(r[m.idx] || "")).filter(v => !isNaN(v));
      if (p0Vals.length < 3 || ctrlVals.length < 3) {
        valRows.push([m.id, windowType, "N/A", "N/A", "N/A", "N/A", "N/A", "N/A", "INSUFFICIENT_DATA", "NEED_MORE_SAMPLE", `p0=${p0Vals.length} ctrl=${ctrlVals.length}`]);
        continue;
      }

      const p0Mean = p0Vals.reduce((a, b) => a + b, 0) / p0Vals.length;
      const ctrlMean = ctrlVals.reduce((a, b) => a + b, 0) / ctrlVals.length;
      const p0Med = p0Vals.sort((a, b) => a - b)[Math.floor(p0Vals.length / 2)];
      const ctrlMed = ctrlVals.sort((a, b) => a - b)[Math.floor(ctrlVals.length / 2)];
      const ctrlStd = Math.sqrt(ctrlVals.reduce((s, v) => s + (v - ctrlMean) ** 2, 0) / ctrlVals.length);
      const thresh = ctrlMean + 2 * ctrlStd;
      const p0Trig = p0Vals.filter(v => v > thresh).length / p0Vals.length;
      const ctrlTrig = ctrlVals.filter(v => v > thresh).length / ctrlVals.length;
      const trigDisc = ctrlTrig > 0 ? p0Trig / ctrlTrig : (p0Trig > 0 ? Infinity : 1);
      const ratioDisc = ctrlMean > 0 ? p0Mean / ctrlMean : (p0Mean > 0 ? Infinity : 1);

      let cls = "INSUFFICIENT_DATA", dec = "NEED_MORE_SAMPLE", lim = "";
      if (trigDisc > 3 && ratioDisc > 2) { cls = "PEAK_RISK"; dec = "PROMOTE_TO_REGISTRY_RISK_ONLY"; lim = `p0/ctrl mean ratio=${ratioDisc.toFixed(1)}x`; }
      else if (trigDisc > 2 || ratioDisc > 3) { cls = "STRUCTURAL_CONTEXT"; dec = "PROMOTE_TO_REGISTRY_RESEARCH_ONLY"; lim = `p0/ctrl mean ratio=${ratioDisc.toFixed(1)}x`; }
      else if (trigDisc > 0.5 && trigDisc < 2 && ratioDisc > 0.5 && ratioDisc < 2) { cls = "NOISE"; dec = "REJECT_NOISE"; lim = ""; }
      else { cls = "STRUCTURAL_CONTEXT"; dec = "KEEP_AS_CANDIDATE"; lim = ""; }

      console.log(`${m.id}: p0_mean=${p0Mean.toFixed(1)}, ctrl_mean=${ctrlMean.toFixed(1)}, trigDisc=${trigDisc.toFixed(1)}, ratioDisc=${ratioDisc.toFixed(1)}, ${cls}`);
      valRows.push([m.id, windowType, p0Mean.toFixed(1), ctrlMean.toFixed(1), p0Med.toFixed(1), ctrlMed.toFixed(1), trigDisc.toFixed(1), ratioDisc.toFixed(1), cls, dec, lim]);
    }

    const valDir = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "metric_loop", "validation");
    if (!existsSync(valDir)) mkdirSync(valDir, { recursive: true });
    writeCsv(join(valDir, "arkham_segmented_transfer_validation_v3.csv"), valRows);
  }

  // ── Report ──
  const segReady = auditRows.slice(1).filter(r => r[12] === "SEGMENT_READY").length;
  const segEmpty = auditRows.slice(1).filter(r => r[12] === "TRUE_EMPTY_WINDOW").length;
  const segBlocked = auditRows.slice(1).filter(r => r[12] === "API_BLOCKED_BY_BUDGET").length;
  const segFuture = auditRows.slice(1).filter(r => r[12] === "FUTURE_WINDOW_NOT_OBSERVABLE_YET").length;

  const status = segReady > 5 ? "CONTROL_EXTRACTION_COMPLETE"
    : segReady > 0 ? "CONTROL_EXTRACTION_PARTIAL"
    : segBlocked > 0 ? "BUDGET_INSUFFICIENT"
    : "CONTROL_TRUE_EMPTY_CONFIRMED";

  const reportLines = [
    `# Arkham Control-Only Extraction Report`, "",
    `Generated: ${new Date().toISOString()}`, `Batch: ${batch}`,
    "", "## 1. Executive Summary", "",
    `**${status}**`,
    `Segments READY: ${segReady}`, `TRUE_EMPTY: ${segEmpty}`, `BUDGET_BLOCKED: ${segBlocked}`, `FUTURE: ${segFuture}`,
    "",
    "## 2. Budget", "",
    `Heavy used before: ${budget.heavyUsed - (segReady + segEmpty) * 2}/${budget.heavyLimit}`,
    `Planned calls: ${plannedCalls}`,
    `Extraction budget: ${status.includes("BUDGET") ? "INSUFFICIENT" : "OK"}`,
    "",
    "## 3. Control Extraction", "",
    "| Token | Window | Ready | Partial | Empty | Blocked | Future |",
    "|-------|--------|-------|---------|-------|---------|--------|",
    ...controls.map(c => {
      const ta = auditRows.slice(1).filter(r => r[0] === c.sym);
      return `| ${c.sym} | ${windowType} | ${ta.filter(r => r[12] === "SEGMENT_READY").length} | ${ta.filter(r => r[12] === "SEGMENT_PARTIAL").length} | ${ta.filter(r => r[12] === "TRUE_EMPTY_WINDOW").length} | ${ta.filter(r => r[12] === "API_BLOCKED_BY_BUDGET").length} | ${ta.filter(r => r[12] === "FUTURE_WINDOW_NOT_OBSERVABLE_YET").length} |`;
    }),
    "",
    "## 4. Validation", "",
    "Only run when control data is sufficient (>=3 control feature rows).",
    segBlocked > 0 ? "**API_BLOCKED_BY_BUDGET** — validation not run." : "",
    "",
    "## 5. What Changed vs 6.4G-Fix", "",
    "- P0 NOT re-extracted (reused from 6.4F)",
    "- sortDir=asc/desc CORRECTLY passed to query",
    "- Budget-aware: checks remaining quota before extraction",
    "- API_BLOCKED_BY_BUDGET ≠ TRUE_EMPTY_WINDOW",
    "- FUTURE_WINDOW_NOT_OBSERVABLE_YET ≠ SEGMENT_EMPTY",
    "- segment_start/end populated from segment builder",
    "",
    "## 6. Paid Decision", "",
    "**CANCEL_ARKHAM_KEEP_LOCAL_ASSETS** or **EXTEND_TRIAL_OR_NEGOTIATE**",
    "- Do NOT pay $1,500 without resolved top_flow",
    "- Control extraction needs budget reset to complete",
    "",
    "## 7. Cannot Know", "",
    "- Cannot confirm accumulation/distribution", "- No trading recommendation",
  ];

  writeFileSync(join(REPORTS_DIR, "arkham_control_only_extraction_report.md"), reportLines.join("\n"));
  console.log(`\nStatus: ${status}`);
}

main().catch(console.error);
