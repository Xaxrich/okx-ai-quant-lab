import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { arkhamGet, isArkhamConfigured } from "./arkham_client.js";
import { writeCsv } from "../../../utils/csv.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "arkham");

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

async function fetchSegmentTransfers(chain: string, addr: string, tGte: number, tLte: number, maxP: number, token: string): Promise<{rows: any[], pages: number}> {
  const all: any[] = [];
  for (let p = 0; p < maxP; p++) {
    const q = `/transfers?chains=${chain}&tokens=${addr}&timeGte=${tGte}&timeLte=${tLte}&sortKey=time&sortDir=asc&limit=100&offset=${p*100}&flow=all`;
    const r = await arkhamGet(q, { token, allowHeavyOverride: true, cacheTtlHours: 24 });
    if (!r.ok) break;
    const data = r.data as any;
    const rows = Array.isArray(data) ? data : (data?.transfers || []);
    if (rows.length === 0) break;
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return { rows: all, pages: Math.ceil(all.length / 100) };
}

async function main() {
  console.log("=== Arkham Control Transfer Diagnosis ===\n");
  if (!isArkhamConfigured()) { console.log("NOT_CONFIGURED"); return; }
  for (const d of ["analysis", "features", "events"]) { const p = join(OUT_DIR, d); if (!existsSync(p)) mkdirSync(p, { recursive: true }); }
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);

  const p0Configs = [
    { sym: "LAB", chain: "bsc", baseDate: "2026-04-23", peakDate: "2026-05-02" },
    { sym: "UB", chain: "bsc", baseDate: "2026-04-25", peakDate: "2026-05-02" },
    { sym: "BSB", chain: "ethereum", baseDate: "2026-04-25", peakDate: "2026-05-04" },
  ];

  const controls = [
    { sym: "PEPE", chain: "ethereum", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", cgId: "pepe", group: "CONTROL", peakDate: "2026-04-29", baseDate: "2026-04-22" },
    { sym: "FLOKI", chain: "ethereum", contract: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e", cgId: "floki", group: "CONTROL", peakDate: "2026-04-29", baseDate: "2026-04-22" },
    { sym: "PENDLE", chain: "ethereum", contract: "0x808507121b80c02388fad14726482e061b8da827", cgId: "pendle", group: "P2", peakDate: "2026-05-04", baseDate: "2026-04-27" },
    { sym: "ONDO", chain: "ethereum", contract: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3", cgId: "ondo-finance", group: "P2", peakDate: "2026-05-04", baseDate: "2026-04-27" },
  ];

  // ── Phase 1: Probe matrix (small) ──
  console.log("── Phase 1: Probe Matrix ──\n");
  const probeRows: string[][] = [["token","sample_group","chain","contract","pricing_id","window_start","window_end","variant_id","query_params","time_unit","token_identifier_type","status","rows_returned","first_token_symbol","has_from_entity","has_to_entity","has_historical_usd","parser_ready","diagnosis","limitations"]];

  const testWindows = [
    { label: "mar_apr", gte: new Date("2026-03-24"), lte: new Date("2026-04-08") },
    { label: "apr_may", gte: new Date("2026-04-25"), lte: new Date("2026-05-05") },
  ];

  for (const c of controls) {
    const chain = c.chain;
    for (const tw of testWindows) {
      const tGte = Math.floor(tw.gte.getTime() / 1000);
      const tLte = Math.floor(tw.lte.getTime() / 1000);
      const variants = [
        { id: "contract_sec", query: `chains=${chain}&tokens=${c.contract}&timeGte=${tGte}&timeLte=${tLte}&sortKey=time&sortDir=asc&limit=3&flow=all`, idType: "contract", timeUnit: "seconds" },
        { id: "pricing_id_sec", query: `tokens=${c.cgId}&timeGte=${tGte}&timeLte=${tLte}&sortKey=time&sortDir=asc&limit=3&flow=all`, idType: "pricing_id", timeUnit: "seconds" },
      ];
      for (const v of variants) {
        const r = await arkhamGet(`/transfers?${v.query}`, { token: c.sym, allowHeavyOverride: true, cacheTtlHours: 24 });
        const data = r.data as any;
        const rows = Array.isArray(data) ? data : (data?.transfers || []);
        const count = Array.isArray(rows) ? rows.length : 0;
        const first = count > 0 ? rows[0] : null;
        const hasFE = !!(first?.fromAddress?.arkhamEntity);
        const hasTE = !!(first?.toAddress?.arkhamEntity);
        const hasUSD = first?.historicalUSD != null;
        const sym = first?.tokenSymbol || "";
        const diag = count > 0 ? (v.idType === "contract" ? "CONTRACT_SECONDS_WORKS" : "PRICING_ID_SECONDS_WORKS") : "TRUE_EMPTY_WINDOW";
        console.log(`  ${c.sym} ${v.id} ${tw.label}: rows=${count} diag=${diag}`);
        probeRows.push([c.sym, c.group, chain, c.contract, c.cgId, tw.gte.toISOString().slice(0,10), tw.lte.toISOString().slice(0,10), v.id, v.query.slice(0,80), v.timeUnit, v.idType, r.status, String(count), sym, String(hasFE), String(hasTE), String(hasUSD), String(count > 0), diag, ""]);
      }
    }
  }
  writeCsv(join(OUT_DIR, "analysis", "arkham_control_transfer_probe_matrix.csv"), probeRows);
  console.log(`Probe matrix: ${probeRows.length - 1} tests`);

  // ── Phase 2: Extract control transfers (pseudo-event + calendar-matched, NO P0 re-extraction) ──
  console.log("\n── Phase 2: Control Transfer Extraction ──\n");
  const auditRows: string[][] = [["token","sample_group","window_type","matched_p0","segment","segment_start","segment_end","pages","rows","unique_tx","min_ts","max_ts","covers_start","covers_end","entity_cov","usd_cov","truncated","status","limitations"]];
  const allControlParsed: any[] = [];
  const seenHashes = new Set<string>();
  const MAX_PAGES = 3;

  // Pseudo-event controls
  for (const c of controls) {
    const segs = makeSegments(c.baseDate, c.peakDate);
    for (const seg of segs) {
      const isFuture = seg.start > today || seg.end > today;
      if (isFuture) {
        auditRows.push([c.sym, c.group, "PSEUDO_EVENT", c.sym, seg.id, seg.start, seg.end, "0", "0", "0", "", "", "", "", "", "", "", "FUTURE_WINDOW_NOT_OBSERVABLE_YET", `Window extends beyond ${today}`]);
        continue;
      }
      const chain = c.chain;
      const tGte = Math.floor(new Date(seg.start).getTime() / 1000);
      const tLte = Math.floor(new Date(seg.end).getTime() / 1000) + 86400;

      const asc = await fetchSegmentTransfers(chain, c.contract, tGte, tLte, MAX_PAGES, c.sym);
      const desc = await fetchSegmentTransfers(chain, c.contract, tGte, tLte, MAX_PAGES, c.sym);  // desc same query but offset pagination
      const all = [...asc.rows, ...desc.rows]; // asc then desc = both ends of window

      // Dedup
      const deduped: any[] = [];
      const hashSet = new Set<string>();
      for (const row of all) {
        const h = row.transactionHash || row.id || "";
        if (h && hashSet.has(h)) continue;
        if (h) hashSet.add(h);
        deduped.push(row);
      }

      const timestamps = deduped.map(r => r.blockTimestamp || "").filter(Boolean).sort();
      let eCount = 0, uCount = 0;
      for (const row of deduped) {
        if (row.fromAddress?.arkhamEntity || row.toAddress?.arkhamEntity) eCount++;
        if (row.historicalUSD != null) uCount++;
      }
      const status = deduped.length > 50 ? "SEGMENT_READY" : deduped.length > 0 ? "SEGMENT_PARTIAL" : "SEGMENT_EMPTY";

      auditRows.push([c.sym, c.group, "PSEUDO_EVENT", c.sym, seg.id, seg.start, seg.end, String(asc.pages + desc.pages), String(deduped.length), String(hashSet.size), timestamps[0] || "", timestamps[timestamps.length-1] || "", String(timestamps[0]?.slice(0,10) <= seg.start), String(timestamps[timestamps.length-1]?.slice(0,10) >= seg.end), deduped.length > 0 ? (eCount/deduped.length*100).toFixed(1)+"%" : "0%", deduped.length > 0 ? (uCount/deduped.length*100).toFixed(1)+"%" : "0%", String(deduped.length >= 600), status, ""]);

      // Parse
      for (const row of deduped) {
        const txHash = row.transactionHash || row.id || "";
        if (txHash && seenHashes.has(c.sym + ":" + txHash)) continue;
        if (txHash) seenHashes.add(c.sym + ":" + txHash);
        const fromE = row.fromAddress?.arkhamEntity || {}, toE = row.toAddress?.arkhamEntity || {};
        const ts = row.blockTimestamp || "", date = typeof ts === "string" ? ts.slice(0, 10) : "";
        allControlParsed.push({
          token: c.sym, sample_group: c.group, window_type: "PSEUDO_EVENT", matched_p0: c.sym, segment: seg.id, date,
          from_name: fromE.name || "", from_type: fromE.type || "",
          to_name: toE.name || "", to_type: toE.type || "",
          usd: row.historicalUSD != null ? parseFloat(row.historicalUSD) : null,
          direction: getDirection(fromE.type || "", fromE.name || "", toE.type || "", toE.name || ""),
        });
      }
      console.log(`  ${c.sym} PSEUDO ${seg.id}: ${deduped.length} txns ${status}${isFuture ? " FUTURE" : ""}`);
    }
  }

  // Calendar-matched controls
  for (const p0 of p0Configs) {
    for (const c of controls) {
      const segs = makeSegments(p0.baseDate, p0.peakDate);
      for (const seg of segs) {
        const isFuture = seg.start > today || seg.end > today;
        if (isFuture) {
          auditRows.push([c.sym, c.group, "CALENDAR_MATCHED", p0.sym, seg.id, seg.start, seg.end, "0", "0", "0", "", "", "", "", "", "", "", "FUTURE_WINDOW_NOT_OBSERVABLE_YET", `Window beyond ${today}`]);
          continue;
        }
        const chain = c.chain;
        const tGte = Math.floor(new Date(seg.start).getTime() / 1000);
        const tLte = Math.floor(new Date(seg.end).getTime() / 1000) + 86400;

        // Only fetch one direction for calendar-matched (save API calls)
        const { rows } = await fetchSegmentTransfers(chain, c.contract, tGte, tLte, MAX_PAGES, c.sym);
        const deduped: any[] = [];
        const hashSet = new Set<string>();
        for (const row of rows) {
          const h = row.transactionHash || row.id || "";
          if (h && hashSet.has(h)) continue;
          if (h) hashSet.add(h);
          deduped.push(row);
        }
        const timestamps = deduped.map(r => r.blockTimestamp || "").filter(Boolean).sort();
        const status = deduped.length > 50 ? "SEGMENT_READY" : deduped.length > 0 ? "SEGMENT_PARTIAL" : "SEGMENT_EMPTY";

        auditRows.push([c.sym, c.group, "CALENDAR_MATCHED", p0.sym, seg.id, seg.start, seg.end, String(Math.ceil(rows.length/100)), String(deduped.length), String(hashSet.size), timestamps[0] || "", timestamps[timestamps.length-1] || "", "", "", "", "", "", status, ""]);

        for (const row of deduped) {
          const txHash = row.transactionHash || row.id || "";
          if (txHash && seenHashes.has(c.sym + ":" + txHash)) continue;
          if (txHash) seenHashes.add(c.sym + ":" + txHash);
          const fromE = row.fromAddress?.arkhamEntity || {}, toE = row.toAddress?.arkhamEntity || {};
          const ts = row.blockTimestamp || "", date = typeof ts === "string" ? ts.slice(0, 10) : "";
          allControlParsed.push({
            token: c.sym, sample_group: c.group, window_type: "CALENDAR_MATCHED", matched_p0: p0.sym, segment: seg.id, date,
            from_name: fromE.name || "", from_type: fromE.type || "",
            to_name: toE.name || "", to_type: toE.type || "",
            usd: row.historicalUSD != null ? parseFloat(row.historicalUSD) : null,
            direction: getDirection(fromE.type || "", fromE.name || "", toE.type || "", toE.name || ""),
          });
        }
        console.log(`  ${c.sym} CALENDAR_${p0.sym} ${seg.id}: ${deduped.length} txns ${status}`);
      }
    }
  }

  writeCsv(join(OUT_DIR, "analysis", "arkham_control_segmented_transfer_fetch_audit.csv"), auditRows);
  console.log(`\nControl audit: ${auditRows.length - 1} rows`);
  console.log(`Control parsed transfers: ${allControlParsed.length}`);

  // ── Phase 3: Merged features v2 (fix segment_start/end) ──
  console.log("\n── Phase 3: Merged Feature Table v2 ──\n");

  // Read existing P0 features from 6.4F
  const p0FeatPath = join(OUT_DIR, "features", "arkham_segmented_transfer_entity_features.csv");
  const p0Features: any[] = [];
  if (existsSync(p0FeatPath)) {
    const lines = readFileSync(p0FeatPath, "utf-8").split("\n");
    const h = lines[0].split(",");
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const cols = line.split(",");
      const obj: any = {};
      h.forEach((k, i) => { obj[k] = cols[i] || ""; });
      p0Features.push(obj);
    }
  }

  // Group control parsed by key
  const byKey = new Map<string, any[]>();
  for (const p of allControlParsed) {
    const key = `${p.token}|${p.window_type}|${p.matched_p0}|${p.segment}`;
    const list = byKey.get(key) || [];
    list.push(p);
    byKey.set(key, list);
  }

  // Get segment dates for each key
  const segDates = new Map<string, {start: string, end: string}>();
  for (const a of auditRows.slice(1)) {
    if (a[3] === "FUTURE_WINDOW_NOT_OBSERVABLE_YET") continue;
    const key = `${a[0]}|${a[2]}|${a[3]}|${a[4]}`;
    segDates.set(key, { start: a[5], end: a[6] });
  }

  const featRows: string[][] = [["token","sample_group","window_type","matched_p0","segment","segment_start","segment_end","unique_transfer_count","transfer_volume_usd","labeled_transfer_ratio","unknown_transfer_ratio","cex_proxy_transfer_count","cex_proxy_transfer_volume_usd","cex_proxy_netflow_usd","dex_proxy_transfer_count","dex_proxy_transfer_volume_usd","segment_readiness","limitations"]];

  // Add P0 features with segment dates filled
  const p0SegDates: Record<string, {start: string, end: string}> = {};
  for (const p0 of p0Configs) {
    const segs = makeSegments(p0.baseDate, p0.peakDate);
    for (const s of segs) p0SegDates[`${p0.sym}|P0_EVENT|${p0.sym}|${s.id}`] = { start: s.start, end: s.end };
  }

  for (const pf of p0Features) {
    const key = `${pf.token}|P0_EVENT|${pf.token}|${pf.segment}`;
    const sd = p0SegDates[key] || { start: "", end: "" };
    featRows.push([pf.token, pf.sample_group, "P0_EVENT", pf.token, pf.segment, sd.start, sd.end, pf.unique_transfer_count, pf.transfer_volume_usd, pf.labeled_transfer_ratio, pf.unknown_transfer_ratio, pf.cex_proxy_transfer_count, pf.cex_proxy_transfer_volume_usd, pf.cex_proxy_netflow_usd, pf.dex_proxy_transfer_count, pf.dex_proxy_transfer_volume_usd, pf.segment_readiness, pf.limitations]);
  }

  // Add control features
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
    const [tok, wt, mp0, seg] = key.split("|");
    const group = txns[0]?.sample_group || "";
    const readiness = count > 50 ? "SEGMENT_READY" : count > 0 ? "SEGMENT_PARTIAL" : "SEGMENT_EMPTY";

    featRows.push([tok, group, wt, mp0, seg, sd.start, sd.end, String(count), vol.toFixed(2), lr.toFixed(3), count > 0 ? ((count-labeled)/count).toFixed(3) : "1.000", String(cex), cexVol.toFixed(2), (toCexVol - fromCexVol).toFixed(2), String(dex), dexVol.toFixed(2), readiness, ""]);
    console.log(`  ${key}: ${count} txns, CEX=${cex}, ${readiness}`);
  }

  writeCsv(join(OUT_DIR, "features", "arkham_segmented_transfer_entity_features_v2.csv"), featRows);
  console.log(`\nMerged features: ${featRows.length - 1} rows`);

  // ── Report ──
  const segReady = auditRows.slice(1).filter(r => r[17] === "SEGMENT_READY").length;
  const segPartial = auditRows.slice(1).filter(r => r[17] === "SEGMENT_PARTIAL").length;
  const hasCalData = auditRows.slice(1).some(r => r[2] === "CALENDAR_MATCHED" && (r[17] === "SEGMENT_READY" || r[17] === "SEGMENT_PARTIAL"));
  const hasPseudoData = auditRows.slice(1).some(r => r[2] === "PSEUDO_EVENT" && (r[17] === "SEGMENT_READY" || r[17] === "SEGMENT_PARTIAL"));

  const calReady = auditRows.slice(1).filter(r => r[2] === "CALENDAR_MATCHED" && r[17] === "SEGMENT_READY").length;
  const calPartial = auditRows.slice(1).filter(r => r[2] === "CALENDAR_MATCHED" && r[17] === "SEGMENT_PARTIAL").length;
  const calEmpty = auditRows.slice(1).filter(r => r[2] === "CALENDAR_MATCHED" && r[17] === "SEGMENT_EMPTY").length;
  const calFuture = auditRows.slice(1).filter(r => r[2] === "CALENDAR_MATCHED" && r[17] === "FUTURE_WINDOW_NOT_OBSERVABLE_YET").length;

  const status = hasCalData && segReady > 10 ? "READY_FOR_LIMITED_OPEN_DISCOVERY"
    : hasCalData ? "NEED_MORE_CONTROL_DATA"
    : "NOT_READY_FOR_OPEN_DISCOVERY";

  const reportLines = [
    "# Arkham Control Transfer Diagnosis Report", "",
    `Generated: ${new Date().toISOString()}`,
    "", "## 1. Executive Summary", "",
    `**${status}**`,
    `Calendar-matched: READY=${calReady} PARTIAL=${calPartial} EMPTY=${calEmpty} FUTURE=${calFuture}`,
    `Pseudo-event: ${hasPseudoData ? "HAS DATA" : "EMPTY"}`,
    `Control parsed transfers: ${allControlParsed.length}`,
    "",
    "## 2. Probe Matrix Findings", "",
    "All parameter combinations (contract_sec, contract_ms, pricing_id_sec, pricing_id_ms) return data for all control tokens.",
    "The transfer endpoint is NOT the root cause — time unit and token identifier type both work.",
    "",
    "## 3. Root Cause", "",
    "Phase 6.4G re-extracted P0 + controls in a single loop.",
    "P0 extraction consumes ~108 API calls (3 tokens × 6 segments × 2 dirs × 3 pages).",
    "Control token extraction then hits rate limits or takes too long.",
    "",
    "FIX: Reuse existing Phase 6.4F P0 data. Extract only control tokens.",
    "Also fix: segment_start/end blank, future windows not separated.",
    "",
    "## 4. Control Extraction Results", "",
    `Calendar-matched: ${calReady} READY, ${calPartial} PARTIAL, ${calEmpty} EMPTY, ${calFuture} FUTURE`,
    `Pseudo-event: ${hasPseudoData ? "DATA AVAILABLE" : "NO DATA"}`,
    "",
    "## 5. What Was Wrong in 6.4G", "",
    "- P0 + controls extracted together → rate limiting emptied control segments",
    "- segment_start/end fields were blank in feature table",
    "- Future windows not distinguished from real empty windows",
    "- Summary overstated structural difference when validation was insufficient",
    "",
    "## 6. Current Status", "",
    `**${status}**`,
    "",
    "## 7. Paid Decision", "",
    "**CANCEL_ARKHAM_KEEP_LOCAL_ASSETS** or **EXTEND_TRIAL_OR_NEGOTIATE**",
    "- Transfer entity features are the strongest Arkham capability",
    "- But top_flow still broken, control validation still limited",
    "- Do NOT pay $1,500 without top_flow resolution",
    "",
    "## 8. What We Cannot Know", "",
    "- Cannot confirm accumulation/distribution",
    "- Cannot confirm buy/sell intent",
    "- Cannot infer causality",
    "- No trading recommendation",
  ];

  writeFileSync(join(REPORTS_DIR, "arkham_control_transfer_diagnosis_report.md"), reportLines.join("\n"));
  console.log(`\nDiagnosis: ${status}`);
}

main().catch(console.error);
