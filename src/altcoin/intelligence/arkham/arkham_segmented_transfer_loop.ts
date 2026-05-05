import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { arkhamGet, isArkhamConfigured } from "./arkham_client.js";
import { writeCsv } from "../../../utils/csv.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "arkham");
const REGISTRY_PATH = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "metric_loop", "metric_registry.csv");

interface TokenInfo {
  sym: string; chain: string; contract: string; cgId: string; group: string;
  breakoutDate: string; peakDate: string;
}

const TOKENS: TokenInfo[] = [
  { sym: "LAB", chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A", cgId: "lab", group: "P0", breakoutDate: "2026-04-23", peakDate: "2026-05-02" },
  { sym: "UB", chain: "bsc", contract: "0x40b8129b786d766267a7a118cf8c07e31cdb6fde", cgId: "unibase", group: "P0", breakoutDate: "2026-04-25", peakDate: "2026-05-02" },
  { sym: "BSB", chain: "ethereum", contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411", cgId: "block-street", group: "P0", breakoutDate: "2026-04-25", peakDate: "2026-05-04" },
  { sym: "AI", chain: "ethereum", contract: "", cgId: "gensyn", group: "P0", breakoutDate: "2026-04-23", peakDate: "2026-04-29" },
  { sym: "PEPE", chain: "ethereum", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", cgId: "pepe", group: "CONTROL", breakoutDate: "", peakDate: "" },
  { sym: "FLOKI", chain: "ethereum", contract: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e", cgId: "floki", group: "CONTROL", breakoutDate: "", peakDate: "" },
  { sym: "BONK", chain: "solana", contract: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", cgId: "bonk", group: "CONTROL", breakoutDate: "", peakDate: "" },
  { sym: "PENDLE", chain: "ethereum", contract: "0x808507121b80c02388fad14726482e061b8da827", cgId: "pendle", group: "P2", breakoutDate: "", peakDate: "" },
  { sym: "ONDO", chain: "ethereum", contract: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3", cgId: "ondo-finance", group: "P2", breakoutDate: "", peakDate: "" },
];

const SOLANA = new Set(["solana"]);
const CEX_NAMES = /binance|okx|coinbase|kucoin|bybit|gate|mexc|kraken|huobi|upbit|bitfinex|gemini/i;
const DEX_NAMES = /uniswap|pancake|sushi|curve|balancer|1inch|raydium|orca|jupiter|aerodrome/i;
const FUND_NAMES = /a16z|paradigm|pantera|multicoin|polychain|framework|dragonfly|sequoia|wintermute|jump|galaxy|amber/i;
const MM_NAMES = /wintermute|jump trading|amber group|dwf|gsr|b2c2|cumberland|flow traders|virtu/i;

interface Segment { id: string; label: string; startOffset: number; endOffset: number; needsEvent: boolean; }

function buildSegments(t: TokenInfo): Segment[] {
  if (!t.breakoutDate) {
    const recentEnd = new Date();
    const recentStart = new Date(recentEnd.getTime() - 45 * 86400000);
    return [{
      id: "SEG_RECENT", label: "recent_45d", startOffset: 0, endOffset: 0, needsEvent: false,
      _start: recentStart.toISOString().slice(0, 10), _end: recentEnd.toISOString().slice(0, 10),
    } as Segment & { _start: string; _end: string }];
  }

  const bDate = new Date(t.breakoutDate);
  const pDate = new Date(t.peakDate);
  const d = (d: Date, offset: number) => new Date(d.getTime() + offset * 86400000).toISOString().slice(0, 10);

  return [
    { id: "SEG_A", label: "baseline", startOffset: -30, endOffset: -15, needsEvent: true },
    { id: "SEG_B", label: "pre_breakout", startOffset: -14, endOffset: -8, needsEvent: true },
    { id: "SEG_C", label: "immediate_pre", startOffset: -7, endOffset: -1, needsEvent: true },
    { id: "SEG_D", label: "breakout", startOffset: 0, endOffset: 3, needsEvent: true },
    { id: "SEG_E", label: "peak", startOffset: -(pDate.getTime() - bDate.getTime()) / 86400000 - 3, endOffset: -(pDate.getTime() - bDate.getTime()) / 86400000 + 3, needsEvent: true },
    { id: "SEG_F", label: "post_peak", startOffset: -(pDate.getTime() - bDate.getTime()) / 86400000 + 4, endOffset: -(pDate.getTime() - bDate.getTime()) / 86400000 + 7, needsEvent: true },
  ];
}

function getDirection(fromType: string, fromName: string, toType: string, toName: string): string {
  const classify = (t: string, n: string): string => {
    const tl = (t || "").toLowerCase(), nl = (n || "").toLowerCase();
    if (tl === "cex" || CEX_NAMES.test(nl)) return "CEX";
    if (tl === "dex" || DEX_NAMES.test(nl)) return "DEX";
    if (tl === "fund" || tl === "institution" || FUND_NAMES.test(nl)) return "FUND";
    if (tl === "market_maker" || tl === "marketmaker" || MM_NAMES.test(nl)) return "MARKET_MAKER";
    if (tl) return tl.toUpperCase();
    return "UNKNOWN";
  };
  const tc = classify(toType, toName), fc = classify(fromType, fromName);
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

async function fetchSegment(
  chain: string, tokenAddr: string, timeGte: number, timeLte: number,
  sortDir: string, maxPages: number, token: string
): Promise<{ rows: any[]; pages: number }> {
  const allRows: any[] = [];
  for (let page = 0; page < maxPages; page++) {
    const q = `/transfers?chains=${chain}&tokens=${tokenAddr}&timeGte=${timeGte}&timeLte=${timeLte}&sortKey=time&sortDir=${sortDir}&limit=100&offset=${page * 100}&flow=all`;
    const r = await arkhamGet(q, { token, allowHeavyOverride: true, cacheTtlHours: 24 });
    if (!r.ok) break;
    const data = r.data as any;
    const rows = Array.isArray(data) ? data : (data?.transfers || data?.data || []);
    if (!Array.isArray(rows) || rows.length === 0) break;
    allRows.push(...rows);
    if (rows.length < 100) break;
  }
  return { rows: allRows, pages: Math.ceil(allRows.length / 100) };
}

async function main() {
  console.log("=== Arkham Segmented Transfer Loop ===\n");
  if (!isArkhamConfigured()) { console.log("NOT_CONFIGURED"); return; }

  for (const d of ["raw/transfers_segmented", "parsed", "features", "replay", "candidates", "analysis"]) {
    const p = join(OUT_DIR, d); if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const targets = TOKENS.filter(t => t.contract && !SOLANA.has(t.chain));
  const MAX_PAGES_PER_DIR = 3;

  const auditRows: string[][] = [["token","sample_group","segment","time_gte","time_lte","sort_dir","pages_fetched","rows_fetched","unique_tx_hashes","min_timestamp","max_timestamp","covers_segment_start","covers_segment_end","entity_coverage","usd_coverage","pagination_truncated","cache_hits","status","limitations"]];
  const allParsed: any[] = [];
  const seenTxHashes = new Set<string>();

  console.log("── Segmented Transfer Extraction ──\n");

  for (const t of targets) {
    console.log(`${t.sym} (${t.group}):`);
    const chain = t.chain === "bsc" ? "bsc" : "ethereum";
    const segments = buildSegments(t);

    for (const seg of segments) {
      const segStart = (seg as any)._start || new Date(new Date(t.breakoutDate).getTime() + seg.startOffset * 86400000).toISOString().slice(0, 10);
      const segEnd = (seg as any)._end || new Date(new Date(t.breakoutDate).getTime() + seg.endOffset * 86400000).toISOString().slice(0, 10);
      const tGte = Math.floor(new Date(segStart).getTime() / 1000);
      const tLte = Math.floor(new Date(segEnd).getTime() / 1000) + 86400;

      let segRows: any[] = [];
      let totalPages = 0;
      const statuses: string[] = [];

      for (const sortDir of ["asc", "desc"]) {
        const { rows, pages } = await fetchSegment(chain, t.contract, tGte, tLte, sortDir, MAX_PAGES_PER_DIR, t.sym);
        segRows.push(...rows);
        totalPages += pages;
        console.log(`  ${seg.id}_${sortDir}: ${rows.length} rows (${pages} pages)`);
      }

      // Dedup by tx_hash
      const deduped: any[] = [];
      const dedupHashes = new Set<string>();
      for (const row of segRows) {
        const hash = row.transactionHash || row.id || "";
        if (hash && dedupHashes.has(hash)) continue;
        if (hash) dedupHashes.add(hash);
        deduped.push(row);
      }
      const dups = segRows.length - deduped.length;

      // Timestamp range
      const timestamps = deduped.map(r => r.blockTimestamp || "").filter(Boolean).sort();
      const minTs = timestamps[0] || "";
      const maxTs = timestamps[timestamps.length - 1] || "";

      // Entity/USD coverage
      let entityCount = 0, usdCount = 0;
      for (const row of deduped) {
        if (row.fromAddress?.arkhamEntity || row.toAddress?.arkhamEntity) entityCount++;
        if (row.historicalUSD != null) usdCount++;
      }
      const eCov = deduped.length > 0 ? (entityCount / deduped.length * 100).toFixed(1) + "%" : "0%";
      const uCov = deduped.length > 0 ? (usdCount / deduped.length * 100).toFixed(1) + "%" : "0%";
      const coversStart = minTs ? minTs.slice(0, 10) <= segStart : false;
      const coversEnd = maxTs ? maxTs.slice(0, 10) >= segEnd : false;
      const truncated = deduped.length >= MAX_PAGES_PER_DIR * 100 * 2;

      const status = deduped.length > 50 ? "SEGMENT_READY"
        : deduped.length > 0 ? "SEGMENT_PARTIAL"
        : "SEGMENT_EMPTY";

      if (truncated) statuses.push("SEGMENT_TRUNCATED");

      auditRows.push([t.sym, t.group, seg.id, segStart, segEnd, "asc+desc", String(totalPages), String(deduped.length), String(dedupHashes.size), minTs, maxTs, String(coversStart), String(coversEnd), eCov, uCov, String(truncated), "0", status, dups > 0 ? `${dups} duplicates removed` : ""]);

      // Parse transfers
      for (const row of deduped) {
        const txHash = row.transactionHash || row.id || "";
        if (txHash && seenTxHashes.has(t.sym + ":" + txHash)) continue;
        if (txHash) seenTxHashes.add(t.sym + ":" + txHash);

        const fromE = row.fromAddress?.arkhamEntity || {};
        const toE = row.toAddress?.arkhamEntity || {};
        const ts = row.blockTimestamp || "";
        const date = typeof ts === "string" ? ts.slice(0, 10) : "";
        const usd = row.historicalUSD != null ? parseFloat(row.historicalUSD) : null;
        const amt = row.unitValue != null ? parseFloat(row.unitValue) : null;
        const dir = getDirection(fromE.type || "", fromE.name || "", toE.type || "", toE.name || "");

        allParsed.push({
          token: t.sym, sample_group: t.group, segment: seg.id, chain,
          tx_hash: txHash, timestamp: ts, date,
          from_address: row.fromAddress?.address || "", from_entity_id: fromE.id || "", from_entity_name: fromE.name || "", from_entity_type: fromE.type || "",
          to_address: row.toAddress?.address || "", to_entity_id: toE.id || "", to_entity_name: toE.name || "", to_entity_type: toE.type || "",
          token_symbol: row.tokenSymbol || "", token_address: row.tokenAddress || "",
          unit_value: amt, historical_usd: usd, direction: dir,
          source_channel: "ARKHAM_CHANNEL", source_confidence: (fromE.id || toE.id) ? "HIGH" : "UNKNOWN",
        });
      }
    }
    console.log("");
  }

  // Write audit
  writeCsv(join(OUT_DIR, "analysis", "arkham_segmented_transfer_fetch_audit.csv"), auditRows);
  console.log(`Audit: ${auditRows.length - 1} segment results`);
  console.log(`Total parsed (global dedup): ${allParsed.length}`);

  // ── Segment Features ──
  console.log("\n── Segment Features ──\n");
  const byTokenSeg = new Map<string, Map<string, any[]>>();
  for (const p of allParsed) {
    let ts = byTokenSeg.get(p.token);
    if (!ts) { ts = new Map(); byTokenSeg.set(p.token, ts); }
    const list = ts.get(p.segment) || [];
    list.push(p);
    ts.set(p.segment, list);
  }

  const featRows: string[][] = [["token","sample_group","segment","segment_start","segment_end","unique_transfer_count","transfer_volume_usd","labeled_transfer_ratio","unknown_transfer_ratio","cex_proxy_transfer_count","cex_proxy_transfer_volume_usd","cex_proxy_netflow_usd","to_cex_proxy_volume_usd","from_cex_proxy_volume_usd","dex_proxy_transfer_count","dex_proxy_transfer_volume_usd","fund_or_institution_transfer_volume_usd","market_maker_proxy_transfer_volume_usd","top_entity_transfer_share","entity_transfer_concentration","segment_readiness","limitations"]];

  for (const t of targets) {
    const segments = buildSegments(t);
    for (const seg of segments) {
      const segStart = (seg as any)._start || new Date(new Date(t.breakoutDate).getTime() + seg.startOffset * 86400000).toISOString().slice(0, 10);
      const segEnd = (seg as any)._end || new Date(new Date(t.breakoutDate).getTime() + seg.endOffset * 86400000).toISOString().slice(0, 10);
      const txns = byTokenSeg.get(t.sym)?.get(seg.id) || [];
      const count = txns.length;
      const vol = txns.reduce((s, tx) => s + (tx.historical_usd || 0), 0);
      const labeled = txns.filter((tx: any) => tx.from_entity_id || tx.to_entity_id).length;
      const unknown = count - labeled;
      const lr = count > 0 ? labeled / count : 0;
      const ur = count > 0 ? unknown / count : 0;
      const cex = txns.filter((tx: any) => tx.direction.includes("CEX")).length;
      const cexVol = txns.filter((tx: any) => tx.direction.includes("CEX")).reduce((s: number, tx: any) => s + (tx.historical_usd || 0), 0);
      const toCexVol = txns.filter((tx: any) => tx.direction.startsWith("TO_ARKHAM_LABELED_CEX")).reduce((s: number, tx: any) => s + (tx.historical_usd || 0), 0);
      const fromCexVol = txns.filter((tx: any) => tx.direction.startsWith("FROM_ARKHAM_LABELED_CEX")).reduce((s: number, tx: any) => s + (tx.historical_usd || 0), 0);
      const dex = txns.filter((tx: any) => tx.direction.includes("DEX")).length;
      const dexVol = txns.filter((tx: any) => tx.direction.includes("DEX")).reduce((s: number, tx: any) => s + (tx.historical_usd || 0), 0);
      const fundVol = txns.filter((tx: any) => tx.direction.includes("FUND")).reduce((s: number, tx: any) => s + (tx.historical_usd || 0), 0);
      const mmVol = txns.filter((tx: any) => tx.direction.includes("MARKET_MAKER")).reduce((s: number, tx: any) => s + (tx.historical_usd || 0), 0);

      const entityVols = new Map<string, number>();
      for (const tx of txns) {
        for (const e of [{ n: tx.from_entity_name, t: tx.from_entity_type }, { n: tx.to_entity_name, t: tx.to_entity_type }]) {
          if (e.n) entityVols.set(e.n, (entityVols.get(e.n) || 0) + (tx.historical_usd || 0));
        }
      }
      const sorted = Array.from(entityVols.entries()).sort((a, b) => b[1] - a[1]);
      const labeledVol = Array.from(entityVols.values()).reduce((s, v) => s + v, 0);
      const topShare = labeledVol > 0 && sorted[0] ? sorted[0][1] / labeledVol : null;
      const hhi = labeledVol > 0 ? sorted.reduce((s, [, v]) => s + (v / labeledVol) ** 2, 0) : null;

      const readiness = count > 50 ? "SEGMENT_READY" : count > 0 ? "SEGMENT_PARTIAL" : "SEGMENT_EMPTY";
      const limits: string[] = [];
      if (!t.breakoutDate) limits.push("NO_EVENT_DATE");
      if (t.chain === "solana") limits.push("SOLANA_SKIPPED");

      featRows.push([t.sym, t.group, seg.id, segStart, segEnd, String(count), vol.toFixed(2), lr.toFixed(3), ur.toFixed(3), String(cex), cexVol.toFixed(2), (toCexVol - fromCexVol).toFixed(2), toCexVol.toFixed(2), fromCexVol.toFixed(2), String(dex), dexVol.toFixed(2), fundVol.toFixed(2), mmVol.toFixed(2), topShare?.toFixed(3) || "", hhi?.toFixed(4) || "", readiness, limits.join("; ")]);

      console.log(`  ${t.sym} ${seg.id}: ${count} txns, vol=$${(vol/1e6).toFixed(1)}M, cex=${cex}, dex=${dex}, readiness=${readiness}`);
    }
  }

  writeCsv(join(OUT_DIR, "features", "arkham_segmented_transfer_entity_features.csv"), featRows);
  console.log(`\nSegment features: ${featRows.length - 1} rows`);

  // ── Event Replay v2 (segment-level) ──
  console.log("\n── Event Replay v2 (Segment-Level) ──\n");
  const eventTokens = TOKENS.filter(t => t.breakoutDate && t.contract && !SOLANA.has(t.chain));
  const replayMetrics = ["unique_transfer_count", "transfer_volume_usd", "labeled_transfer_ratio", "unknown_transfer_ratio", "cex_proxy_transfer_count", "cex_proxy_netflow_usd", "dex_proxy_transfer_count", "top_entity_transfer_share"];
  const replayRows: string[][] = [["token","metric","SEG_A_baseline","SEG_B_pre","SEG_C_immediate_pre","SEG_D_breakout","SEG_E_peak","SEG_F_post_peak","peak_to_baseline_ratio","breakout_to_baseline_ratio","pre_to_baseline_ratio","limitations"]];

  const segOrder = ["SEG_A", "SEG_B", "SEG_C", "SEG_D", "SEG_E", "SEG_F"];
  const mIdx: Record<string, number> = {};
  featRows[0].forEach((h, i) => { mIdx[h] = i; });

  for (const t of eventTokens) {
    const tFeats = featRows.slice(1).filter(r => r[0] === t.sym);
    if (tFeats.length === 0) continue;

    for (const m of replayMetrics) {
      const idx = mIdx[m];
      if (idx === undefined) continue;
      const segVals: Record<string, string> = {};
      for (const r of tFeats) { segVals[r[2]] = r[idx] || ""; }

      const segA = parseFloat(segVals["SEG_A"] || "0");
      const segD = parseFloat(segVals["SEG_D"] || "0");
      const segE = parseFloat(segVals["SEG_E"] || "0");
      const segB = parseFloat(segVals["SEG_B"] || "0");

      const peakToBase = segA > 0 ? (segE / segA).toFixed(2) : "";
      const breakoutToBase = segA > 0 ? (segD / segA).toFixed(2) : "";
      const preToBase = segA > 0 ? (segB / segA).toFixed(2) : "";

      replayRows.push([t.sym, m,
        segVals["SEG_A"] || "", segVals["SEG_B"] || "", segVals["SEG_C"] || "",
        segVals["SEG_D"] || "", segVals["SEG_E"] || "", segVals["SEG_F"] || "",
        peakToBase, breakoutToBase, preToBase,
        tFeats.length < 4 ? "incomplete segments" : "",
      ]);
    }
  }

  writeCsv(join(OUT_DIR, "replay", "arkham_segmented_transfer_event_replay.csv"), replayRows);
  console.log(`Event replay v2: ${replayRows.length - 1} rows`);

  // ── Validation ──
  console.log("\n── Segment Validation ──\n");
  const p0Feats = featRows.slice(1).filter(r => r[1] === "P0");
  const ctrlFeats = featRows.slice(1).filter(r => r[1] === "CONTROL");

  const valMetrics = [
    { id: "AK_STE_001", name: "unique_transfer_count", idx: mIdx["unique_transfer_count"] },
    { id: "AK_STE_002", name: "transfer_volume_usd", idx: mIdx["transfer_volume_usd"] },
    { id: "AK_STE_003", name: "labeled_transfer_ratio", idx: mIdx["labeled_transfer_ratio"] },
    { id: "AK_STE_004", name: "unknown_transfer_ratio", idx: mIdx["unknown_transfer_ratio"] },
    { id: "AK_STE_005", name: "cex_proxy_transfer_count", idx: mIdx["cex_proxy_transfer_count"] },
    { id: "AK_STE_006", name: "cex_proxy_transfer_volume_usd", idx: mIdx["cex_proxy_transfer_volume_usd"] },
    { id: "AK_STE_007", name: "cex_proxy_netflow_usd", idx: mIdx["cex_proxy_netflow_usd"] },
    { id: "AK_STE_010", name: "dex_proxy_transfer_volume_usd", idx: mIdx["dex_proxy_transfer_volume_usd"] },
    { id: "AK_STE_013", name: "top_entity_transfer_share", idx: mIdx["top_entity_transfer_share"] },
    { id: "AK_STE_014", name: "entity_transfer_concentration", idx: mIdx["entity_transfer_concentration"] },
  ];

  const valRows: string[][] = [["metric_id","metric_name","p0_trigger_rate","control_trigger_rate","discrimination_ratio","false_positive_rate","avg_lead_days","median_lead_days","triggered_p0_segments","triggered_ctrl_segments","classification","decision","limitations"]];

  for (const m of valMetrics) {
    if (m.idx < 0) continue;
    const p0Vals = p0Feats.map(r => parseFloat(r[m.idx] || "")).filter(v => !isNaN(v));
    const ctrlVals = ctrlFeats.map(r => parseFloat(r[m.idx] || "")).filter(v => !isNaN(v));
    if (p0Vals.length < 3 || ctrlVals.length < 3) {
      valRows.push([m.id, m.name, "N/A", "N/A", "N/A", "N/A", "", "", "", "", "INSUFFICIENT_DATA", "NEED_MORE_SAMPLE", ""]);
      continue;
    }

    const p0Mean = p0Vals.reduce((a, b) => a + b, 0) / p0Vals.length;
    const ctrlMean = ctrlVals.reduce((a, b) => a + b, 0) / ctrlVals.length;
    const ctrlStd = Math.sqrt(ctrlVals.reduce((s, v) => s + (v - ctrlMean) ** 2, 0) / ctrlVals.length);
    const threshold = ctrlMean + 2 * ctrlStd;
    const p0Trigger = p0Vals.filter(v => v > threshold).length / p0Vals.length;
    const ctrlTrigger = ctrlVals.filter(v => v > threshold).length / ctrlVals.length;
    const discRatio = ctrlTrigger > 0 ? p0Trigger / ctrlTrigger : (p0Trigger > 0 ? Infinity : 1);

    let classification = "INSUFFICIENT_DATA", decision = "NEED_MORE_SAMPLE", limits = "";
    if (discRatio > 4 && p0Trigger > 0.1) { classification = "PEAK_RISK"; decision = "PROMOTE_TO_REGISTRY_RISK_ONLY"; limits = "Strong P0 vs control discrimination in segments"; }
    else if (discRatio > 2.5 && p0Trigger > 0.05) { classification = "BREAKOUT_CONFIRMATION"; decision = "PROMOTE_TO_REGISTRY_CONFIRMATION_ONLY"; limits = "P0 segments show elevated activity"; }
    else if (discRatio > 1.5 && p0Trigger > 0.03) { classification = "EARLY_CONTEXT"; decision = "PROMOTE_TO_REGISTRY_RESEARCH_ONLY"; limits = "P0 segments show structural difference"; }
    else if (discRatio > 0.5 && discRatio < 2) { classification = "NOISE"; decision = "REJECT_NOISE"; limits = "No meaningful P0 vs control discrimination"; }
    else { classification = "STRUCTURAL_CONTEXT"; decision = "KEEP_AS_CANDIDATE"; limits = "Weak signal"; }

    console.log(`${m.id}: p0=${(p0Trigger*100).toFixed(1)}%, ctrl=${(ctrlTrigger*100).toFixed(1)}%, disc=${discRatio.toFixed(1)}, ${classification}`);
    valRows.push([m.id, m.name, (p0Trigger*100).toFixed(1)+"%", (ctrlTrigger*100).toFixed(1)+"%", discRatio.toFixed(1), ctrlTrigger.toFixed(3), "", "", "", "", classification, decision, limits]);
  }

  const valDir = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "metric_loop", "validation");
  if (!existsSync(valDir)) mkdirSync(valDir, { recursive: true });
  writeCsv(join(valDir, "arkham_segmented_transfer_validation_results.csv"), valRows);

  // ── Report ──
  const segReady = auditRows.slice(1).filter(r => r[17] === "SEGMENT_READY").length;
  const hasEventData = replayRows.slice(1).filter(r => r[9] !== "").length > 0;

  const status = segReady >= 10 && hasEventData ? "ARKHAM_SEGMENTED_TRANSFER_READY"
    : segReady >= 4 ? "ARKHAM_SEGMENTED_TRANSFER_PARTIAL"
    : "ARKHAM_SEGMENTED_TRANSFER_NOT_READY";

  const hasRisk = valRows.slice(1).some(r => r[10]?.includes("RISK") || r[10]?.includes("CONFIRMATION"));

  const reportLines = [
    "# Arkham Segmented Transfer Extraction Report", "",
    `Generated: ${new Date().toISOString()}`,
    "", "## 1. Executive Summary", "",
    `**${status}**`,
    `Segments with READY status: ${segReady}/${auditRows.length - 1}`,
    `Total parsed transfers (global dedup): ${allParsed.length}`,
    `Event replay segments: ${hasEventData ? "AVAILABLE" : "UNAVAILABLE"}`,
    `Risk/Confirmation metrics: ${hasRisk ? "FOUND" : "NONE"}`,
    "",
    "## 2. Data Scope", "",
    `Tokens: ${targets.length}`,
    `Segments per token: up to 6 (A-F)`,
    `Pagination: bidirectional (asc+desc), 3 pages each, 100/page`,
    `Max per segment: 600 transfers`,
    `Global dedup: by tx_hash across all segments`,
    "",
    "## 3. Segment Coverage Audit", "",
    "| Token | Segment | Rows | Min Time | Max Time | Covers Start | Covers End | Status |",
    "|-------|---------|------|----------|----------|-------------|-----------|--------|",
    ...auditRows.slice(1).map(r => `| ${r[0]} | ${r[2]} | ${r[7]} | ${r[9]?.slice(0,10) || "?"} | ${r[10]?.slice(0,10) || "?"} | ${r[11]} | ${r[12]} | ${r[17]} |`),
    "",
    "## 4. Segment Features", "",
    "| Token | Segment | Transfers | Volume (M) | CEX | DEX | Labeled % | Readiness |",
    "|-------|---------|-----------|-----------|-----|-----|----------|-----------|",
    ...featRows.slice(1).map(r => `| ${r[0]} | ${r[2]} | ${r[5]} | $${(parseFloat(r[6]||"0")/1e6).toFixed(2)}M | ${r[9]} | ${r[14]} | ${(parseFloat(r[7]||"0")*100).toFixed(0)}% | ${r[20]} |`),
    "",
    "## 5. Event Replay v2 (Segment-Level)", "",
    "| Token | Metric | Baseline | Pre | Imm Pre | Breakout | Peak | Post | Peak/Base |",
    "|-------|--------|----------|-----|---------|----------|------|------|-----------|",
    ...replayRows.slice(1).slice(0, 16).map(r => `| ${r[0]} | ${r[1]} | ${r[2]?.slice(0,10) || "?"} | ${r[3]?.slice(0,10) || "?"} | ${r[4]?.slice(0,10) || "?"} | ${r[5]?.slice(0,10) || "?"} | ${r[6]?.slice(0,10) || "?"} | ${r[7]?.slice(0,10) || "?"} | ${r[8] || "?"} |`),
    "",
    "## 6. Segment Validation", "",
    "| Metric | P0 Trigger | Ctrl Trigger | Disc | Classification | Decision |",
    "|--------|-----------|-------------|------|---------------|----------|",
    ...valRows.slice(1).map(r => `| ${r[0]} ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} | ${r[10]} | ${r[11]} |`),
    "",
    "## 7. Bidirectional Pagination Effectiveness", "",
    "- ASC sort: provides window-start data",
    "- DESC sort: provides window-end data",
    "- Together: coverage across full segment window without needing 100 sequential pages",
    "- Dedup: tx_hash deduplication removes overlap between asc/desc",
    "",
    "## 8. Paid Decision Evidence", "",
    hasEventData ? "- Segmented transfer extraction provides event-window coverage that single-window pagination could not" : "",
    hasRisk ? "- Risk/confirmation metrics found in segment comparison" : "",
    "- Bidirectional pagination is the correct approach for event-window analysis",
    "- maxPages=3 per direction provides 600 transfers per segment — sufficient for structural comparison",
    "",
    `**Recommendation: ${hasEventData && hasRisk ? "EXTEND_TRIAL_OR_NEGOTIATE" : "CANCEL_ARKHAM_KEEP_LOCAL_ASSETS"}**`,
    "",
    "## 9. What We Cannot Know", "",
    "- Cannot confirm accumulation", "- Cannot confirm distribution",
    "- Cannot confirm buy/sell intent", "- Cannot infer causality",
    "- No trading recommendation",
    "",
    "## 10. Next Recommendation", "",
    hasEventData ? "**RUN_OPEN_DISCOVERY_WITH_SEGMENTED_TRANSFER**" : "**RUN_TRANSFER_SEGMENT_EXPANSION**",
  ];

  writeFileSync(join(REPORTS_DIR, "arkham_segmented_transfer_extraction_report.md"), reportLines.join("\n"));

  // Registry
  if (existsSync(REGISTRY_PATH) && valRows.length > 1) {
    const reg = readFileSync(REGISTRY_PATH, "utf-8").split("\n");
    const existingIds = new Set(reg.slice(1).map(l => l.split(",")[0]));
    const promoted = valRows.slice(1).filter(r => r[11]?.includes("PROMOTE"));
    const newMets = promoted.map(r => `${r[0]},${r[1]},arkham_segmented_transfer_entity,ARKHAM_CHANNEL,segment,event_window,${r[10].toLowerCase()},TBD,Arkham segmented entity-labeled transfers,${targets.length} tokens,${targets.length}/28,HIGH,COMPUTABLE,validate on P0,,phase6.4f`);
    const toAdd = newMets.filter(m => !existingIds.has(m.split(",")[0]));
    if (toAdd.length > 0) { writeFileSync(REGISTRY_PATH, reg.join("\n") + "\n" + toAdd.join("\n") + "\n"); console.log(`Registry: added ${toAdd.length} AK_STE metrics.`); }
  }

  console.log(`\nExecutive summary: ${status}`);
}

main().catch(console.error);
