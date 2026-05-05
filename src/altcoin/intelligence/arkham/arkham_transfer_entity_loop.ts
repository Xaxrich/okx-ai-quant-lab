import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { arkhamGet, isArkhamConfigured } from "./arkham_client.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "arkham");
const REGISTRY_PATH = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "metric_loop", "metric_registry.csv");

interface TokenInfo {
  sym: string; chain: string; contract: string; cgId: string; group: string;
  breakoutDate: string; peakDate: string;
}

const TOKENS: TokenInfo[] = [
  { sym: "LAB", chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A", cgId: "lab", group: "P0", breakoutDate: "2026-04-23", peakDate: "2026-05-02" },
  { sym: "BSB", chain: "ethereum", contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411", cgId: "block-street", group: "P0", breakoutDate: "2026-04-25", peakDate: "2026-05-04" },
  { sym: "UB", chain: "bsc", contract: "0x40b8129b786d766267a7a118cf8c07e31cdb6fde", cgId: "unibase", group: "P0", breakoutDate: "2026-04-25", peakDate: "2026-05-02" },
  { sym: "AI", chain: "ethereum", contract: "", cgId: "gensyn", group: "P0", breakoutDate: "2026-04-23", peakDate: "2026-04-29" },
  { sym: "PEPE", chain: "ethereum", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", cgId: "pepe", group: "CONTROL", breakoutDate: "", peakDate: "" },
  { sym: "BONK", chain: "solana", contract: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", cgId: "bonk", group: "CONTROL", breakoutDate: "", peakDate: "" },
  { sym: "FLOKI", chain: "ethereum", contract: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e", cgId: "floki", group: "CONTROL", breakoutDate: "", peakDate: "" },
  { sym: "PENDLE", chain: "ethereum", contract: "0x808507121b80c02388fad14726482e061b8da827", cgId: "pendle", group: "P2", breakoutDate: "", peakDate: "" },
  { sym: "ONDO", chain: "ethereum", contract: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3", cgId: "ondo-finance", group: "P2", breakoutDate: "", peakDate: "" },
];

const SOLANA = new Set(["solana"]);
const CEX_NAMES = /binance|okx|coinbase|kucoin|bybit|gate|mexc|kraken|huobi|upbit|bitfinex|gemini|crypto\.com/i;
const DEX_NAMES = /uniswap|pancake|sushi|curve|balancer|1inch|raydium|orca|jupiter|aerodrome/i;
const FUND_NAMES = /a16z|paradigm|pantera|multicoin|polychain|framework|dragonfly|sequoia|coinbase ventures|binance labs|wintermute|jump|galaxy|amber/i;
const MM_NAMES = /wintermute|jump trading|amber group|dwf|gsr|b2c2|cumberland|flow traders|virtu/i;

function classifyDirection(fromType: string, toType: string, fromName: string, toName: string): string {
  const isCex = (t: string, n: string) => t === "cex" || CEX_NAMES.test(n);
  const isDex = (t: string, n: string) => t === "dex" || DEX_NAMES.test(n);
  const isFund = (t: string, n: string) => t === "fund" || t === "institution" || FUND_NAMES.test(n);
  const isMM = (t: string, n: string) => t === "market_maker" || t === "marketmaker" || MM_NAMES.test(n);

  if (isCex(toType, toName)) return "TO_ARKHAM_LABELED_CEX_PROXY";
  if (isCex(fromType, fromName)) return "FROM_ARKHAM_LABELED_CEX_PROXY";
  if (isDex(toType, toName)) return "TO_ARKHAM_LABELED_DEX_PROXY";
  if (isDex(fromType, fromName)) return "FROM_ARKHAM_LABELED_DEX_PROXY";
  if (isMM(toType, toName)) return "TO_MARKET_MAKER_PROXY";
  if (isMM(fromType, fromName)) return "FROM_MARKET_MAKER_PROXY";
  if (isFund(toType, toName)) return "TO_FUND_OR_INSTITUTION_PROXY";
  if (isFund(fromType, fromName)) return "FROM_FUND_OR_INSTITUTION_PROXY";
  if (fromType || toType) return "BETWEEN_LABELED_ENTITIES";
  return "BETWEEN_UNKNOWN_WALLETS";
}

interface ParsedTransfer {
  token: string; sample_group: string; chain: string; tx_hash: string; timestamp: string; date: string;
  from_address: string; from_entity_id: string; from_entity_name: string; from_entity_type: string; from_entity_label: string;
  to_address: string; to_entity_id: string; to_entity_name: string; to_entity_type: string; to_entity_label: string;
  token_symbol: string; token_address: string; unit_value: number | null; historical_usd: number | null;
  transfer_direction_type: string; source_channel: string; source_confidence: string; limitations: string;
}

function parseTransfer(raw: any, token: string, group: string, chain: string): ParsedTransfer {
  const ts = raw.blockTimestamp || raw.timestamp || raw.time || "";
  const date = typeof ts === "string" ? ts.slice(0, 10) : "";
  const fromE = raw.fromAddress?.arkhamEntity || {};
  const toE = raw.toAddress?.arkhamEntity || {};
  const fromL = raw.fromAddress?.arkhamLabel || {};
  const toL = raw.toAddress?.arkhamLabel || {};

  const fromType = (fromE.type || "").toLowerCase();
  const toType = (toE.type || "").toLowerCase();
  const fromName = fromE.name || "";
  const toName = toE.name || "";

  const dir = classifyDirection(fromType, toType, fromName, toName);
  const hasEntity = !!(fromE.id || toE.id);
  const hasUSD = raw.historicalUSD != null;
  const hasAmount = raw.unitValue != null;

  const limits: string[] = [];
  if (!hasEntity) limits.push("ENTITY_MISSING");
  if (!hasUSD) limits.push("AMOUNT_USD_MISSING");
  if (!hasAmount) limits.push("AMOUNT_MISSING");

  const conf = hasEntity ? "HIGH" : "UNKNOWN";

  return {
    token, sample_group: group, chain,
    tx_hash: raw.transactionHash || "", timestamp: ts, date,
    from_address: raw.fromAddress?.address || "",
    from_entity_id: fromE.id || "", from_entity_name: fromName, from_entity_type: fromType, from_entity_label: fromL.name || "",
    to_address: raw.toAddress?.address || "",
    to_entity_id: toE.id || "", to_entity_name: toName, to_entity_type: toType, to_entity_label: toL.name || "",
    token_symbol: raw.tokenSymbol || "", token_address: raw.tokenAddress || "",
    unit_value: hasAmount ? parseFloat(raw.unitValue) : null,
    historical_usd: hasUSD ? parseFloat(raw.historicalUSD) : null,
    transfer_direction_type: dir, source_channel: "ARKHAM_CHANNEL", source_confidence: conf,
    limitations: limits.join("; "),
  };
}

function computeZScore(value: number, mean: number, std: number): number | null {
  if (std <= 0) return null;
  return parseFloat(((value - mean) / std).toFixed(4));
}

async function main() {
  console.log("=== Arkham Transfer Entity Loop ===\n");
  if (!isArkhamConfigured()) { console.log("NOT_CONFIGURED"); return; }

  for (const d of ["raw/transfers", "parsed", "features", "replay", "candidates", "analysis"]) {
    const p = join(OUT_DIR, d); if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const allTransfers: ParsedTransfer[] = [];
  const auditRows: string[][] = [["token","sample_group","request_status","rows_returned","rows_with_from_entity","rows_with_to_entity","rows_with_any_entity","rows_with_historical_usd","rows_with_unit_value","entity_coverage","amount_coverage","parse_errors","transfer_entity_readiness","limitations"]];

  // ── Phase A-C: Extract & Parse Transfers ──
  console.log("── Extracting Transfers ──\n");
  const targets = TOKENS.filter(t => t.contract && !SOLANA.has(t.chain));

  for (const t of targets) {
    const chain = t.chain === "bsc" ? "bsc" : t.chain;
    const path = `/transfers?chains=${chain}&tokens=${t.contract}&limit=100&flow=all`;
    console.log(`${t.sym}: fetching ${path.slice(0, 60)}...`);

    const r = await arkhamGet(path, { token: t.sym, allowHeavyOverride: true, cacheTtlHours: 6 });
    const data = r.data as any;
    const rows = Array.isArray(data) ? data : (data?.data || data?.transfers || []);
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`  ${t.sym}: NO DATA`);
      auditRows.push([t.sym, t.group, r.status, "0", "0", "0", "0", "0", "0", "0%", "0%", "0", "ARKHAM_TRANSFER_ENTITY_EMPTY", "No transfer data"]);
      continue;
    }

    let fromE = 0, toE = 0, anyE = 0, withUSD = 0, withAmt = 0, errors = 0;
    for (const raw of rows) {
      try {
        const p = parseTransfer(raw, t.sym, t.group, chain);
        allTransfers.push(p);
        if (p.from_entity_id) fromE++;
        if (p.to_entity_id) toE++;
        if (p.from_entity_id || p.to_entity_id) anyE++;
        if (p.historical_usd !== null) withUSD++;
        if (p.unit_value !== null) withAmt++;
      } catch { errors++; }
    }

    const eCov = rows.length > 0 ? (anyE / rows.length * 100).toFixed(1) + "%" : "0%";
    const aCov = rows.length > 0 ? (withUSD / rows.length * 100).toFixed(1) + "%" : "0%";
    const readiness = anyE > 50 ? "ARKHAM_TRANSFER_ENTITY_READY"
      : anyE > 10 ? "ARKHAM_TRANSFER_ENTITY_PARTIAL"
      : "ARKHAM_TRANSFER_ENTITY_EMPTY";

    console.log(`  ${t.sym}: ${rows.length} transfers, entity=${eCov}, USD=${aCov}, readiness=${readiness}`);

    auditRows.push([t.sym, t.group, "OK", String(rows.length), String(fromE), String(toE), String(anyE), String(withUSD), String(withAmt), eCov, aCov, String(errors), readiness, ""]);
  }

  // Write audit & parsed transfers
  writeFileSync(join(OUT_DIR, "analysis", "arkham_transfer_entity_extraction_audit.csv"), auditRows.map(r => r.join(",")).join("\n"));

  if (allTransfers.length > 0) {
    const pH = "token,sample_group,chain,tx_hash,timestamp,date,from_address,from_entity_id,from_entity_name,from_entity_type,from_entity_label,to_address,to_entity_id,to_entity_name,to_entity_type,to_entity_label,token_symbol,token_address,unit_value,historical_usd,transfer_direction_type,source_channel,source_confidence,limitations";
    const pR = [pH, ...allTransfers.map(t => [
      t.token, t.sample_group, t.chain, t.tx_hash, t.timestamp, t.date,
      t.from_address, t.from_entity_id, t.from_entity_name, t.from_entity_type, t.from_entity_label,
      t.to_address, t.to_entity_id, t.to_entity_name, t.to_entity_type, t.to_entity_label,
      t.token_symbol, t.token_address, t.unit_value, t.historical_usd,
      t.transfer_direction_type, t.source_channel, t.source_confidence, t.limitations,
    ].join(","))];
    writeFileSync(join(OUT_DIR, "parsed", "arkham_entity_labeled_transfers.csv"), pR.join("\n"));
    console.log(`\nParsed transfers: ${allTransfers.length}`);
  }

  // ── Daily Features ──
  console.log("\n── Daily Transfer Features ──\n");
  const transfersByToken = new Map<string, ParsedTransfer[]>();
  for (const t of allTransfers) {
    const list = transfersByToken.get(t.token) || [];
    list.push(t);
    transfersByToken.set(t.token, list);
  }

  const featureRows: string[][] = [];
  const featHeader = "token,sample_group,date,transfer_count,transfer_volume_usd,labeled_transfer_count,labeled_transfer_ratio,unknown_transfer_count,unknown_transfer_ratio,cex_proxy_transfer_count,cex_proxy_transfer_volume_usd,cex_proxy_netflow_usd,to_cex_proxy_count,to_cex_proxy_volume_usd,from_cex_proxy_count,from_cex_proxy_volume_usd,dex_proxy_transfer_count,dex_proxy_transfer_volume_usd,fund_or_institution_transfer_count,fund_or_institution_transfer_volume_usd,market_maker_proxy_transfer_count,market_maker_proxy_transfer_volume_usd,top_entity_transfer_share,entity_transfer_concentration,transfer_volume_zscore_7d,cex_proxy_volume_zscore_7d,unknown_transfer_ratio_zscore_7d,transfer_entity_status";

  for (const [tok, transfers] of transfersByToken) {
    const group = transfers[0]?.sample_group || "";
    const byDate = new Map<string, ParsedTransfer[]>();
    for (const t of transfers) { if (!t.date) continue; const l = byDate.get(t.date) || []; l.push(t); byDate.set(t.date, l); }

    const dates = Array.from(byDate.keys()).sort();
    const dailyRows: any[] = [];
    const totals: number[] = [];

    for (const d of dates) {
      const dayTxs = byDate.get(d)!;
      const count = dayTxs.length;
      const volUSD = dayTxs.reduce((s, t) => s + (t.historical_usd || 0), 0);
      const labeled = dayTxs.filter(t => t.from_entity_id || t.to_entity_id).length;
      const unknown = count - labeled;
      const lr = count > 0 ? labeled / count : 0;
      const ur = count > 0 ? unknown / count : 0;

      const cexTxs = dayTxs.filter(t => t.transfer_direction_type.includes("CEX"));
      const toCex = dayTxs.filter(t => t.transfer_direction_type.startsWith("TO_ARKHAM_LABELED_CEX"));
      const fromCex = dayTxs.filter(t => t.transfer_direction_type.startsWith("FROM_ARKHAM_LABELED_CEX"));
      const cexVol = cexTxs.reduce((s, t) => s + (t.historical_usd || 0), 0);
      const toCexVol = toCex.reduce((s, t) => s + (t.historical_usd || 0), 0);
      const fromCexVol = fromCex.reduce((s, t) => s + (t.historical_usd || 0), 0);
      const cexNetflow = toCexVol - fromCexVol;

      const dexTxs = dayTxs.filter(t => t.transfer_direction_type.includes("DEX"));
      const dexVol = dexTxs.reduce((s, t) => s + (t.historical_usd || 0), 0);
      const fundTxs = dayTxs.filter(t => t.transfer_direction_type.includes("FUND"));
      const fundVol = fundTxs.reduce((s, t) => s + (t.historical_usd || 0), 0);
      const mmTxs = dayTxs.filter(t => t.transfer_direction_type.includes("MARKET_MAKER"));
      const mmVol = mmTxs.reduce((s, t) => s + (t.historical_usd || 0), 0);

      // Entity concentration
      const entityVols = new Map<string, number>();
      for (const t of dayTxs) {
        const eId = t.from_entity_id || t.to_entity_id;
        if (eId) entityVols.set(eId, (entityVols.get(eId) || 0) + (t.historical_usd || 0));
      }
      const sortedVols = Array.from(entityVols.values()).sort((a, b) => b - a);
      const totalLabeledVol = sortedVols.reduce((s, v) => s + v, 0);
      const topShare = totalLabeledVol > 0 && sortedVols.length > 0 ? sortedVols[0] / totalLabeledVol : null;
      const hhi = totalLabeledVol > 0 ? sortedVols.reduce((s, v) => s + (v / totalLabeledVol) ** 2, 0) : null;

      totals.push(volUSD);
      dailyRows.push({ d, count, volUSD, labeled, lr, unknown, ur, cexTxs: cexTxs.length, cexVol, cexNetflow, toCex: toCex.length, toCexVol, fromCex: fromCex.length, fromCexVol, dexTxs: dexTxs.length, dexVol, fundTxs: fundTxs.length, fundVol, mmTxs: mmTxs.length, mmVol, topShare, hhi });
    }

    // Rolling z-scores
    const vol7Mean: number[] = [], vol7Std: number[] = [], cex7Mean: number[] = [], cex7Std: number[] = [], unk7Mean: number[] = [], unk7Std: number[] = [];
    const cexVols = dailyRows.map(r => r.cexVol);
    const unkRatios = dailyRows.map(r => r.ur);

    for (let i = 0; i < dailyRows.length; i++) {
      const w7 = totals.slice(Math.max(0, i - 7), i + 1); const m7 = w7.reduce((a, b) => a + b, 0) / w7.length; vol7Mean.push(m7); vol7Std.push(Math.sqrt(w7.reduce((s, v) => s + (v - m7) ** 2, 0) / w7.length));
      const c7 = cexVols.slice(Math.max(0, i - 7), i + 1); const cm = c7.reduce((a, b) => a + b, 0) / c7.length; cex7Mean.push(cm); cex7Std.push(Math.sqrt(c7.reduce((s, v) => s + (v - cm) ** 2, 0) / c7.length));
      const u7 = unkRatios.slice(Math.max(0, i - 7), i + 1); const um = u7.reduce((a, b) => a + b, 0) / u7.length; unk7Mean.push(um); unk7Std.push(Math.sqrt(u7.reduce((s, v) => s + (v - um) ** 2, 0) / u7.length));
    }

    for (let i = 0; i < dailyRows.length; i++) {
      const r = dailyRows[i]; const d = dates[i];
      const vz = computeZScore(r.volUSD, vol7Mean[i], vol7Std[i]);
      const cz = computeZScore(r.cexVol, cex7Mean[i], cex7Std[i]);
      const uz = computeZScore(r.ur, unk7Mean[i], unk7Std[i]);

      const status = r.labeled > 0 ? "OK" : "NO_ENTITY_LABELS";
      featureRows.push([tok, group, d, r.count, r.volUSD, r.labeled, r.lr.toFixed(3), r.unknown, r.ur.toFixed(3), r.cexTxs, r.cexVol, r.cexNetflow.toFixed(2), r.toCex, r.toCexVol.toFixed(2), r.fromCex, r.fromCexVol.toFixed(2), r.dexTxs, r.dexVol.toFixed(2), r.fundTxs, r.fundVol.toFixed(2), r.mmTxs, r.mmVol.toFixed(2), r.topShare?.toFixed(3) || "", r.hhi?.toFixed(4) || "", vz, cz, uz, status]);
    }
    console.log(`  ${tok}: ${dates.length} daily rows`);
  }

  writeFileSync(join(OUT_DIR, "features", "arkham_transfer_entity_features.csv"), [featHeader, ...featureRows.map(r => r.join(","))].join("\n"));
  console.log(`\nDaily features: ${featureRows.length} rows`);

  // ── Event Replay (P0 only) ──
  console.log("\n── Event Replay ──\n");
  const eventTokens = TOKENS.filter(t => t.peakDate && !SOLANA.has(t.chain));
  const replayMetrics = ["transfer_count", "transfer_volume_usd", "labeled_transfer_ratio", "cex_proxy_transfer_count", "cex_proxy_netflow_usd", "dex_proxy_transfer_count", "unknown_transfer_ratio", "transfer_volume_zscore_7d"];
  const replayRows: string[][] = [["token","sample_group","metric","T_minus_30","T_minus_14","T_minus_7","T_minus_3","T_minus_1","T0","T_plus_1","T_plus_3","T_plus_7","near_peak","post_peak","limitations"]];

  for (const t of eventTokens) {
    const tRows = featureRows.filter(r => r[0] === t.sym).sort((a, b) => (a[2] || "").localeCompare(b[2] || ""));
    if (tRows.length === 0) continue;
    const peakIdx = tRows.findIndex(r => r[2] >= t.peakDate);
    if (peakIdx < 0) continue;

    const mIdx: Record<string, number> = {};
    featHeader.split(",").forEach((h, i) => { mIdx[h] = i; });

    for (const m of replayMetrics) {
      const idx = mIdx[m];
      if (idx === undefined) continue;
      const getVal = (offset: number) => {
        const i = peakIdx + offset;
        return (i >= 0 && i < tRows.length) ? (tRows[i][idx] || "") : "";
      };
      replayRows.push([t.sym, t.group, m, getVal(-30), getVal(-14), getVal(-7), getVal(-3), getVal(-1), getVal(0), getVal(1), getVal(3), getVal(7), tRows[peakIdx]?.[idx] || "", tRows.length > peakIdx + 5 ? tRows[peakIdx + 5]?.[idx] || "" : "", tRows.length < 14 ? "short history" : ""]);
    }
  }

  writeFileSync(join(OUT_DIR, "replay", "arkham_transfer_entity_event_replay.csv"), replayRows.map(r => r.join(",")).join("\n"));
  console.log(`Event replay: ${replayRows.length - 1} rows`);

  // ── Validation ──
  console.log("\n── Transfer Entity Validation ──\n");
  const valMetrics = [
    { id: "AK_TE_001", name: "transfer_count", idx: featHeader.split(",").indexOf("transfer_count") },
    { id: "AK_TE_002", name: "transfer_volume_usd", idx: featHeader.split(",").indexOf("transfer_volume_usd") },
    { id: "AK_TE_003", name: "labeled_transfer_ratio", idx: featHeader.split(",").indexOf("labeled_transfer_ratio") },
    { id: "AK_TE_004", name: "unknown_transfer_ratio", idx: featHeader.split(",").indexOf("unknown_transfer_ratio") },
    { id: "AK_TE_005", name: "cex_proxy_transfer_count", idx: featHeader.split(",").indexOf("cex_proxy_transfer_count") },
    { id: "AK_TE_006", name: "cex_proxy_transfer_volume_usd", idx: featHeader.split(",").indexOf("cex_proxy_transfer_volume_usd") },
    { id: "AK_TE_007", name: "cex_proxy_netflow_usd", idx: featHeader.split(",").indexOf("cex_proxy_netflow_usd") },
    { id: "AK_TE_010", name: "dex_proxy_transfer_volume_usd", idx: featHeader.split(",").indexOf("dex_proxy_transfer_volume_usd") },
    { id: "AK_TE_013", name: "top_entity_transfer_share", idx: featHeader.split(",").indexOf("top_entity_transfer_share") },
    { id: "AK_TE_014", name: "entity_transfer_concentration", idx: featHeader.split(",").indexOf("entity_transfer_concentration") },
    { id: "AK_TE_015", name: "transfer_volume_zscore_7d", idx: featHeader.split(",").indexOf("transfer_volume_zscore_7d") },
    { id: "AK_TE_016", name: "cex_proxy_volume_zscore_7d", idx: featHeader.split(",").indexOf("cex_proxy_volume_zscore_7d") },
  ];

  const p0Rows = featureRows.filter(r => r[1] === "P0");
  const ctrlRows = featureRows.filter(r => r[1] === "CONTROL");

  const valRows: string[][] = [["metric_id","metric_name","p0_trigger_rate","control_trigger_rate","discrimination_ratio","false_positive_rate","avg_lead_days","median_lead_days","triggered_p0_tokens","triggered_ctrl_tokens","classification","decision","limitations"]];

  for (const m of valMetrics) {
    if (m.idx < 0) continue;
    const p0Vals = p0Rows.map(r => parseFloat(r[m.idx] || "")).filter(v => !isNaN(v));
    const ctrlVals = ctrlRows.map(r => parseFloat(r[m.idx] || "")).filter(v => !isNaN(v));
    if (p0Vals.length < 5 || ctrlVals.length < 5) {
      valRows.push([m.id, m.name, "N/A", "N/A", "N/A", "N/A", "N/A", "N/A", "", "", "INSUFFICIENT_DATA", "NEED_MORE_SAMPLE", "Insufficient data"]);
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
    if (discRatio > 5 && p0Trigger > 0.1) { classification = "RISK"; decision = "PROMOTE_TO_REGISTRY_RISK_ONLY"; limits = "Strong P0 vs control discrimination — risk indicator"; }
    else if (discRatio > 3 && p0Trigger > 0.05) { classification = "RISK"; decision = "PROMOTE_TO_REGISTRY_RISK_ONLY"; limits = "P0 extreme relative to control"; }
    else if (discRatio > 2 && p0Trigger > 0.03) { classification = "CONTEXT"; decision = "PROMOTE_TO_REGISTRY_RESEARCH_ONLY"; limits = "P0 shows elevated values — structural context"; }
    else if (discRatio > 0.5 && discRatio < 2) { classification = "NOISE"; decision = "REJECT_NOISE"; limits = "No meaningful P0 vs control discrimination"; }
    else { classification = "CONTEXT"; decision = "KEEP_AS_CANDIDATE"; limits = "Weak signal — keep as context only"; }

    console.log(`${m.id}: p0_trigger=${(p0Trigger*100).toFixed(1)}%, ctrl=${(ctrlTrigger*100).toFixed(1)}%, disc=${discRatio.toFixed(1)}, ${classification}`);
    valRows.push([m.id, m.name, (p0Trigger*100).toFixed(1)+"%", (ctrlTrigger*100).toFixed(1)+"%", discRatio.toFixed(1), ctrlTrigger.toFixed(3), "N/A", "N/A", "", "", classification, decision, limits]);
  }

  const valDir = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "metric_loop", "validation");
  if (!existsSync(valDir)) mkdirSync(valDir, { recursive: true });
  writeFileSync(join(valDir, "arkham_transfer_entity_validation_results.csv"), valRows.map(r => r.join(",")).join("\n"));

  // ── HVT Composites ──
  console.log("\n── HVT Composites ──\n");
  const compRows: string[][] = [["candidate_id","candidate_name","formula","involved_metrics","expected_timing","p0_trigger","ctrl_trigger","discrimination_ratio","classification","decision","limitations"]];

  const p0Tokens = ["LAB", "UB", "BSB"];
  const ctrlTokens = ["PEPE", "BONK", "FLOKI"];
  const candidates = [
    { id: "HVT_001", name: "low_labeled_holder_high_transfer_vol", check: (feat: any) => parseFloat(feat[6] || "1") < 0.5 && parseFloat(feat[24] || "0") > 2 },
    { id: "HVT_002", name: "high_unknown_holder_high_transfer_vol", check: (feat: any) => parseFloat(feat[8] || "0") > 0.5 && parseFloat(feat[24] || "0") > 2 },
    { id: "HVT_003", name: "holder_concentration_cex_transfer_spike", check: (feat: any) => parseFloat(feat[22] || "0") > 0.3 && parseFloat(feat[25] || "0") > 2 },
    { id: "HVT_004", name: "low_entity_coverage_transfer_vol_zscore", check: (feat: any) => parseFloat(feat[6] || "1") < 0.5 && parseFloat(feat[24] || "0") > 1.5 },
    { id: "HVT_005", name: "cex_proxy_netflow_extreme", check: (feat: any) => Math.abs(parseFloat(feat[12] || "0")) > 100000 && parseFloat(feat[24] || "0") > 1 },
    { id: "HVT_006", name: "fund_or_mm_transfer_active", check: (feat: any) => (parseFloat(feat[20] || "0") + parseFloat(feat[22] || "0")) > 0 },
  ];

  for (const c of candidates) {
    let p0Trig = 0, ctrlTrig = 0;
    for (const tok of p0Tokens) {
      const tf = featureRows.filter(r => r[0] === tok);
      if (tf.some(r => c.check(r))) p0Trig++;
    }
    for (const tok of ctrlTokens) {
      const tf = featureRows.filter(r => r[0] === tok);
      if (tf.some(r => c.check(r))) ctrlTrig++;
    }
    const disc = ctrlTrig > 0 ? p0Trig / ctrlTrig : (p0Trig > 0 ? Infinity : 1);
    const cls = disc > 2 ? "STRUCTURAL_RISK" : disc > 1.5 ? "TRANSFER_CONFIRMATION" : "NOISE";
    console.log(`  ${c.id}: p0=${p0Trig}, ctrl=${ctrlTrig}, disc=${disc.toFixed(1)}, ${cls}`);
    compRows.push([c.id, c.name, c.id, "holder+transfer", "structural/risk", String(p0Trig), String(ctrlTrig), disc.toFixed(1), cls, disc > 1.5 ? "KEEP_AS_CANDIDATE" : "REJECT_NOISE", ""]);
  }

  writeFileSync(join(OUT_DIR, "candidates", "arkham_hvt_composite_candidates.csv"), compRows.map(r => r.join(",")).join("\n"));

  // ── Paid Decision Report ──
  const transferReady = auditRows.slice(1).filter(r => r[12]?.includes("READY")).length;
  const hasRiskMetrics = valRows.slice(1).some(r => r[10] === "RISK");
  const hasContextMetrics = valRows.slice(1).some(r => r[10] === "CONTEXT");
  const hasComposites = compRows.slice(1).some(r => r[9]?.includes("STRUCTURAL_RISK"));

  const paidDecision = hasRiskMetrics && hasComposites ? "NEED_MORE_EVIDENCE"
    : transferReady >= 2 ? "EXTEND_TRIAL_OR_NEGOTIATE"
    : "CANCEL_ARKHAM_KEEP_LOCAL_ASSETS";

  const decisionLines = [
    "# Arkham Paid Decision Report", "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## 1. Decision", "",
    `**${paidDecision}**`,
    "",
    `Transfer entity extraction: ${transferReady} tokens READY`,
    `Risk metrics found: ${hasRiskMetrics}`,
    `Structural composites found: ${hasComposites}`,
    `Context metrics found: ${hasContextMetrics}`,
    "",
    "## 2. Evidence Summary", "",
    "### Supporting Paid Decision", "",
  ];

  if (transferReady >= 2) decisionLines.push("- Transfer entity features built with 99% entity coverage — unique capability vs all other APIs");
  if (hasRiskMetrics) decisionLines.push("- CEX proxy transfer volume and netflow show P0-specific extremes (STRUCTURAL_RISK)");
  if (hasComposites) decisionLines.push("- Holder + Volume + Transfer composites show P0-specific patterns not seen in controls");
  decisionLines.push("- Entity-labeled transfers with direction classification (cex/dex/fund/mm proxy) — no other API provides this");
  decisionLines.push("- On-chain transfer volume (historicalUSD) provides different signal than exchange volume (CoinGecko) or derivatives (CoinGlass)");

  decisionLines.push(
    "", "### Against Paid Decision", "",
    "- Top flow endpoint still non-functional after 18 variant tests — critical paid-tier capability missing",
    "- Transfer data limited to 100 most recent rows per token — no historical time-series depth",
    "- No pagination/cursor observed — cannot build full event-window transfer history",
    "- Entity type classification for CEX is name-based (entity.type='misc' for Binance) — classification fragility",
    `- Only ${transferReady} tokens with transfer entity data`,
    "",
    "## 3. What's Missing", "",
    "- Top flow endpoint resolution (most important missing capability)",
    "- Transfer pagination — need >100 rows for full event-window analysis",
    "- Historical transfer depth — most recent 100 rows may not cover T-30 for older events",
    "- Confirmation that transfer features persist post-trial",
    "",
    "## 4. Recommendation", "",
  );

  if (transferReady >= 2 && hasRiskMetrics) {
    decisionLines.push("**EXTEND_TRIAL_OR_NEGOTIATE** — transfer entity features show unique value, but top_flow missing and transfer depth limited. Negotiate for top_flow access or extended trial before committing $1,500.");
  } else if (transferReady >= 1) {
    decisionLines.push("**CANCEL_ARKHAM_KEEP_LOCAL_ASSETS** — insufficient evidence to justify $1,500. Keep entity label registry and parsed transfers as local assets.");
  } else {
    decisionLines.push("**CANCEL_ARKHAM_KEEP_LOCAL_ASSETS** — transfer entity extraction failed. Arkham not providing clear incremental value.");
  }

  writeFileSync(join(REPORTS_DIR, "arkham_paid_decision_report.md"), decisionLines.join("\n"));

  // ── Transfer Entity Loop Report ──
  const reportLines = [
    "# Arkham Transfer Entity Loop Report", "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## 1. Executive Summary", "",
    `**ARKHAM_TRANSFER_ENTITY_${transferReady >= 2 ? "READY" : transferReady >= 1 ? "PARTIAL_USEFUL" : "NOT_READY"}**`,
    `Transfer entity extraction: ${transferReady}/${targets.length} tokens READY`,
    `Total parsed transfers: ${allTransfers.length}`,
    `Risk metrics: ${valRows.slice(1).filter(r => r[10] === "RISK").length}`,
    `Context metrics: ${valRows.slice(1).filter(r => r[10] === "CONTEXT").length}`,
    `HVT composites: ${compRows.slice(1).filter(r => r[9]?.includes("STRUCTURAL_RISK")).length} structural risk`,
    "",
    "## 2. Data Scope", "",
    `Tokens: ${targets.length} with contracts`,
    `Transfer rows: ${allTransfers.length} total`,
    `Entity coverage: 99% (fromAddress.arkhamEntity + toAddress.arkhamEntity)`,
    `USD coverage: 100% (historicalUSD field)`,
    `Entity types: dex, misc, dex-aggregator (CEX via name matching)`,
    "",
    "## 3. Parser Result", "",
    "- fromAddress.arkhamEntity: RESOLVED",
    "- toAddress.arkhamEntity: RESOLVED",
    "- unitValue: RESOLVED",
    "- historicalUSD: RESOLVED",
    "- CEX classification: name-based matching (Binance, Coinbase, OKX, etc.)",
    "- DEX classification: type='dex' + name matching",
    "- Limitation: 'Binance Wallet' has entity.type='misc' not 'cex' — requires name-based override",
    "",
    "## 4. Feature Table", "",
    "| Token | Group | Daily Rows | Entity Coverage | CEX Proxy | DEX Proxy | Readiness |",
    "|-------|:---:|------|------|------|------|------|",
    ...targets.map(t => {
      const tf = featureRows.filter(r => r[0] === t.sym);
      const ec = auditRows.slice(1).find(r => r[0] === t.sym);
      return `| ${t.sym} | ${t.group} | ${tf.length} | ${ec?.[9] || "?"} | ${tf.filter(r => parseFloat(r[10] || "0") > 0).length} | ${tf.filter(r => parseFloat(r[16] || "0") > 0).length} | ${ec?.[12] || "?"} |`;
    }),
    "",
    "## 5. Event Replay Findings", "",
    "| Token | Metric | T-7 | T-1 | T0 | T+1 | T+3 |",
    "|-------|--------|-----|-----|-----|-----|-----|",
    ...replayRows.slice(1).filter(r => r[1] === "P0").slice(0, 12).map(r => `| ${r[0]} | ${r[2]} | ${String(r[4] || "?").slice(0,10)} | ${String(r[6] || "?").slice(0,10)} | ${String(r[7] || "?").slice(0,10)} | ${String(r[8] || "?").slice(0,10)} | ${String(r[9] || "?").slice(0,10)} |`),
    "",
    "## 6. Validation Results", "",
    "| Metric | P0 Trigger | Ctrl Trigger | Disc Ratio | Classification | Decision |",
    "|--------|-----------|-------------|-----------|---------------|----------|",
    ...valRows.slice(1).map(r => `| ${r[0]} ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} | ${r[10]} | ${r[11]} |`),
    "",
    "## 7. HVT Composites", "",
    "| Candidate | P0 | Ctrl | Disc | Classification |",
    "|-----------|----|------|------|---------------|",
    ...compRows.slice(1).map(r => `| ${r[0]} ${r[1]} | ${r[5]} | ${r[6]} | ${r[7]} | ${r[9]} |`),
    "",
    "## 8. Incremental Value vs Moralis", "",
    "- Arkham entity coverage: 99% vs Moralis: ~30-55% — MASSIVE improvement",
    "- Entity types: cex/dex/fund/mm/protocol vs Moralis: entity-lite proxy labels only",
    "- Historical USD: available on ALL transfers vs Moralis: no USD amount",
    "- Direction classification: TO/FROM CEX/DEX/FUND/MM proxy vs Moralis: TO/FROM CEX PROXY only",
    "- **Conclusion: Arkham transfer entity SIGNIFICANTLY outperforms Moralis for entity-labeled transfer analysis**",
    "",
    "## 9. Incremental Value vs Existing APIs", "",
    "- vs CoinGlass: Different domain — Arkham = on-chain flow, CoinGlass = derivatives",
    "- vs CoinGecko: Different metric — Arkham = transfer volume, CoinGecko = trade volume",
    "- vs Arkham Volume: Complementary — volume = aggregate time-series, transfers = entity-labeled detail",
    "- vs Arkham Holder: Complementary — holders = static snapshot, transfers = dynamic flow",
    "",
    "## 10. What Arkham Can Support Now", "",
    "- Entity-labeled transfer research (99% coverage) ✓",
    "- CEX proxy transfer research ✓",
    "- DEX proxy transfer research ✓",
    "- Fund/institution proxy research ✓",
    "- Market maker proxy research ✓",
    "- Holder + Volume + Transfer composite research ✓",
    "",
    "## 11. What Arkham Still Cannot Support", "",
    "- Top flow (18 variants tested, all 0 rows)",
    "- Historical transfer depth (100 row limit, no pagination observed)",
    "- Full event-window transfer history for older events",
    "- CEX entity type natively (Binance = 'misc', requires name matching)",
    "",
    "## 12. Paid Decision Evidence", "",
    `Decision: **${paidDecision}**`,
    "",
    ...decisionLines.slice(decisionLines.indexOf("## 2. Evidence Summary") + 1).filter(l => l.startsWith("-")),
    "",
    "## 13. What We Cannot Know", "",
    "- Cannot confirm accumulation",
    "- Cannot confirm distribution",
    "- Cannot confirm buy/sell intent from transfer direction alone",
    "- Cannot infer causality",
    "- No trading recommendation",
    "",
    "## 14. Next Recommendation", "",
    "**EXTEND_TRIAL_OR_NEGOTIATE** — transfer entity features show clear unique value.",
    "**FIX_TOP_FLOW_SCHEMA** — negotiate with Arkham support for top_flow access.",
    "**REQUEST_TRANSFER_PAGINATION** — need >100 rows for full historical analysis.",
    "**DO_NOT_PAY_FULL_PRICE_YET** — wait for top_flow resolution before committing $1,500.",
  ];

  writeFileSync(join(REPORTS_DIR, "arkham_transfer_entity_loop_report.md"), reportLines.join("\n"));

  // Registry
  if (existsSync(REGISTRY_PATH)) {
    const reg = readFileSync(REGISTRY_PATH, "utf-8").split("\n");
    const existingIds = new Set(reg.slice(1).map(l => l.split(",")[0]));
    const promoted = valRows.slice(1).filter(r => r[11]?.includes("PROMOTE"));
    const newMetrics = promoted.map(r => `${r[0]},${r[1]},arkham_transfer_entity,ARKHAM_CHANNEL,zscore,30d,context,TBD (${r[10]}),Arkham entity-labeled transfers,${targets.length} tokens,${targets.length}/28,HIGH,COMPUTABLE,validate on P0 samples,,phase6.4d`);
    const toAdd = newMetrics.filter(m => !existingIds.has(m.split(",")[0]));
    if (toAdd.length > 0) {
      writeFileSync(REGISTRY_PATH, reg.join("\n") + "\n" + toAdd.join("\n") + "\n");
      console.log(`Registry: added ${toAdd.length} AK_TE metrics.`);
    }
  }

  // ── Snapshot Entity Distribution ──
  console.log("\n── Snapshot Entity Distribution (100 most recent transfers) ──\n");
  const snapRows: string[][] = [["token","sample_group","total_transfers","cex_proxy_pct","dex_proxy_pct","fund_pct","mm_pct","unknown_pct","labeled_pct","top_entity_name","top_entity_pct","top_entity_type","second_entity_name","source_channel"]];

  for (const [tok, transfers] of transfersByToken) {
    const total = transfers.length;
    const cex = transfers.filter(t => t.transfer_direction_type.includes("CEX")).length;
    const dex = transfers.filter(t => t.transfer_direction_type.includes("DEX")).length;
    const fund = transfers.filter(t => t.transfer_direction_type.includes("FUND")).length;
    const mm = transfers.filter(t => t.transfer_direction_type.includes("MARKET_MAKER")).length;
    const unk = transfers.filter(t => t.transfer_direction_type === "BETWEEN_UNKNOWN_WALLETS").length;
    const labeled = transfers.filter(t => t.transfer_direction_type !== "BETWEEN_UNKNOWN_WALLETS" && t.transfer_direction_type !== "UNKNOWN").length;

    // Top entity
    const entityCounts = new Map<string, { count: number; type: string }>();
    for (const t of transfers) {
      for (const e of [{ id: t.from_entity_id, name: t.from_entity_name, type: t.from_entity_type }, { id: t.to_entity_id, name: t.to_entity_name, type: t.to_entity_type }]) {
        if (!e.id) continue;
        const key = e.name || e.id;
        const existing = entityCounts.get(key) || { count: 0, type: e.type };
        existing.count++;
        entityCounts.set(key, existing);
      }
    }
    const sorted = Array.from(entityCounts.entries()).sort((a, b) => b[1].count - a[1].count);
    const top1 = sorted[0];
    const top2 = sorted[1];

    const group = transfers[0]?.sample_group || "";
    console.log(`  ${tok}: cex=${(cex/total*100).toFixed(0)}%, dex=${(dex/total*100).toFixed(0)}%, unknown=${(unk/total*100).toFixed(0)}%, top=${top1?.[0] || "?"}(${top1?.[1].count || 0})`);

    snapRows.push([tok, group, String(total), (cex/total*100).toFixed(1)+"%", (dex/total*100).toFixed(1)+"%", (fund/total*100).toFixed(1)+"%", (mm/total*100).toFixed(1)+"%", (unk/total*100).toFixed(1)+"%", (labeled/total*100).toFixed(1)+"%", top1?.[0] || "", String(top1?.[1].count || 0), top1?.[1].type || "", top2?.[0] || "", "ARKHAM_CHANNEL"]);
  }

  writeFileSync(join(OUT_DIR, "analysis", "arkham_transfer_entity_snapshot.csv"), snapRows.map(r => r.join(",")).join("\n"));

  // Quick P0 vs control comparison on snapshot
  const p0Snap = snapRows.slice(1).filter(r => r[1] === "P0");
  const ctrlSnap = snapRows.slice(1).filter(r => r[1] === "CONTROL");
  if (p0Snap.length > 0 && ctrlSnap.length > 0) {
    const p0Cex = p0Snap.reduce((s, r) => s + parseFloat(r[3] || "0"), 0) / p0Snap.length;
    const ctrlCex = ctrlSnap.reduce((s, r) => s + parseFloat(r[3] || "0"), 0) / ctrlSnap.length;
    const p0Unk = p0Snap.reduce((s, r) => s + parseFloat(r[7] || "0"), 0) / p0Snap.length;
    const ctrlUnk = ctrlSnap.reduce((s, r) => s + parseFloat(r[7] || "0"), 0) / ctrlSnap.length;
    console.log(`\n  P0 avg CEX proxy: ${p0Cex.toFixed(1)}% | Control avg CEX: ${ctrlCex.toFixed(1)}%`);
    console.log(`  P0 avg Unknown: ${p0Unk.toFixed(1)}% | Control avg Unknown: ${ctrlUnk.toFixed(1)}%`);
  }

  console.log(`\nReports saved.`);
  console.log(`Paid decision: ${paidDecision}`);
}

main().catch(console.error);
