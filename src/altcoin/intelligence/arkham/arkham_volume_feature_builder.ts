import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { arkhamGet, isArkhamConfigured } from "./arkham_client.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham");

interface TokenInfo {
  sym: string; chain: string; contract: string; cgId: string; group: string;
  breakoutDate: string; peakDate: string;
}

const TOKENS: TokenInfo[] = [
  { sym: "LAB", chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A", cgId: "lab", group: "P0", breakoutDate: "2026-04-23", peakDate: "2026-05-02" },
  { sym: "UB", chain: "bsc", contract: "0x40b8129b786d766267a7a118cf8c07e31cdb6fde", cgId: "unibase", group: "P0", breakoutDate: "2026-04-25", peakDate: "2026-05-02" },
  { sym: "BSB", chain: "ethereum", contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411", cgId: "block-street", group: "P0", breakoutDate: "2026-04-25", peakDate: "2026-05-04" },
  { sym: "AI", chain: "ethereum", contract: "", cgId: "gensyn", group: "P0", breakoutDate: "2026-04-23", peakDate: "2026-04-29" },
  { sym: "PEPE", chain: "ethereum", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", cgId: "pepe", group: "CONTROL", breakoutDate: "2026-04-22", peakDate: "2026-04-29" },
  { sym: "WIF", chain: "solana", contract: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", cgId: "dogwifhat", group: "CONTROL", breakoutDate: "", peakDate: "" },
  { sym: "BONK", chain: "solana", contract: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", cgId: "bonk", group: "CONTROL", breakoutDate: "", peakDate: "" },
  { sym: "FLOKI", chain: "ethereum", contract: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e", cgId: "floki", group: "CONTROL", breakoutDate: "", peakDate: "" },
  { sym: "PENDLE", chain: "ethereum", contract: "0x808507121b80c02388fad14726482e061b8da827", cgId: "pendle", group: "P2", breakoutDate: "", peakDate: "" },
  { sym: "ONDO", chain: "ethereum", contract: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3", cgId: "ondo-finance", group: "P2", breakoutDate: "", peakDate: "" },
];

interface VolumeRow {
  token: string; date: string;
  inUSD: number; outUSD: number; inValue: number; outValue: number;
}

interface VolumeFeature {
  token: string; sample_group: string; date: string;
  arkham_in_usd: number; arkham_out_usd: number;
  arkham_total_volume_usd: number; arkham_net_volume_usd: number;
  arkham_in_value: number; arkham_out_value: number;
  arkham_total_value: number; arkham_net_value: number;
  arkham_volume_zscore_7d: number | null; arkham_volume_zscore_30d: number | null;
  arkham_net_volume_zscore_7d: number | null;
  arkham_in_out_imbalance: number | null;
  arkham_volume_change_3d: number | null; arkham_volume_change_7d: number | null;
  arkham_volume_status: string; limitations: string;
}

async function fetchVolume(t: TokenInfo): Promise<VolumeRow[]> {
  const path = `/token/volume/${t.cgId}?granularity=1d`;
  const r = await arkhamGet(path, { token: t.sym, cacheTtlHours: 6 });
  if (!r.ok || !r.data) return [];
  const data = r.data as any;
  const rows = Array.isArray(data) ? data : (data.data || data.items || []);
  if (!Array.isArray(rows)) return [];

  return rows.map((d: any) => {
    const time = d.time;
    let date = "";
    if (typeof time === "number") {
      const ms = time > 1e12 ? time : time * 1000;
      date = new Date(ms).toISOString().slice(0, 10);
    } else if (typeof time === "string") {
      date = time.slice(0, 10);
    }
    return {
      token: t.sym,
      date,
      inUSD: parseFloat(d.inUSD) || 0,
      outUSD: parseFloat(d.outUSD) || 0,
      inValue: parseFloat(d.inValue) || 0,
      outValue: parseFloat(d.outValue) || 0,
    };
  }).filter(r => r.date > "2020-01-01" && r.date < "2030-01-01");
}

function computeZScore(value: number, mean: number, std: number): number | null {
  if (std <= 0) return null;
  return parseFloat(((value - mean) / std).toFixed(4));
}

async function main() {
  console.log("=== Arkham Volume Feature Builder ===\n");
  if (!isArkhamConfigured()) { console.log("NOT_CONFIGURED"); return; }

  for (const d of ["features", "replay", "candidates"]) {
    const p = join(OUT_DIR, d);
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }

  const allVolumes: Map<string, VolumeRow[]> = new Map();
  const allFeatures: VolumeFeature[] = [];

  for (const t of TOKENS) {
    const vols = await fetchVolume(t);
    allVolumes.set(t.sym, vols);
    console.log(`${t.sym}: ${vols.length} volume rows`);

    if (vols.length < 5) {
      console.log(`  INSUFFICIENT_DATA`);
      continue;
    }

    // Compute rolling stats
    const totals = vols.map(v => v.inUSD + v.outUSD);
    const mean7: number[] = [], std7: number[] = [];
    const mean30: number[] = [], std30: number[] = [];

    for (let i = 0; i < vols.length; i++) {
      const w7 = totals.slice(Math.max(0, i - 7), i + 1);
      const w30 = totals.slice(Math.max(0, i - 30), i + 1);
      mean7.push(w7.reduce((a, b) => a + b, 0) / w7.length);
      std7.push(Math.sqrt(w7.reduce((s, v) => s + (v - mean7[i]) ** 2, 0) / w7.length));
      mean30.push(w30.reduce((a, b) => a + b, 0) / w30.length);
      std30.push(Math.sqrt(w30.reduce((s, v) => s + (v - mean30[i]) ** 2, 0) / w30.length));
    }

    const netMean7: number[] = [], netStd7: number[] = [];
    const nets = vols.map(v => v.inUSD - v.outUSD);
    for (let i = 0; i < vols.length; i++) {
      const w = nets.slice(Math.max(0, i - 7), i + 1);
      const m = w.reduce((a, b) => a + b, 0) / w.length;
      netMean7.push(m);
      netStd7.push(Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / w.length));
    }

    for (let i = 0; i < vols.length; i++) {
      const v = vols[i];
      const total = v.inUSD + v.outUSD;
      const net = v.inUSD - v.outUSD;
      const totalVal = v.inValue + v.outValue;
      const netVal = v.inValue - v.outValue;
      const imbalance = total > 0 ? parseFloat(((v.inUSD - v.outUSD) / total).toFixed(4)) : null;

      const cz7 = computeZScore(total, mean7[i], std7[i]);
      const cz30 = computeZScore(total, mean30[i], std30[i]);
      const nz7 = computeZScore(net, netMean7[i], netStd7[i]);

      const chg3 = i >= 3 && totals[i - 3] > 0 ? parseFloat(((total - totals[i - 3]) / totals[i - 3]).toFixed(4)) : null;
      const chg7 = i >= 7 && totals[i - 7] > 0 ? parseFloat(((total - totals[i - 7]) / totals[i - 7]).toFixed(4)) : null;

      const limits: string[] = [];
      if (total === 0) limits.push("ZERO_VOLUME");
      let status = "OK";
      if (total === 0) status = "ZERO_VOLUME";

      allFeatures.push({
        token: t.sym, sample_group: t.group, date: v.date,
        arkham_in_usd: v.inUSD, arkham_out_usd: v.outUSD,
        arkham_total_volume_usd: total, arkham_net_volume_usd: net,
        arkham_in_value: v.inValue, arkham_out_value: v.outValue,
        arkham_total_value: totalVal, arkham_net_value: netVal,
        arkham_volume_zscore_7d: cz7, arkham_volume_zscore_30d: cz30,
        arkham_net_volume_zscore_7d: nz7,
        arkham_in_out_imbalance: imbalance,
        arkham_volume_change_3d: chg3, arkham_volume_change_7d: chg7,
        arkham_volume_status: status, limitations: limits.join("; "),
      });
    }
  }

  // Write features
  if (allFeatures.length > 0) {
    const fH = "token,sample_group,date,in_usd,out_usd,total_volume_usd,net_volume_usd,in_value,out_value,total_value,net_value,volume_zscore_7d,volume_zscore_30d,net_volume_zscore_7d,in_out_imbalance,volume_change_3d,volume_change_7d,volume_status";
    const fR = [fH, ...allFeatures.map(r => [
      r.token, r.sample_group, r.date, r.arkham_in_usd, r.arkham_out_usd, r.arkham_total_volume_usd, r.arkham_net_volume_usd,
      r.arkham_in_value, r.arkham_out_value, r.arkham_total_value, r.arkham_net_value,
      r.arkham_volume_zscore_7d, r.arkham_volume_zscore_30d, r.arkham_net_volume_zscore_7d,
      r.arkham_in_out_imbalance, r.arkham_volume_change_3d, r.arkham_volume_change_7d,
      r.arkham_volume_status,
    ].join(","))];
    writeFileSync(join(OUT_DIR, "features", "arkham_volume_features.csv"), fR.join("\n"));
    console.log(`\nVolume features: ${allFeatures.length} rows`);
  }

  // ── Event Replay ──
  console.log("\n── Volume Event Replay ──\n");
  const eventTokens = TOKENS.filter(t => t.peakDate);
  const windows = ["T-30", "T-14", "T-7", "T-3", "T-1", "T0", "T+1", "T+3", "T+7", "PEAK", "POST_PEAK"];

  const replayRows: string[][] = [["token","sample_group","metric","T_minus_30","T_minus_14","T_minus_7","T_minus_3","T_minus_1","T0","T_plus_1","T_plus_3","T_plus_7","near_peak","post_peak","limitations"]];

  const metrics = [
    { name: "total_volume_usd", field: "arkham_total_volume_usd" as const },
    { name: "net_volume_usd", field: "arkham_net_volume_usd" as const },
    { name: "in_out_imbalance", field: "arkham_in_out_imbalance" as const },
    { name: "volume_zscore_7d", field: "arkham_volume_zscore_7d" as const },
  ];

  for (const t of eventTokens) {
    const feats = allFeatures.filter(r => r.token === t.sym).sort((a, b) => a.date.localeCompare(b.date));
    if (feats.length === 0) continue;

    const peakIdx = feats.findIndex(r => r.date >= t.peakDate);
    if (peakIdx < 0) continue;

    for (const m of metrics) {
      const getVal = (offset: number) => {
        const idx = peakIdx + offset;
        if (idx < 0 || idx >= feats.length) return "";
        const v = feats[idx][m.field];
        return v !== null && v !== undefined ? String(v) : "";
      };

      replayRows.push([
        t.sym, t.group, m.name,
        getVal(-30), getVal(-14), getVal(-7), getVal(-3), getVal(-1),
        getVal(0),
        getVal(1), getVal(3), getVal(7),
        feats[peakIdx]?.[m.field]?.toString() || "",
        feats.length > peakIdx + 5 ? feats[peakIdx + 5]?.[m.field]?.toString() || "" : "",
        feats.length < 30 ? "short history" : "",
      ]);
    }
  }

  writeFileSync(join(OUT_DIR, "replay", "arkham_volume_event_replay.csv"), replayRows.map(r => r.join(",")).join("\n"));
  console.log(`Event replay: ${replayRows.length - 1} rows`);

  console.log(`\nVolume features and replay saved.`);
}

main().catch(console.error);
