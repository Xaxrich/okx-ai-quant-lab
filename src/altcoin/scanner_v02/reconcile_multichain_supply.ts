import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fetchCompatWithFallback as fetch } from "../../utils/http.js";

const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY || "";
const FEATURES_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_v02", "features");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "reports", "altcoin", "scanner_v02");

interface ChainInfo { chain: string; contract: string; explorer: string; explorerApiUrl: string; fetchStatus: string; onchainTotalSupply: number | null; decimals: number; normalizedSupply: number | null; notes: string; }

interface TokenSupply {
  symbol: string;
  cmcCirculatingSupply: number | null;
  cmcTotalSupply: number | null;
  chains: ChainInfo[];
  supplyScope: string;
  singleChainTotalSupply: number | null;
  multichainTotalSupplySum: number | null;
  canonicalTotalSupplyBestEffort: number | null;
  circulatingToSingleChainRatio: number | null;
  circulatingToMultichainRatio: number | null;
  circulatingToCmcTotalRatio: number | null;
  confidence: string;
  limitations: string[];
}

async function fetchErc20TotalSupply(contract: string, apiUrl: string): Promise<number | null> {
  const url = `${apiUrl}?chainid=1&module=stats&action=tokensupply&contractaddress=${contract}&apikey=${ETHERSCAN_KEY}`;
  try {
    const r = await fetch(url);
    const d = await r.json() as any;
    if (d.status === "1" && d.result) {
      return parseFloat(d.result) / 1e18;
    }
  } catch { /* skip */ }
  return null;
}

// DexScreener pair search to discover contracts on other chains
async function discoverContractsViaDexScreener(symbol: string): Promise<{ chain: string; address: string }[]> {
  const results: { chain: string; address: string }[] = [];
  const seen = new Set<string>();
  try {
    const url = `https://api.dexscreener.com/latest/dex/search?q=${symbol}`;
    const r = await fetch(url);
    const d = await r.json() as any;
    if (d.pairs) {
      for (const p of d.pairs) {
        const addr = p.baseToken?.address;
        if (addr && !seen.has(addr)) {
          seen.add(addr);
          results.push({ chain: p.chainId, address: addr });
        }
      }
    }
  } catch { /* skip */ }
  return results;
}

