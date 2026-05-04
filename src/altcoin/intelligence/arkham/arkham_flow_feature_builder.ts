import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { arkhamGet, isArkhamConfigured } from "./arkham_client.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham");

interface TokenInfo { sym: string; chain: string; contract: string; cgId: string; group: string; }

const TOKENS: TokenInfo[] = [
  { sym: "BSB", chain: "ethereum", contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411", cgId: "block-street", group: "P0" },
  { sym: "LAB", chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A", cgId: "lab", group: "P0" },
  { sym: "UB", chain: "bsc", contract: "0x40b8129b786d766267a7a118cf8c07e31cdb6fde", cgId: "unibase", group: "P0" },
  { sym: "AI", chain: "ethereum", contract: "", cgId: "gensyn", group: "P0" },
  { sym: "PEPE", chain: "ethereum", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", cgId: "pepe", group: "CONTROL" },
  { sym: "WIF", chain: "solana", contract: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", cgId: "dogwifhat", group: "CONTROL" },
  { sym: "BONK", chain: "solana", contract: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", cgId: "bonk", group: "CONTROL" },
  { sym: "FLOKI", chain: "ethereum", contract: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e", cgId: "floki", group: "CONTROL" },
];

function hasContract(t: TokenInfo): boolean { return t.contract.length > 0; }

interface FeatureRow {
  token: string; date: string;
  arkham_transfer_count: number | null;
  arkham_transfer_volume_usd: number | null;
  arkham_labeled_transfer_count: number | null;
  arkham_labeled_transfer_ratio: number | null;
  arkham_unknown_transfer_ratio: number | null;
  arkham_cex_proxy_transfer_count: number | null;
  arkham_cex_proxy_transfer_volume_usd: number | null;
  arkham_cex_netflow_usd: number | null;
  arkham_dex_proxy_transfer_count: number | null;
  arkham_fund_or_institution_flow_usd: number | null;
  arkham_market_maker_proxy_flow_usd: number | null;
  arkham_top_entity_flow_share: number | null;
  arkham_counterparty_concentration: number | null;
  arkham_entity_label_coverage: number | null;
  arkham_flow_status: string;
  limitations: string;
}

async function main() {
  console.log("=== Arkham Flow Feature Builder ===\n");
  if (!isArkhamConfigured()) { console.log("NOT_CONFIGURED"); return; }
  console.log("Arkham: CONFIGURED\n");

  if (!existsSync(OUT_DIR + "/features")) mkdirSync(OUT_DIR + "/features", { recursive: true });

  const allFeatures: FeatureRow[] = [];
  const readinessRows: string[][] = [["token","group","holders_available","entity_coverage","cex_holders","readiness","limitations"]];

  for (const t of TOKENS) {
    console.log(`${t.sym}: probing holders...`);
    const holdersR = hasContract(t)
      ? await arkhamGet(`/token/holders/${t.chain === "bsc" ? "bsc" : t.chain === "solana" ? "solana" : "ethereum"}/${t.contract}?limit=20`)
      : await arkhamGet(`/token/holders/${t.cgId}?limit=20`);

    const data = holdersR.data as any;
    let entityCount = 0, cexCount = 0, totalCount = 0;
    const holders: any[] = [];

    if (holdersR.ok && data) {
      const topHolders = data.addressTopHolders || {};
      for (const chainKey of Object.keys(topHolders)) {
        for (const h of (topHolders[chainKey] || [])) {
          totalCount++;
          holders.push(h);
          if (h.address?.arkhamEntity) entityCount++;
          if (h.address?.arkhamEntity?.type === "cex") cexCount++;
        }
      }
    }

    const coverage = totalCount > 0 ? entityCount / totalCount : 0;
    const readiness = coverage >= 0.5 ? "ARKHAM_ENTITY_FLOW_READY"
      : coverage >= 0.2 ? "ARKHAM_PARTIAL_USEFUL"
      : "ARKHAM_LABEL_ONLY";

    // Generate feature row with current snapshot
    const feature: FeatureRow = {
      token: t.sym, date: new Date().toISOString().slice(0, 10),
      arkham_transfer_count: null,
      arkham_transfer_volume_usd: null,
      arkham_labeled_transfer_count: entityCount > 0 ? entityCount : null,
      arkham_labeled_transfer_ratio: totalCount > 0 ? parseFloat((entityCount / totalCount).toFixed(3)) : null,
      arkham_unknown_transfer_ratio: totalCount > 0 ? parseFloat(((totalCount - entityCount) / totalCount).toFixed(3)) : null,
      arkham_cex_proxy_transfer_count: cexCount > 0 ? cexCount : null,
      arkham_cex_proxy_transfer_volume_usd: null,
      arkham_cex_netflow_usd: null,
      arkham_dex_proxy_transfer_count: null,
      arkham_fund_or_institution_flow_usd: null,
      arkham_market_maker_proxy_flow_usd: null,
      arkham_top_entity_flow_share: null,
      arkham_counterparty_concentration: null,
      arkham_entity_label_coverage: totalCount > 0 ? parseFloat((entityCount / totalCount).toFixed(3)) : null,
      arkham_flow_status: readiness,
      limitations: [!hasContract(t) ? "no contract" : "", coverage < 0.5 ? `low entity coverage ${(coverage*100).toFixed(0)}%` : ""].filter(Boolean).join("; "),
    };
    allFeatures.push(feature);

    console.log(`  holders=${totalCount}, entity_coverage=${(coverage*100).toFixed(0)}%, cex=${cexCount}, readiness=${readiness}`);

    readinessRows.push([t.sym, t.group, String(totalCount > 0), (coverage*100).toFixed(1)+"%", String(cexCount), readiness,
      [!hasContract(t) ? "no contract" : "", coverage < 0.2 ? "low coverage" : ""].filter(Boolean).join("; ")]);
  }

  // Write features
  if (allFeatures.length > 0) {
    const fH = ["token","date","labeled_transfer_count","labeled_transfer_ratio","unknown_transfer_ratio",
      "cex_proxy_transfer_count","cex_proxy_transfer_volume_usd","cex_netflow_usd",
      "dex_proxy_transfer_count","fund_or_institution_flow_usd","market_maker_proxy_flow_usd",
      "top_entity_flow_share","counterparty_concentration","entity_label_coverage","flow_status"];
    const fR = [fH.join(","), ...allFeatures.map(r => [
      r.token, r.date, r.arkham_labeled_transfer_count, r.arkham_labeled_transfer_ratio, r.arkham_unknown_transfer_ratio,
      r.arkham_cex_proxy_transfer_count, r.arkham_cex_proxy_transfer_volume_usd, r.arkham_cex_netflow_usd,
      r.arkham_dex_proxy_transfer_count, r.arkham_fund_or_institution_flow_usd, r.arkham_market_maker_proxy_flow_usd,
      r.arkham_top_entity_flow_share, r.arkham_counterparty_concentration, r.arkham_entity_label_coverage, r.arkham_flow_status,
    ].join(","))];
    writeFileSync(join(OUT_DIR, "features", "arkham_entity_flow_features.csv"), fR.join("\n"));
  }
  writeFileSync(join(OUT_DIR, "analysis", "arkham_flow_readiness.csv"), readinessRows.map(r => r.join(",")).join("\n"));
  console.log(`\nFeatures saved.`);
}

main().catch(console.error);
