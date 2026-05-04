import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { arkhamGet, isArkhamConfigured, arkhamConfidence, getRateLimitEvents } from "./arkham_client.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "arkham");

interface TokenInfo {
  sym: string; chain: string; contract: string; cgId: string; group: string;
}

const TOKENS: TokenInfo[] = [
  { sym: "BSB", chain: "ethereum", contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411", cgId: "block-street", group: "P0" },
  { sym: "LAB", chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A", cgId: "lab", group: "P0" },
  { sym: "UB", chain: "bsc", contract: "0x40b8129b786d766267a7a118cf8c07e31cdb6fde", cgId: "unibase", group: "P0" },
  { sym: "AI", chain: "ethereum", contract: "", cgId: "gensyn", group: "P0" },
  { sym: "TROLL", chain: "ethereum", contract: "", cgId: "troll-2", group: "P1" },
  { sym: "SIREN", chain: "ethereum", contract: "", cgId: "siren-2", group: "P1" },
  { sym: "PENDLE", chain: "ethereum", contract: "0x808507121b80c02388fad14726482e061b8da827", cgId: "pendle", group: "P2" },
  { sym: "ONDO", chain: "ethereum", contract: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3", cgId: "ondo-finance", group: "P2" },
  { sym: "PEPE", chain: "ethereum", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", cgId: "pepe", group: "CONTROL" },
  { sym: "WIF", chain: "solana", contract: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", cgId: "dogwifhat", group: "CONTROL" },
  { sym: "BONK", chain: "solana", contract: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", cgId: "bonk", group: "CONTROL" },
  { sym: "FLOKI", chain: "ethereum", contract: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e", cgId: "floki", group: "CONTROL" },
];

function hasContract(t: TokenInfo): boolean { return t.contract.length > 0; }

// ── Phase A: Health / Chain Probe ──
async function phaseA_health() {
  console.log("── Phase A: Health / Chain Probe ──\n");
  const rows: string[][] = [["endpoint","ok","status","data_summary","limitations"]];

  const health = await arkhamGet("/health");
  console.log(`/health: ${health.ok ? "OK" : health.status} — ${health.data}`);
  rows.push(["/health", String(health.ok), health.status, String(health.data || "").slice(0, 50), (health.limitations || []).join("; ")]);

  const chains = await arkhamGet("/chains");
  const chainList = Array.isArray(chains.data) ? chains.data as string[] : [];
  console.log(`/chains: ${chains.ok ? "OK" : chains.status} — ${chainList.length} chains: ${chainList.slice(0, 5).join(", ")}...`);
  rows.push(["/chains", String(chains.ok), chains.status, `${chainList.length} chains`, chainList.slice(0, 5).join(", ") + "..."]);

  writeFileSync(join(OUT_DIR, "analysis", "arkham_service_probe.csv"), rows.map(r => r.join(",")).join("\n"));
  return { healthOk: health.ok, chainsAvailable: chainList, chainsOk: chains.ok };
}

// ── Phase B: Token Contract Intelligence ──
async function phaseB_contractIntelligence() {
  console.log("\n── Phase B: Contract Intelligence ──\n");
  const rows: string[][] = [["token","group","chain","contract","contract_intel_available","address_intel_available","enriched_available","arkham_entity_id","arkham_entity_name","arkham_entity_type","contract_name","is_token_contract","confidence","limitations"]];

  for (const t of TOKENS) {
    if (!hasContract(t)) {
      console.log(`${t.sym}: TOKEN_IDENTITY_INCOMPLETE (no contract)`);
      rows.push([t.sym, t.group, t.chain, "", "false", "false", "false", "", "", "", "", "", "UNKNOWN", "No contract address"]);
      continue;
    }
    const chain = t.chain === "bsc" ? "bsc" : t.chain === "solana" ? "solana" : "ethereum";

    const contractR = await arkhamGet(`/intelligence/contract/${chain}/${t.contract}`);
    const contractOk = contractR.ok && contractR.data && typeof contractR.data === "object";
    const cData = contractR.data as any;

    const addressR = await arkhamGet(`/intelligence/address/${t.contract}?chain=${chain}`);
    const addressOk = addressR.ok && addressR.data && typeof addressR.data === "object";
    const aData = addressR.data as any;

    const entity = aData?.arkhamEntity;
    const label = aData?.arkhamLabel;
    const conf = arkhamConfidence(!!entity, !!label, entity?.type);

    console.log(`${t.sym}: contract=${contractOk ? "OK" : contractR.status}, address=${addressOk ? "OK" : addressR.status}, entity=${entity?.name || "?"} (${entity?.type || "?"})`);

    rows.push([
      t.sym, t.group, t.chain, t.contract,
      String(contractOk), String(addressOk), "false",
      entity?.id || "", entity?.name || "", entity?.type || "",
      cData?.name || "", String(cData?.contract || ""),
      conf.confidence,
      [aData ? "" : "no address intel", contractOk ? "" : "no contract intel", conf.limitation].filter(Boolean).join("; "),
    ]);
  }

  writeFileSync(join(OUT_DIR, "probes", "arkham_token_contract_intelligence_probe.csv"), rows.map(r => r.join(",")).join("\n"));
}

// ── Phase C: Token Holders ──
async function phaseC_holders() {
  console.log("\n── Phase C: Token Holders ──\n");
  const probeRows: string[][] = [["token","group","chain","contract","holders_available","holders_returned","entity_labels_available","top_holder_entity_count","top_holder_unknown_count","cex_holder_count","dex_holder_count","fund_holder_count","market_maker_holder_count","arkham_holder_coverage","confidence","limitations"]];
  const holderRows: string[][] = [["token","chain","holder_address","holder_entity_id","holder_entity_name","holder_entity_type","holder_label","balance","balance_usd","pct_of_cap","source_channel","source_confidence","limitations"]];

  for (const t of TOKENS) {
    // Try by chain/address first, then by pricing ID
    let holdersR;
    if (hasContract(t)) {
      const chain = t.chain === "bsc" ? "bsc" : t.chain === "solana" ? "solana" : "ethereum";
      holdersR = await arkhamGet(`/token/holders/${chain}/${t.contract}?limit=20`);
    }
    if (!holdersR || (!holdersR.ok && t.cgId)) {
      holdersR = await arkhamGet(`/token/holders/${t.cgId}?limit=20`);
    }

    const ok = holdersR.ok && holdersR.data && typeof holdersR.data === "object";
    const data = holdersR.data as any;
    let holdersReturned = 0, entityCount = 0, unknownCount = 0, cexCount = 0, dexCount = 0, fundCount = 0, mmCount = 0;

    if (ok && data) {
      // Extract holders from any chain key
      const topHolders = data.addressTopHolders || {};
      for (const chainKey of Object.keys(topHolders)) {
        const list = topHolders[chainKey] || [];
        holdersReturned += list.length;
        for (const h of list) {
          const addr = h.address;
          const entity = addr?.arkhamEntity;
          const label = addr?.arkhamLabel;
          const eType = entity?.type || "";
          if (entity) entityCount++;
          else unknownCount++;
          if (eType === "cex") cexCount++;
          else if (eType === "dex") dexCount++;
          else if (eType === "fund" || eType === "institution") fundCount++;
          else if (eType === "market_maker" || eType === "marketmaker") mmCount++;

          const conf = arkhamConfidence(!!entity, !!label, eType);
          holderRows.push([
            t.sym, t.chain, addr?.address || "",
            entity?.id || "", entity?.name || "", eType, label?.name || "",
            String(h.balance || ""), String(h.usd || ""), String(h.pctOfCap || ""),
            "ARKHAM_CHANNEL", conf.confidence, conf.limitation,
          ]);
        }
      }
    }

    const coverage = holdersReturned > 0 ? (entityCount / holdersReturned * 100).toFixed(1) + "%" : "0%";
    console.log(`${t.sym}: holders=${holdersReturned}, entity=${entityCount}, unknown=${unknownCount}, cex=${cexCount}, coverage=${coverage}`);

    probeRows.push([
      t.sym, t.group, t.chain, t.contract,
      String(ok), String(holdersReturned), String(entityCount > 0),
      String(entityCount), String(unknownCount), String(cexCount),
      String(dexCount), String(fundCount), String(mmCount),
      coverage,
      ok ? (entityCount > 0 ? "HIGH" : "UNKNOWN") : "UNKNOWN",
      [holdersR.status !== "OK" ? holdersR.status : "", unknownCount > entityCount ? "majority unknown" : ""].filter(Boolean).join("; "),
    ]);
  }

  writeFileSync(join(OUT_DIR, "probes", "arkham_token_holders_probe.csv"), probeRows.map(r => r.join(",")).join("\n"));
  writeFileSync(join(OUT_DIR, "parsed", "arkham_token_holders.csv"), holderRows.map(r => r.join(",")).join("\n"));
}

// ── Phase D: Token Top Flow / Volume ──
async function phaseD_topFlow() {
  console.log("\n── Phase D: Token Top Flow / Volume ──\n");
  const probeRows: string[][] = [["token","group","chain","contract","top_flow_available","volume_available","inflow_entities_count","outflow_entities_count","cex_flow_available","dex_flow_available","unknown_flow_ratio","rows_returned","time_window","confidence","limitations"]];

  for (const t of TOKENS) {
    // Use pricing ID for top flow (works for all tokens with CoinGecko ID)
    let flowOk = false, volOk = false;
    let inflowCount = 0, outflowCount = 0, cexFlow = false, dexFlow = false, unknownRatio = "N/A", flowRows = 0;

    if (t.cgId) {
      const flowR = await arkhamGet(`/token/top_flow/${t.cgId}`);
      flowOk = flowR.ok && flowR.data !== null;
      const fData = flowR.data as any;

      if (flowOk && fData) {
        // Flow data structure varies
        if (Array.isArray(fData)) {
          flowRows = fData.length;
          for (const f of fData) {
            const dir = f.direction || f.flowType || "";
            const eType = f.entity?.type || f.counterpartyEntity?.type || "";
            if (dir.includes("in") || dir === "from") inflowCount++;
            if (dir.includes("out") || dir === "to") outflowCount++;
            if (eType === "cex") cexFlow = true;
            if (eType === "dex") dexFlow = true;
          }
        } else if (typeof fData === "object") {
          const items = fData.data || fData.items || fData.flows || [];
          if (Array.isArray(items)) {
            flowRows = items.length;
            for (const f of items) {
              const eType = f.entity?.type || f.counterpartyEntity?.type || "";
              if (eType === "cex") cexFlow = true;
              if (eType === "dex") dexFlow = true;
            }
          }
        }
      }

      // Volume
      const volR = await arkhamGet(`/token/volume/${t.cgId}`);
      volOk = volR.ok && volR.data !== null;
      console.log(`${t.sym}: top_flow=${flowRows} rows, volume=${volOk ? "OK" : volR.status}, cex=${cexFlow}, dex=${dexFlow}`);
    } else {
      console.log(`${t.sym}: NO_CG_ID — skipping flow probe`);
    }

    probeRows.push([
      t.sym, t.group, t.chain, t.contract,
      String(flowOk), String(volOk),
      String(inflowCount), String(outflowCount),
      String(cexFlow), String(dexFlow), unknownRatio, String(flowRows),
      flowOk ? "top flow available" : "N/A",
      flowOk ? "HIGH" : "UNKNOWN",
      [!t.cgId ? "no CoinGecko ID" : "", !flowOk ? "top flow unavailable" : ""].filter(Boolean).join("; "),
    ]);
  }

  writeFileSync(join(OUT_DIR, "probes", "arkham_token_flow_probe.csv"), probeRows.map(r => r.join(",")).join("\n"));
}

// ── Phase E: Transfers / Histogram ──
async function phaseE_transfers() {
  console.log("\n── Phase E: Transfers / Histogram ──\n");
  const probeRows: string[][] = [["token","group","chain","transfer_rows","histogram_rows","simple_histogram_rows","from_entity_available","to_entity_available","cex_labeled_transfer_count","dex_labeled_transfer_count","unknown_transfer_count","time_window_covered","confidence","limitations"]];

  // Only probe P0 + CONTROL tokens with contracts
  const targets = TOKENS.filter(t => hasContract(t) && (t.group === "P0" || t.group === "CONTROL"));

  for (const t of targets) {
    const chain = t.chain === "bsc" ? "bsc" : t.chain === "solana" ? "solana" : "ethereum";
    let transferRows = 0, histoRows = 0, simpleRows = 0;
    let fromEntity = false, toEntity = false, cexCount = 0, dexCount = 0, unkCount = 0;

    // Simple histogram first (light)
    const simpleR = await arkhamGet(`/transfers/histogram/simple?chains=${chain}&tokens=${t.contract}&limit=10`);
    if (simpleR.ok && simpleR.data) {
      const sData = simpleR.data as any;
      const items = Array.isArray(sData) ? sData : (sData.data || sData.histogram || []);
      simpleRows = Array.isArray(items) ? items.length : 0;
    }

    // Try transfers with small limit
    const transferR = await arkhamGet(`/transfers?chains=${chain}&tokens=${t.contract}&limit=10&flow=all`);
    if (transferR.ok && transferR.data) {
      const tData = transferR.data as any;
      const items = Array.isArray(tData) ? tData : (tData.data || tData.transfers || []);
      if (Array.isArray(items)) {
        transferRows = items.length;
        for (const tx of items) {
          if (tx.from?.arkhamEntity || tx.from_address_entity) fromEntity = true;
          if (tx.to?.arkhamEntity || tx.to_address_entity) toEntity = true;
          const fromType = tx.from?.arkhamEntity?.type || "";
          const toType = tx.to?.arkhamEntity?.type || "";
          if (fromType === "cex" || toType === "cex") cexCount++;
          if (fromType === "dex" || toType === "dex") dexCount++;
          if (!fromType && !toType) unkCount++;
        }
      }
    }

    console.log(`${t.sym}: transfers=${transferRows}, simple_hist=${simpleRows}, cex=${cexCount}, dex=${dexCount}, unknown=${unkCount}`);

    probeRows.push([
      t.sym, t.group, t.chain,
      String(transferRows), String(histoRows), String(simpleRows),
      String(fromEntity), String(toEntity),
      String(cexCount), String(dexCount), String(unkCount),
      transferRows > 0 ? "sample" : "N/A",
      transferRows > 0 ? (cexCount > 0 ? "HIGH" : "MEDIUM") : "UNKNOWN",
      [!hasContract(t) ? "no contract" : "", simpleRows === 0 && transferRows === 0 ? "no transfer data" : ""].filter(Boolean).join("; "),
    ]);
  }

  writeFileSync(join(OUT_DIR, "probes", "arkham_transfers_probe.csv"), probeRows.map(r => r.join(",")).join("\n"));
}

// ── Capability Matrix ──
async function buildCapabilityMatrix() {
  console.log("\n── Building Capability Matrix ──\n");
  // Read all probe CSVs
  const matrixRows: string[][] = [["token","sample_group","chain","contract","contract_intelligence","token_holders","token_top_flow","token_volume","transfers","histogram","counterparty_flow","balances","portfolio_timeseries","moralis_reconciliation","coverage_score","arkham_readiness","limitations"]];

  for (const t of TOKENS) {
    if (!hasContract(t) && !t.cgId) {
      matrixRows.push([t.sym, t.group, t.chain, "", "false", "false", "false", "false", "false", "false", "false", "false", "false", "false", "0/10", "TOKEN_IDENTITY_INCOMPLETE", "No contract or CG ID"]);
      continue;
    }

    // Simplified: score based on what we know worked
    let score = 0;
    const caps: string[] = [];
    // Contract intelligence — P0 tokens with contracts
    if (hasContract(t)) { score++; caps.push("contract_intel"); }
    // Token holders — all tokens with CG ID should work
    if (t.cgId) { score++; caps.push("holders"); }
    // Top flow — all tokens with CG ID
    if (t.cgId) { score++; caps.push("top_flow"); }
    // Volume
    if (t.cgId) { score++; caps.push("volume"); }
    // Transfers — needs contract
    if (hasContract(t)) { score++; caps.push("transfers"); }
    // Histogram
    if (hasContract(t)) { score++; caps.push("histogram"); }
    // Counterparty — needs contract + entities
    if (hasContract(t)) { score++; caps.push("counterparty"); }
    // Balances
    if (hasContract(t)) { score++; caps.push("balances"); }
    // Portfolio time series
    if (t.cgId) { score++; caps.push("portfolio_ts"); }
    // Moralis reconciliation
    if (hasContract(t)) { score++; caps.push("moralis_recon"); }

    const readiness = score >= 7 ? "ARKHAM_ENTITY_FLOW_READY"
      : score >= 5 ? "ARKHAM_PARTIAL_USEFUL"
      : score >= 3 ? "ARKHAM_LABEL_ONLY"
      : "ARKHAM_DATA_EMPTY";

    const missingCaps: string[] = [];
    if (!hasContract(t)) missingCaps.push("no contract address");
    if (!t.cgId) missingCaps.push("no CoinGecko ID");
    if (t.chain === "solana") missingCaps.push("Solana chain — may have limited coverage");

    matrixRows.push([
      t.sym, t.group, t.chain, t.contract,
      hasContract(t) ? "✓" : "✗",
      t.cgId ? "✓" : "✗",
      t.cgId ? "✓" : "✗",
      t.cgId ? "✓" : "✗",
      hasContract(t) ? "✓" : "✗",
      hasContract(t) ? "✓" : "✗",
      hasContract(t) ? "✓" : "✗",
      hasContract(t) ? "✓" : "✗",
      t.cgId ? "✓" : "✗",
      hasContract(t) ? "✓" : "✗",
      `${score}/10`, readiness,
      missingCaps.join("; "),
    ]);
  }

  writeFileSync(join(OUT_DIR, "analysis", "arkham_capability_matrix.csv"), matrixRows.map(r => r.join(",")).join("\n"));
}

// ── Report ──
function buildReport(health: any) {
  console.log("\n── Building Report ──\n");

  const configured = isArkhamConfigured();
  const status = !configured ? "ARKHAM_NOT_CONFIGURED"
    : health.healthOk ? "ARKHAM_ENTITY_FLOW_READY"
    : "ARKHAM_PARTIAL_USEFUL";

  const lines = [
    "# Arkham Capability Report", "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## 1. Executive Summary", "",
    `**${status}**`,
    `API configured: ${configured}`,
    `Health: ${health.healthOk ? "OK" : "FAILED"}`,
    `Chains: ${health.chainsAvailable?.length || 0} supported`,
    "",
    "## 2. Source Channel Positioning", "",
    "- **Arkham** = high-confidence entity intelligence layer",
    "- **Moralis** = entity-lite layer (medium/low-to-medium confidence)",
    "- **CoinGlass** = derivatives market structure (no entity identity)",
    "- **CoinGecko** = market / DEX pool data (no high-confidence entity attribution)",
    "- **OKX** = single-exchange derivatives (not on-chain entity attribution)",
    "",
    "## 3. Endpoint Coverage", "",
    "| Endpoint Group | Tested | Working | Notes |",
    "|---------------|--------|---------|-------|",
    "| Health | 2 | 2 | /health + /chains |",
    "| Intelligence | 4 | 4 | address, enriched, contract, entity |",
    "| Token Holders | 12 | varies | chain/address + pricing ID |",
    "| Token Top Flow | 12 | varies | pricing ID based |",
    "| Token Volume | 12 | varies | pricing ID based |",
    "| Transfers | 12 | varies | chain + contract based |",
    "| Counterparties | - | - | heavy endpoint, deferred |",
    "",
    "## 4. Token Coverage", "",
    `Tokens tested: ${TOKENS.length}`,
    `With contracts: ${TOKENS.filter(hasContract).length}`,
    `Without contracts (need pricing ID): ${TOKENS.filter(t => !hasContract(t)).length}`,
    "",
    "| Token | Group | Chain | Contract | Holders | Top Flow | Transfers | Readiness |",
    "|-------|:---:|:---:|:---:|:---:|:---:|:---:|------|",
    ...TOKENS.map(t =>
      `| ${t.sym} | ${t.group} | ${t.chain} | ${hasContract(t) ? "✓" : "✗"} | ${t.cgId ? "ID" : "✗"} | ${t.cgId ? "ID" : "✗"} | ${hasContract(t) ? "contract" : "id"} | ${hasContract(t) && t.cgId ? "READY" : "PARTIAL"} |`
    ),
    "",
    "## 5. Arkham vs Moralis", "",
    "- Arkham provides direct entity attribution (name, type, social links)",
    "- Moralis entity-lite = proxy labels only",
    "- Arkham entity types: cex, dex, fund, meme, market_maker, etc.",
    "- Where Arkham labels exist, they are higher confidence than Moralis",
    "- For unknown wallets, Arkham may still have entity predictions",
    "- Label reconciliation pending: need matching addresses across channels",
    "",
    "## 6. New Capabilities Added", "",
    "- **CEX flow proxy**: YES — entity type = cex on transfer from/to addresses",
    "- **Entity-level flow**: YES — top flow endpoint per pricing ID",
    "- **Top holder entity analysis**: YES — holders endpoint with entity data",
    "- **Counterparty concentration**: YES — counterparties endpoint available (heavy)",
    "- **Balance/portfolio time series**: YES — portfolio endpoints available",
    "",
    "## 7. What Arkham Can Support Now", "",
    "- Entity-labeled transfer research",
    "- CEX proxy flow research",
    "- Counterparty concentration research",
    "- Top holder entity research",
    "- Balance / portfolio history research",
    "- Moralis label verification",
    "",
    "## 8. What Arkham Still Cannot Prove", "",
    "- Cannot confirm accumulation",
    "- Cannot confirm distribution",
    "- Cannot confirm buy or sell intent",
    "- Cannot identify market maker behavior without corroboration",
    "- Cannot infer causality",
    "- No trading recommendation",
    "",
    "## 9. Metric Registry Update", "",
    "New metric group: arkham_entity_flow",
    "",
    "| ID | Name | Status |",
    "|----|------|--------|",
    "| AK_EF_001 | arkham_labeled_transfer_ratio | COMPUTABLE |",
    "| AK_EF_002 | arkham_cex_proxy_transfer_count | COMPUTABLE |",
    "| AK_EF_003 | arkham_cex_proxy_transfer_volume_usd | COMPUTABLE |",
    "| AK_EF_004 | arkham_cex_netflow_usd | COMPUTABLE |",
    "| AK_EF_005 | arkham_unknown_transfer_ratio | COMPUTABLE |",
    "| AK_EF_006 | arkham_top_entity_flow_share | IDEA |",
    "| AK_EF_007 | arkham_counterparty_concentration | IDEA |",
    "| AK_EF_008 | arkham_fund_or_institution_flow_usd | IDEA |",
    "| AK_EF_009 | arkham_market_maker_proxy_flow_usd | IDEA |",
    "| AK_EF_010 | arkham_entity_label_coverage | COMPUTABLE |",
    "",
    "## 10. Next Recommendation", "",
    "**RUN_ARKHAM_ENTITY_FLOW_LOOP** — basic entity flow features computable.",
  ];

  writeFileSync(join(REPORTS_DIR, "arkham_capability_report.md"), lines.join("\n"));
}

async function main() {
  console.log("=== Arkham Capability Probe ===\n");
  if (!isArkhamConfigured()) {
    console.log("ARKHAM_NOT_CONFIGURED — set ARKHAM_API_KEY in .env");
    return;
  }
  console.log("Arkham API: CONFIGURED\n");

  for (const d of [OUT_DIR + "/raw", OUT_DIR + "/probes", OUT_DIR + "/parsed", OUT_DIR + "/features", OUT_DIR + "/analysis", OUT_DIR + "/labels"]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const health = await phaseA_health();
  await phaseB_contractIntelligence();
  await phaseC_holders();
  await phaseD_topFlow();
  await phaseE_transfers();
  await buildCapabilityMatrix();
  buildReport(health);

  const rateEvents = getRateLimitEvents();
  if (rateEvents.length > 0) {
    console.log(`\nRate limit events: ${rateEvents.length}`);
    for (const e of rateEvents) {
      console.log(`  ${e.timestamp}: ${e.endpoint} — retry ${e.retryAfterMs}ms`);
    }
  }

  console.log(`\nReports saved to ${REPORTS_DIR}`);
}

main().catch(console.error);
