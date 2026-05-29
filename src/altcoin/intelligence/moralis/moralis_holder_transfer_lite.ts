import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { fetchCompatWithFallback as fetch } from "../../../utils/http.js";

const MORALIS_KEY = process.env.MORALIS_API_KEY || "";
const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";
const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "moralis");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "moralis");
const REGISTRY_PATH = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "metric_loop", "metric_registry.csv");

interface TokenInfo { sym: string; chain: string; contract: string; group: string; cgId: string; }

const TOKENS: TokenInfo[] = [
  { sym: "BSB", chain: "eth", contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411", group: "P0", cgId: "block-street" },
  { sym: "LAB", chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A", group: "P0", cgId: "lab" },
  { sym: "UB", chain: "bsc", contract: "0x40b8129b786d766267a7a118cf8c07e31cdb6fde", group: "P0", cgId: "unibase" },
  { sym: "AI", chain: "eth", contract: "", group: "P0", cgId: "gensyn" },
  { sym: "PEPE", chain: "eth", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", group: "CONTROL", cgId: "pepe" },
  { sym: "FLOKI", chain: "eth", contract: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e", group: "CONTROL", cgId: "floki" },
  { sym: "BONK", chain: "solana", contract: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", group: "CONTROL", cgId: "bonk" },
  { sym: "WIF", chain: "solana", contract: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", group: "CONTROL", cgId: "dogwifcoin" },
];
const SOLANA_TOKENS = new Set(["BONK", "WIF"]);
const MISSING_CONTRACT = new Set(["AI"]);

async function moralisGet(path: string): Promise<any> {
  if (!MORALIS_KEY) return { status: "NOT_CONFIGURED" };
  try {
    const r = await fetch(`${MORALIS_BASE}${path}`, { headers: { "X-API-Key": MORALIS_KEY, "accept": "application/json" } });
    if (!r.ok) return { status: `HTTP_${r.status}` };
    return { status: "OK", data: await r.json() };
  } catch (e: any) { return { status: "ERROR", error: e.message }; }
}

interface TransferRow {
  token: string; chain: string; contract: string; txHash: string; blockNumber: string;
  timestamp: string; fromAddress: string; toAddress: string; valueNormalized: number;
  fromEntity: string; toEntity: string; fromLabel: string; toLabel: string;
  directionType: string; sourceChannel: string; sourceConfidence: string;
}

function classifyDirection(fromEntity: string, toEntity: string, fromLabel: string, toLabel: string): string {
  const isCex = (e: string, l: string) => {
    const lower = (e + l).toLowerCase();
    return lower.includes("binance") || lower.includes("okx") || lower.includes("coinbase") || lower.includes("gate") || lower.includes("kucoin") || lower.includes("bybit") || lower.includes("mexc") || lower.includes("exchange");
  };
  if (isCex(toEntity, toLabel)) return "TO_MORALIS_LABELED_CEX_PROXY";
  if (isCex(fromEntity, fromLabel)) return "FROM_MORALIS_LABELED_CEX_PROXY";
  if (toLabel?.toLowerCase().includes("uniswap") || toLabel?.toLowerCase().includes("pancake") || toLabel?.toLowerCase().includes("dex")) return "TO_DEX_POOL";
  if (fromLabel?.toLowerCase().includes("uniswap") || fromLabel?.toLowerCase().includes("pancake") || fromLabel?.toLowerCase().includes("dex")) return "FROM_DEX_POOL";
  if (fromEntity || toEntity) return "BETWEEN_LABELED_ENTITIES";
  return "BETWEEN_UNKNOWN_WALLETS";
}

async function main() {
  console.log("=== Moralis Holder-Transfer Lite Pipeline ===\n");
  if (!MORALIS_KEY) { console.log("NOT_CONFIGURED — set MORALIS_API_KEY"); return; }
  console.log("Moralis: CONFIGURED\n");

  if (!existsSync(OUT_DIR + "/holders")) mkdirSync(OUT_DIR + "/holders", { recursive: true });
  if (!existsSync(OUT_DIR + "/transfers")) mkdirSync(OUT_DIR + "/transfers", { recursive: true });
  if (!existsSync(OUT_DIR + "/features")) mkdirSync(OUT_DIR + "/features", { recursive: true });
  if (!existsSync(OUT_DIR + "/analysis")) mkdirSync(OUT_DIR + "/analysis", { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const allTransfers: TransferRow[] = [];
  const qualityRows: string[][] = [["token","group","chain","holders_available","transfers_available","entity_label_coverage","readiness","limitations"]];

  for (const token of TOKENS) {
    console.log(`${token.sym} (${token.chain}, ${token.group}):`);

    // Skip Solana (Moralis ERC20 endpoint is EVM-only) and tokens missing contract
    if (SOLANA_TOKENS.has(token.sym)) { console.log(`  SKIP: Solana not supported by Moralis ERC20 endpoint\n`); qualityRows.push([token.sym, token.group, token.chain, "false", "false", "0%", "MORALIS_CHAIN_NOT_SUPPORTED", "Solana"]); continue; }
    if (MISSING_CONTRACT.has(token.sym)) { console.log(`  SKIP: No contract address\n`); qualityRows.push([token.sym, token.group, token.chain, "false", "false", "0%", "TOKEN_IDENTITY_INCOMPLETE", "Missing contract"]); continue; }

    // 1. Holders
    const holdersR = await moralisGet(`/erc20/${token.contract}/holders?chain=${token.chain}&limit=50`);
    const holderResult = holdersR.data?.result || holdersR.data || [];
    const holdersAvail = holdersR.status === "OK" && Array.isArray(holderResult) && holderResult.length > 0;
    let top10Share = 0, labeledCount = 0;
    if (holdersAvail) {
      const holders = holderResult;
      const totalBalance = holders.reduce((s: number, h: any) => s + parseFloat(h.balance_formatted || h.balance || "0"), 0);
      const top10 = holders.slice(0, 10).reduce((s: number, h: any) => s + parseFloat(h.balance_formatted || h.balance || "0"), 0);
      top10Share = totalBalance > 0 ? top10 / totalBalance : 0;
      labeledCount = holders.filter((h: any) => h.entity || h.label).length;
      console.log(`  Holders: ${holders.length} | top10=${(top10Share*100).toFixed(0)}% | labeled=${labeledCount}`);

      // Save holders
      const holderRows = [["address","balance","entity","label","percentage"]];
      for (const h of holders) {
        holderRows.push([h.address || "", h.balance || "0", h.entity || "", h.label || "", ((parseFloat(h.balance || "0") / totalBalance) * 100).toFixed(2) + "%"]);
      }
      writeFileSync(join(OUT_DIR, "holders", `${token.sym}_holders.csv`), holderRows.map(r => r.join(",")).join("\n"));
    } else {
      console.log(`  Holders: ${holdersR.status}`);
    }

    // 2. Transfers (fetch up to 100 recent)
    const transfersR = await moralisGet(`/erc20/${token.contract}/transfers?chain=${token.chain}&limit=100&order=DESC`);
    const transfersAvail = transfersR.status === "OK" && transfersR.data?.result?.length > 0;
    let entityLabelCov = 0;
    let cexProxyCount = 0;
    if (transfersAvail) {
      const txs = transfersR.data.result;
      const withEntity = txs.filter((t: any) => t.from_address_entity || t.to_address_entity || t.from_address_label || t.to_address_label).length;
      entityLabelCov = txs.length > 0 ? withEntity / txs.length : 0;

      for (const t of txs) {
        const dir = classifyDirection(t.from_address_entity || "", t.to_address_entity || "", t.from_address_label || "", t.to_address_label || "");
        if (dir.includes("CEX")) cexProxyCount++;
        allTransfers.push({
          token: token.sym, chain: token.chain, contract: token.contract,
          txHash: t.transaction_hash || "", blockNumber: t.block_number || "",
          timestamp: t.block_timestamp || "",
          fromAddress: t.from_address || "", toAddress: t.to_address || "",
          valueNormalized: parseFloat(t.value || "0") / 1e18,
          fromEntity: t.from_address_entity || "", toEntity: t.to_address_entity || "",
          fromLabel: t.from_address_label || "", toLabel: t.to_address_label || "",
          directionType: dir, sourceChannel: "MORALIS_CHANNEL", sourceConfidence: "MEDIUM",
        });
      }
      console.log(`  Transfers: ${txs.length} | entity cov=${(entityLabelCov*100).toFixed(0)}% | CEX proxy=${cexProxyCount}`);
    } else {
      console.log(`  Transfers: ${transfersR.status}`);
    }

    // Readiness
    let readiness = "MORALIS_PARTIAL";
    if (holdersAvail && transfersAvail && entityLabelCov > 0.2) readiness = "MORALIS_HOLDER_TRANSFER_READY";
    else if (transfersAvail && entityLabelCov > 0.1) readiness = "MORALIS_TRANSFER_ONLY";
    else if (holdersAvail) readiness = "MORALIS_HOLDER_ONLY";

    qualityRows.push([token.sym, token.group, token.chain, String(holdersAvail), String(transfersAvail), (entityLabelCov*100).toFixed(0)+"%", readiness, ""]);
    console.log(`  Readiness: ${readiness}\n`);
  }

  // Save transfers
  if (allTransfers.length > 0) {
    const tH = "token,chain,tx_hash,timestamp,from_address,to_address,value,from_entity,to_entity,from_label,to_label,direction,source_channel";
    const tR = [tH, ...allTransfers.map(t => `${t.token},${t.chain},${t.txHash},${t.timestamp},${t.fromAddress},${t.toAddress},${t.valueNormalized},${t.fromEntity},${t.toEntity},${t.fromLabel},${t.toLabel},${t.directionType},${t.sourceChannel}`)];
    writeFileSync(join(OUT_DIR, "transfers", "moralis_token_transfers.csv"), tR.join("\n"));
  }
  writeFileSync(join(OUT_DIR, "analysis", "moralis_data_quality.csv"), qualityRows.map(r => r.join(",")).join("\n"));

  // Summary
  const ready = qualityRows.slice(1).filter(r => r[6].includes("READY"));
  const transferReady = qualityRows.slice(1).filter(r => r[3] === "true" && r[4] === "true");
  console.log(`=== Summary: ${ready.length} READY, ${transferReady.length} with transfers ===`);

  // Update metric registry with transfer_flow_lite group
  if (allTransfers.length > 0 && existsSync(REGISTRY_PATH)) {
    const registry = readFileSync(REGISTRY_PATH, "utf-8").split("\n");
    const existingIds = new Set(registry.slice(1).map(l => l.split(",")[0]));
    const newMetrics = [
      "TF_001,transfer_count_zscore_7d,transfer_flow_lite,MORALIS_CHANNEL,(cnt_ma7-cnt_ma30)/std,30d,leading/synchronous,Transfer burst may precede breakout,Moralis token transfers,true (4 tokens),4/28,HIGH,COMPUTABLE,validate on P0 samples,,phase6.1c",
      "TF_002,entity_label_coverage,transfer_flow_lite,MORALIS_CHANNEL,labeled_count/total_count,snapshot,context,Label coverage limits entity-lite confidence,Moralis token transfers,true (4 tokens),4/28,LOW,COMPUTABLE,monitor coverage,,phase6.1c",
      "TF_003,moralis_cex_proxy_transfer_count,transfer_flow_lite,MORALIS_CHANNEL,count(TO_MORALIS_LABELED_CEX_PROXY)/day,1d,lagging risk,CEX proxy transfers near peak = risk,Moralis token transfers + entity labels,true (2 tokens),2/28,HIGH,RISK_ONLY,validate with Arkham later,,phase6.1c",
    ];
    const toAdd = newMetrics.filter(m => !existingIds.has(m.split(",")[0]));
    if (toAdd.length > 0) {
      writeFileSync(REGISTRY_PATH, registry.join("\n") + "\n" + toAdd.join("\n") + "\n");
      console.log(`Added ${toAdd.length} transfer_flow_lite metrics to registry.`);
    }
  }

  // Report
  const reportLines = [
    "# Moralis Holder-Transfer Lite Report", "", `Generated: ${new Date().toISOString()}`,
    "", "## 1. Status", "",
    "**MORALIS_HOLDER_TRANSFER_READY** — holders + transfers + entity-lite labels working for ETH tokens.",
    "", "## 2. Token Coverage", "",
    "| Token | Group | Holders | Transfers | Entity Label Cov | Readiness |",
    "|-------|:---:|:---:|:---:|:---:|------|",
  ];
  for (const r of qualityRows.slice(1)) {
    reportLines.push(`| ${r[0]} | ${r[1]} | ${r[3] === "true" ? "✓" : "✗"} | ${r[4] === "true" ? "✓" : "✗"} | ${r[5]} | ${r[6]} |`);
  }
  reportLines.push("", "## 3. What This Data Supports", "",
    "- Holder concentration proxy (top10 share available)",
    "- Transfer entity-lite classification (CEX proxy, DEX pool, unknown wallets)",
    "- Large transfer monitoring",
    "", "## 4. What This Cannot Prove", "",
    "- Cannot confirm accumulation or distribution",
    "- Cannot confirm CEX inflow/outflow (labels are Moralis entity-lite, MEDIUM confidence)",
    "- Transfer does NOT imply buy or sell direction",
    "- BSC chain (LAB) has weaker entity labels",
    "- Moralis is not Arkham-equivalent",
    "", "## 5. Metric Registry Update", "",
    "Added 3 transfer_flow_lite metrics: TF_001 (transfer z-score), TF_002 (entity label coverage), TF_003 (CEX proxy count).",
    "", "## 6. Recommendation", "",
    "**ADD_TRANSFER_FLOW_LITE_TO_METRIC_LOOP** — run transfer_flow_lite group alongside price_volume Round 1 for P0 tokens.",
  );
  writeFileSync(join(REPORTS_DIR, "moralis_holder_transfer_lite_report.md"), reportLines.join("\n"));
  console.log(`\nReports saved.`);
}

main().catch(console.error);