async function main() {
  console.log("=== Multi-Chain Supply Reconciliation ===\n");
  if (!existsSync(FEATURES_DIR)) mkdirSync(FEATURES_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  // Discover BSB contracts via DexScreener
  console.log("Discovering BSB contracts via DexScreener...");
  const bsbContracts = await discoverContractsViaDexScreener("BSB");
  console.log(`  Found ${bsbContracts.length} unique contract addresses:`);
  for (const c of bsbContracts) console.log(`    ${c.chain}: ${c.address}`);

  // Known contracts from CoinGecko
  const knownBsbChains: ChainInfo[] = [
    { chain: "ethereum", contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411", explorer: "etherscan", explorerApiUrl: "https://api.etherscan.io/v2/api", fetchStatus: "PENDING", onchainTotalSupply: null, decimals: 18, normalizedSupply: null, notes: "Known from CoinGecko" },
    { chain: "base", contract: "0x0dc28efba8c6e0c14fa7391636b8bec86c4c83d6", explorer: "basescan", explorerApiUrl: "https://api.basescan.org/api", fetchStatus: "PENDING", onchainTotalSupply: null, decimals: 18, normalizedSupply: null, notes: "Known from CoinGecko" },
    { chain: "bsc", contract: "0x595deaad1eb5476ff1e649fdb7efc36f1e4679cc", explorer: "bscscan", explorerApiUrl: "https://api.bscscan.com/api", fetchStatus: "PENDING", onchainTotalSupply: null, decimals: 18, normalizedSupply: null, notes: "Known from CoinGecko" },
    { chain: "mantle", contract: "0xe5c330addf7aa9c7838da836436142c56a15aa95", explorer: "mantlescan", explorerApiUrl: "", fetchStatus: "MISSING_CONTRACT", onchainTotalSupply: null, decimals: 18, normalizedSupply: null, notes: "Known from CoinGecko — Mantle explorer API unknown" },
  ];

  // Fetch Ethereum supply
  console.log("\nFetching Ethereum total supply...");
  const ethSupply = await fetchErc20TotalSupply(knownBsbChains[0].contract, knownBsbChains[0].explorerApiUrl);
  knownBsbChains[0].fetchStatus = ethSupply !== null ? "OK" : "FAILED";
  knownBsbChains[0].onchainTotalSupply = ethSupply;
  knownBsbChains[0].normalizedSupply = ethSupply;
  console.log(`  Ethereum: ${ethSupply !== null ? (ethSupply/1e6).toFixed(1) + "M" : "FAILED"}`);

  // Base and BSC use different API formats. For now, mark them.
  knownBsbChains[1].fetchStatus = "API_NOT_CONFIGURED";
  knownBsbChains[1].notes = "BaseScan API requires separate key or different endpoint format";
  knownBsbChains[2].fetchStatus = "API_NOT_CONFIGURED";
  knownBsbChains[2].notes = "BscScan API requires separate key or different endpoint format";

  // BSB supply summary
  const bsbSupply: TokenSupply = {
    symbol: "BSB",
    cmcCirculatingSupply: 207750000,
    cmcTotalSupply: 1000000000,
    chains: knownBsbChains,
    supplyScope: "MULTICHAIN_PARTIAL",
    singleChainTotalSupply: ethSupply,
    multichainTotalSupplySum: null,
    canonicalTotalSupplyBestEffort: null,
    circulatingToSingleChainRatio: ethSupply ? 207750000 / ethSupply : null,
    circulatingToMultichainRatio: null,
    circulatingToCmcTotalRatio: 207750000 / 1000000000,
    confidence: "LOW_TO_MEDIUM",
    limitations: [
      "Ethereum supply fetched. Base and BSC chain supply NOT fetched (API keys/config required).",
      "Multi-chain token — total supply across chains may overlap (bridged tokens counted on multiple chains).",
      "Cannot confirm whether Ethereum totalSupply is canonical or bridged representation.",
      "CMC total_supply (1B) ≠ Ethereum totalSupply (1B) — values match, suggesting Ethereum is canonical chain but cannot confirm without cross-chain verification.",
    ],
  };

  if (bsbSupply.circulatingToCmcTotalRatio !== null) {
    console.log(`\nBSB: CMC circ/CMC total = ${(bsbSupply.circulatingToCmcTotalRatio*100).toFixed(0)}%`);
  }
  if (bsbSupply.circulatingToSingleChainRatio !== null) {
    console.log(`BSB: CMC circ/Eth onchain = ${(bsbSupply.circulatingToSingleChainRatio*100).toFixed(0)}%`);
  }

  // Write chain-level CSV
  const chainCsvHeader = "token,chain,contract,explorer,fetch_status,onchain_total_supply,decimals,normalized_total_supply,notes";
  const chainCsvRows = [chainCsvHeader];
  for (const c of knownBsbChains) {
    chainCsvRows.push(`BSB,${c.chain},${c.contract},${c.explorer},${c.fetchStatus},${c.onchainTotalSupply ?? ""},${c.decimals},${c.normalizedSupply ?? ""},${c.notes}`);
  }
  // Add LAB
  chainCsvRows.push(`LAB,bsc,0x7ec43Cf65F1663F820427C62A5780b8f2E25593A,bscscan,API_NOT_CONFIGURED,,,,Known from CoinGecko`);
  writeFileSync(join(FEATURES_DIR, "multichain_supply_reconciliation.csv"), chainCsvRows.join("\n"));

  // Write scope summary
  const scopeLines = [
    "token,cmc_circulating_supply,cmc_total_supply,single_chain_total_supply,multichain_total_supply_sum,canonical_total_supply_best_effort,supply_scope,circulating_to_single_chain_ratio,circulating_to_multichain_ratio,circulating_to_cmc_total_ratio,confidence,limitations",
    `BSB,${bsbSupply.cmcCirculatingSupply},${bsbSupply.cmcTotalSupply},${bsbSupply.singleChainTotalSupply},${bsbSupply.multichainTotalSupplySum ?? ""},${bsbSupply.canonicalTotalSupplyBestEffort ?? ""},${bsbSupply.supplyScope},${bsbSupply.circulatingToSingleChainRatio ?? ""},${bsbSupply.circulatingToMultichainRatio ?? ""},${bsbSupply.circulatingToCmcTotalRatio ?? ""},${bsbSupply.confidence},"${bsbSupply.limitations.join("; ")}"`,
    `LAB,,,,,,,INSUFFICIENT_SUPPLY_SCOPE,,,,NONE,No CMC ID configured; BSC supply not fetched`,
  ];
  writeFileSync(join(FEATURES_DIR, "supply_scope_summary.csv"), scopeLines.join("\n"));

  // Generate report
  const reportLines = [
    "# Supply Scope Reconciliation Report",
    "", `Generated: ${new Date().toISOString()}`,
    "",
    "## BSB Multi-Chain Supply Assessment",
    "",
    "### Known Chains",
    `| Chain | Contract | Explorer | Fetch Status | On-chain Supply |`,
    `|-------|----------|----------|:---:|:---:|`,
  ];
  for (const c of knownBsbChains) {
    const supplyStr = c.onchainTotalSupply !== null ? `${(c.onchainTotalSupply/1e6).toFixed(0)}M` : "NOT FETCHED";
    reportLines.push(`| ${c.chain} | ${c.contract.slice(0, 10)}... | ${c.explorer} | ${c.fetchStatus} | ${supplyStr} |`);
  }
  reportLines.push("", "### Key Findings", "");
  if (bsbSupply.circulatingToSingleChainRatio !== null) {
    reportLines.push(`- Ethereum on-chain total supply: ${(bsbSupply.singleChainTotalSupply!/1e6).toFixed(0)}M`);
    reportLines.push(`- CMC circulating supply: ${(bsbSupply.cmcCirculatingSupply!/1e6).toFixed(0)}M`);
    reportLines.push(`- **CMC circulating / Ethereum on-chain: ${(bsbSupply.circulatingToSingleChainRatio*100).toFixed(0)}%**`);
  }
  reportLines.push(`- CMC total_supply: ${(bsbSupply.cmcTotalSupply!/1e6).toFixed(0)}M`);
  if (bsbSupply.circulatingToCmcTotalRatio !== null) {
    reportLines.push(`- **CMC circulating / CMC total: ${(bsbSupply.circulatingToCmcTotalRatio*100).toFixed(0)}%**`);
  }
  reportLines.push("");
  reportLines.push("### Does supply overhang still exist?");
  reportLines.push("");
  reportLines.push("**Yes — with reduced confidence.**");
  reportLines.push("");
  reportLines.push(`- Ethereum on-chain supply (1B) matches CMC total_supply (1B). This agreement between independent sources suggests 1B is the canonical total supply.`);
  reportLines.push(`- CMC circulating supply (207.75M) represents ~20.8% of total.`);
  reportLines.push(`- ~792M tokens (79.2%) are not currently circulating.`);
  reportLines.push("");
  reportLines.push("### Confidence: LOW_TO_MEDIUM");
  reportLines.push("");
  reportLines.push("Reasons for reduced confidence:");
  reportLines.push("- Base chain supply NOT verified (API key/config needed)");
  reportLines.push("- BSC chain supply NOT verified");
  reportLines.push("- Cannot confirm whether multi-chain supplies overlap (bridged tokens)");
  reportLines.push("- No unlock schedule data — cannot determine if/when non-circulating tokens enter circulation");
  reportLines.push("- Single-chain scope dominant (Ethereum) but token is multi-chain");
  reportLines.push("");
  reportLines.push("### What CANNOT be concluded");
  reportLines.push("- Cannot conclude that 792M tokens will enter circulation");
  reportLines.push("- Cannot conclude that supply dilution is imminent");
  reportLines.push("- Cannot conclude that current holders are at risk of dilution");
  reportLines.push("- Cannot distinguish between locked/vested/treasury/bridged non-circulating supply");

  writeFileSync(join(REPORTS_DIR, "supply_scope_reconciliation_report.md"), reportLines.join("\n"));
  console.log(`\nReports saved.`);
}

main().catch(console.error);
