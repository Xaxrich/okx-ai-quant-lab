import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { arkhamGet, isArkhamConfigured } from "./arkham_client.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham");
const REGISTRY_PATH = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "metric_loop", "metric_registry.csv");

interface TokenInfo { sym: string; chain: string; contract: string; cgId: string; group: string; }
interface HolderEntityRow {
  token: string; sample_group: string; chain: string; contract_or_pricing_id: string;
  holders_returned: number; labeled_holder_count: number; labeled_holder_ratio: number;
  unknown_holder_count: number; unknown_holder_ratio: number;
  cex_holder_count: number; cex_holder_ratio: number;
  dex_holder_count: number; fund_holder_count: number;
  market_maker_proxy_holder_count: number;
  top1_holder_share: number | null; top5_holder_share: number | null;
  top10_holder_share: number | null; top_entity_holder_share: number | null;
  holder_entity_concentration: number | null; holder_entity_coverage: number;
  arkham_holder_readiness: string; limitations: string;
}

const TOKENS: TokenInfo[] = [
  { sym: "LAB", chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A", cgId: "lab", group: "P0" },
  { sym: "UB", chain: "bsc", contract: "0x40b8129b786d766267a7a118cf8c07e31cdb6fde", cgId: "unibase", group: "P0" },
  { sym: "BSB", chain: "ethereum", contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411", cgId: "block-street", group: "P0" },
  { sym: "AI", chain: "ethereum", contract: "", cgId: "gensyn", group: "P0" },
  { sym: "PEPE", chain: "ethereum", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", cgId: "pepe", group: "CONTROL" },
  { sym: "WIF", chain: "solana", contract: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", cgId: "dogwifhat", group: "CONTROL" },
  { sym: "BONK", chain: "solana", contract: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", cgId: "bonk", group: "CONTROL" },
  { sym: "FLOKI", chain: "ethereum", contract: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e", cgId: "floki", group: "CONTROL" },
  { sym: "PENDLE", chain: "ethereum", contract: "0x808507121b80c02388fad14726482e061b8da827", cgId: "pendle", group: "P2" },
  { sym: "ONDO", chain: "ethereum", contract: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3", cgId: "ondo-finance", group: "P2" },
  { sym: "TROLL", chain: "ethereum", contract: "", cgId: "troll-2", group: "P1" },
  { sym: "SIREN", chain: "ethereum", contract: "", cgId: "siren-2", group: "P1" },
];

function hasContract(t: TokenInfo): boolean { return t.contract.length > 0; }

async function main() {
  console.log("=== Arkham Holder-Entity Feature Builder ===\n");
  if (!isArkhamConfigured()) { console.log("NOT_CONFIGURED"); return; }

  for (const d of ["features", "analysis"]) {
    const p = join(OUT_DIR, d);
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }

  const features: HolderEntityRow[] = [];

  for (const t of TOKENS) {
    const id = hasContract(t) ? `${t.chain}/${t.contract}` : t.cgId;
    console.log(`${t.sym}: fetching holders via ${hasContract(t) ? "chain/address" : "pricing ID"}...`);

    const holderR = hasContract(t)
      ? await arkhamGet(`/token/holders/${t.chain === "bsc" ? "bsc" : t.chain === "solana" ? "solana" : "ethereum"}/${t.contract}?limit=20`, { token: t.sym })
      : await arkhamGet(`/token/holders/${t.cgId}?limit=20`, { token: t.sym });

    const data = holderR.data as any;
    let totalHolders = 0, labeledCount = 0, unknownCount = 0;
    let cexCount = 0, dexCount = 0, fundCount = 0, mmCount = 0;
    let top1Share: number | null = null, top5Share: number | null = null, top10Share: number | null = null;
    let topEntityShare: number | null = null;
    const pcts: number[] = [];

    if (holderR.ok && data) {
      const topHolders = data.addressTopHolders || {};
      for (const chainKey of Object.keys(topHolders)) {
        const list = topHolders[chainKey] || [];
        totalHolders += list.length;
        for (let i = 0; i < list.length; i++) {
          const h = list[i];
          const entity = h.address?.arkhamEntity;
          const eType = (entity?.type || "").toLowerCase();
          const pct = parseFloat(h.pctOfCap) || 0;
          pcts.push(pct);

          if (entity) labeledCount++;
          else unknownCount++;
          if (eType === "cex") cexCount++;
          if (eType === "dex") dexCount++;
          if (eType === "fund" || eType === "institution") fundCount++;
          if (eType === "market_maker" || eType === "marketmaker") mmCount++;

          if (i === 0) top1Share = pct;
        }
      }
    }

    pcts.sort((a, b) => b - a);
    if (pcts.length >= 5) top5Share = pcts.slice(0, 5).reduce((s, v) => s + v, 0);
    if (pcts.length >= 10) top10Share = pcts.slice(0, 10).reduce((s, v) => s + v, 0);
    if (pcts.length >= 5) topEntityShare = pcts[0] / (top5Share || 1);

    const lr = totalHolders > 0 ? parseFloat((labeledCount / totalHolders).toFixed(3)) : 0;
    const ur = totalHolders > 0 ? parseFloat((unknownCount / totalHolders).toFixed(3)) : 1;
    const cr = totalHolders > 0 ? parseFloat((cexCount / totalHolders).toFixed(3)) : 0;
    const concentration = pcts.length >= 5 ? parseFloat((pcts.slice(0, 3).reduce((s, v) => s + v, 0)).toFixed(3)) : null;

    const readiness = totalHolders === 0 ? "ARKHAM_HOLDER_ENTITY_EMPTY"
      : lr >= 0.3 ? "ARKHAM_HOLDER_ENTITY_READY"
      : lr >= 0.1 ? "ARKHAM_HOLDER_ENTITY_PARTIAL"
      : "ARKHAM_HOLDER_ENTITY_EMPTY";

    const limits: string[] = [];
    if (!hasContract(t)) limits.push("no contract — pricing ID only");
    if (t.chain === "solana") limits.push("Solana coverage may be limited");
    if (lr < 0.3) limits.push(`low entity coverage ${(lr*100).toFixed(0)}%`);

    features.push({
      token: t.sym, sample_group: t.group, chain: t.chain, contract_or_pricing_id: id,
      holders_returned: totalHolders, labeled_holder_count: labeledCount, labeled_holder_ratio: lr,
      unknown_holder_count: unknownCount, unknown_holder_ratio: ur,
      cex_holder_count: cexCount, cex_holder_ratio: cr,
      dex_holder_count: dexCount, fund_holder_count: fundCount,
      market_maker_proxy_holder_count: mmCount,
      top1_holder_share: top1Share, top5_holder_share: top5Share, top10_holder_share: top10Share,
      top_entity_holder_share: topEntityShare, holder_entity_concentration: concentration,
      holder_entity_coverage: lr, arkham_holder_readiness: readiness, limitations: limits.join("; "),
    });

    console.log(`  ${totalHolders} holders, labeled=${(lr*100).toFixed(0)}%, cex=${cexCount}, readiness=${readiness}`);
  }

  // Write features
  if (features.length > 0) {
    const fH = "token,sample_group,chain,contract_or_pricing_id,holders_returned,labeled_holder_count,labeled_holder_ratio,unknown_holder_count,unknown_holder_ratio,cex_holder_count,cex_holder_ratio,dex_holder_count,fund_holder_count,market_maker_proxy_holder_count,top1_holder_share,top5_holder_share,top10_holder_share,top_entity_holder_share,holder_entity_concentration,holder_entity_coverage,arkham_holder_readiness";
    const fR = [fH, ...features.map(r => [
      r.token, r.sample_group, r.chain, r.contract_or_pricing_id,
      r.holders_returned, r.labeled_holder_count, r.labeled_holder_ratio,
      r.unknown_holder_count, r.unknown_holder_ratio,
      r.cex_holder_count, r.cex_holder_ratio,
      r.dex_holder_count, r.fund_holder_count, r.market_maker_proxy_holder_count,
      r.top1_holder_share, r.top5_holder_share, r.top10_holder_share,
      r.top_entity_holder_share, r.holder_entity_concentration, r.holder_entity_coverage,
      r.arkham_holder_readiness,
    ].join(","))];
    writeFileSync(join(OUT_DIR, "features", "arkham_holder_entity_features.csv"), fR.join("\n"));
  }

  // ── Holder-Entity Validation ──
  console.log("\n── Holder-Entity Validation (P0 vs Control) ──\n");
  const p0 = features.filter(r => r.sample_group === "P0" && r.holders_returned > 0);
  const ctrl = features.filter(r => r.sample_group === "CONTROL" && r.holders_returned > 0);

  const metrics = [
    { id: "AK_HE_001", name: "labeled_holder_ratio", field: "labeled_holder_ratio" as const, higherIsBetter: true },
    { id: "AK_HE_002", name: "cex_holder_ratio", field: "cex_holder_ratio" as const, higherIsBetter: false },
    { id: "AK_HE_003", name: "unknown_holder_ratio", field: "unknown_holder_ratio" as const, higherIsBetter: false },
    { id: "AK_HE_004", name: "top_entity_holder_share", field: "top_entity_holder_share" as const, higherIsBetter: false },
    { id: "AK_HE_005", name: "holder_entity_concentration", field: "holder_entity_concentration" as const, higherIsBetter: false },
    { id: "AK_HE_006", name: "market_maker_proxy_holder_count", field: "market_maker_proxy_holder_count" as const, higherIsBetter: false },
    { id: "AK_HE_007", name: "fund_holder_count", field: "fund_holder_count" as const, higherIsBetter: false },
    { id: "AK_HE_008", name: "holder_entity_coverage", field: "holder_entity_coverage" as const, higherIsBetter: true },
  ];

  const valRows: string[][] = [["metric_id","metric_name","p0_value_avg","control_value_avg","discrimination_ratio","p0_tokens_high","control_tokens_high","classification","decision","limitations"]];

  for (const m of metrics) {
    const p0Vals = p0.map(r => r[m.field]).filter(v => v !== null) as number[];
    const ctrlVals = ctrl.map(r => r[m.field]).filter(v => v !== null) as number[];
    const p0Avg = p0Vals.length > 0 ? p0Vals.reduce((a, b) => a + b, 0) / p0Vals.length : 0;
    const ctrlAvg = ctrlVals.length > 0 ? ctrlVals.reduce((a, b) => a + b, 0) / ctrlVals.length : 0;
    const discRatio = ctrlAvg > 0 ? p0Avg / ctrlAvg : (p0Avg > 0 ? Infinity : 0);

    const p0High = p0.filter(r => (r[m.field] || 0) > ctrlAvg).map(r => r.token);
    const ctrlHigh = ctrl.filter(r => (r[m.field] || 0) > ctrlAvg).map(r => r.token);

    // Classification: STRUCTURAL_CONTEXT, STRUCTURAL_RISK, NOISE, INSUFFICIENT_DATA
    let classification = "INSUFFICIENT_DATA";
    let decision = "NEED_MORE_SAMPLE";
    let limitNote = "";

    if (p0Vals.length >= 2 && ctrlVals.length >= 2) {
      if (discRatio > 2 || discRatio < 0.5) {
        // P0 significantly different from control
        if (m.higherIsBetter === false && discRatio > 1.5) {
          classification = "STRUCTURAL_RISK";
          decision = "ADD_STRUCTURAL_RISK_ONLY";
          limitNote = "P0 higher than control — structural risk indicator";
        } else if (m.higherIsBetter && discRatio < 0.67) {
          classification = "STRUCTURAL_RISK";
          decision = "ADD_STRUCTURAL_RISK_ONLY";
          limitNote = "P0 lower than control — structural risk indicator";
        } else {
          classification = "STRUCTURAL_CONTEXT";
          decision = "ADD_STRUCTURAL_RESEARCH_ONLY";
          limitNote = "P0 vs control difference observed — research context only";
        }
      } else if (discRatio > 0.67 && discRatio < 1.5) {
        classification = "NOISE";
        decision = "REJECT_NOISE";
        limitNote = "No meaningful P0 vs control discrimination";
      } else {
        classification = "STRUCTURAL_CONTEXT";
        decision = "KEEP_AS_CONTEXT";
        limitNote = "Weak discrimination — keep as context";
      }
    }

    // Holder snapshots are NEVER LEADING
    if (classification === "STRUCTURAL_CONTEXT") {
      limitNote += " | Holder snapshot — cannot be lead/lag signal";
    }

    console.log(`${m.id}: p0=${p0Avg.toFixed(3)}, ctrl=${ctrlAvg.toFixed(3)}, disc=${discRatio.toFixed(2)}, ${classification}`);

    valRows.push([m.id, m.name, p0Avg.toFixed(3), ctrlAvg.toFixed(3), discRatio.toFixed(2), p0High.join("|"), ctrlHigh.join("|"), classification, decision, limitNote]);
  }

  const valDir = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "metric_loop", "validation");
  if (!existsSync(valDir)) mkdirSync(valDir, { recursive: true });
  writeFileSync(join(valDir, "arkham_holder_entity_validation_results.csv"), valRows.map(r => r.join(",")).join("\n"));

  // Update registry
  if (existsSync(REGISTRY_PATH)) {
    const reg = readFileSync(REGISTRY_PATH, "utf-8").split("\n");
    const existingIds = new Set(reg.slice(1).map(l => l.split(",")[0]));
    const newMetrics = valRows.slice(1).map(r => {
      const [id, name, , , , , , classification, decision] = r;
      const status = decision.includes("ADD_") ? "COMPUTABLE"
        : decision === "REJECT_NOISE" ? "REJECTED_NOISE"
        : decision === "NEED_MORE_SAMPLE" ? "IDEA"
        : "RESEARCH_ONLY";
      return `${id},${name},arkham_holder_entity,ARKHAM_CHANNEL,snapshot,snapshot,structural_context,Holder entity structural analysis (${classification}),Arkham token holders,12 tokens,12/28,LOW,${status},validate on more samples,,phase6.4b`;
    }).filter(m => !existingIds.has(m.split(",")[0]));
    if (newMetrics.length > 0) {
      writeFileSync(REGISTRY_PATH, reg.join("\n") + "\n" + newMetrics.join("\n") + "\n");
      console.log(`Registry: added ${newMetrics.length} AK_HE metrics.`);
    }
  }

  console.log(`\nHolder-entity features and validation saved.`);
}

main().catch(console.error);
