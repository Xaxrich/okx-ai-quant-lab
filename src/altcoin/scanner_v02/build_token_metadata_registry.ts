import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fetchCompatWithFallback as fetch } from "../../utils/http.js";

const REGISTRY_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_v02", "registry");
const CMC_KEY = process.env.COINMARKETCAP_API_KEY || "";

// Known mappings from previous research
const KNOWN: Record<string, { cgId: string; cmcId: number | null; chain: string; contract: string; category: string; notes: string }> = {
  BSB:  { cgId: "block-street", cmcId: 38889, chain: "ethereum", contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411", category: "current_focus", notes: "Multi-chain: ETH/Base/BSC/Mantle/SOL" },
  LAB:  { cgId: "lab", cmcId: null, chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A", category: "current_focus", notes: "BSC primary; CMC ID needs resolution" },
  PEPE: { cgId: "pepe", cmcId: null, chain: "ethereum", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", category: "meme", notes: "" },
  WIF:  { cgId: "dogwifhat", cmcId: null, chain: "solana", contract: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", category: "meme", notes: "" },
  BONK: { cgId: "bonk", cmcId: null, chain: "solana", contract: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", category: "meme", notes: "" },
  FLOKI:{ cgId: "floki", cmcId: null, chain: "ethereum", contract: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e", category: "meme", notes: "" },
  DOGE: { cgId: "dogecoin", cmcId: null, chain: "dogecoin", contract: "", category: "meme", notes: "Native coin, no contract" },
  SHIB: { cgId: "shiba-inu", cmcId: null, chain: "ethereum", contract: "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce", category: "meme", notes: "" },
  POPCAT:{ cgId: "popcat", cmcId: null, chain: "solana", contract: "", category: "meme", notes: "Meme coin" },
  TURBO:{ cgId: "turbo", cmcId: null, chain: "ethereum", contract: "", category: "meme", notes: "Meme coin" },
  FET:  { cgId: "fetch-ai", cmcId: null, chain: "ethereum", contract: "0xaea46A60368A7bD060eec7F8F43AD1b5eF2E5B6e", category: "ai", notes: "" },
  RNDR: { cgId: "render-token", cmcId: null, chain: "ethereum", contract: "0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24", category: "ai", notes: "" },
  TAO:  { cgId: "bittensor", cmcId: null, chain: "bittensor", contract: "", category: "ai", notes: "Native coin, no contract" },
  VIRTUAL:{ cgId: "virtual-protocol", cmcId: null, chain: "ethereum", contract: "", category: "ai", notes: "" },
  PENDLE:{ cgId: "pendle", cmcId: null, chain: "ethereum", contract: "0x808507121b80c02388fad14726482e061b8da827", category: "defi", notes: "" },
  ONDO: { cgId: "ondo-finance", cmcId: null, chain: "ethereum", contract: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3", category: "defi", notes: "" },
  ENA:  { cgId: "ethena", cmcId: null, chain: "ethereum", contract: "0x57e114B691Db790C35207b2e685D4A43181e6061", category: "defi", notes: "" },
  JUP:  { cgId: "jupiter-exchange-solana", cmcId: null, chain: "solana", contract: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", category: "defi", notes: "" },
  PYTH: { cgId: "pyth-network", cmcId: null, chain: "solana", contract: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", category: "defi", notes: "" },
  SEI:  { cgId: "sei-network", cmcId: null, chain: "sei", contract: "", category: "l1", notes: "Native coin" },
  SUI:  { cgId: "sui", cmcId: null, chain: "sui", contract: "", category: "l1", notes: "Native coin" },
  TIA:  { cgId: "celestia", cmcId: null, chain: "celestia", contract: "", category: "l1", notes: "Native coin" },
  BTC:  { cgId: "bitcoin", cmcId: null, chain: "bitcoin", contract: "", category: "control", notes: "Benchmark" },
  ETH:  { cgId: "ethereum", cmcId: null, chain: "ethereum", contract: "", category: "control", notes: "Benchmark" },
  SOL:  { cgId: "solana", cmcId: null, chain: "solana", contract: "", category: "control", notes: "Benchmark" },
  ARB:  { cgId: "arbitrum", cmcId: null, chain: "ethereum", contract: "0x912CE59144191C1204E64559FE8253a0e49E6548", category: "control", notes: "" },
  OP:   { cgId: "optimism", cmcId: null, chain: "ethereum", contract: "0x4200000000000000000000000000000000000042", category: "control", notes: "" },
  PEOPLE:{ cgId: "constitutiondao", cmcId: null, chain: "ethereum", contract: "0x7A58c0Be72BE218B41C608b7Fe7C5bB630736C71", category: "control", notes: "" },
};

async function resolveCmcId(symbol: string): Promise<number | null> {
  if (!CMC_KEY) return null;
  try {
    const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/map?symbol=${symbol}`;
    const r = await fetch(url, { headers: { "X-CMC_PRO_API_KEY": CMC_KEY } });
    if (!r.ok) return null;
    const d = await r.json() as any;
    if (d.data && d.data.length > 0) {
      // Return the first matching CMC ID
      return d.data[0].id;
    }
  } catch { /* skip */ }
  return null;
}

async function main() {
  console.log("=== Token Metadata Registry Builder ===\n");
  if (!existsSync(REGISTRY_DIR)) mkdirSync(REGISTRY_DIR, { recursive: true });

  const rows: string[][] = [[
    "symbol", "name", "category", "coingecko_id", "cmc_id",
    "primary_chain", "contract_address", "is_multichain",
    "dex_enabled", "cex_enabled", "supply_enabled",
    "notes", "manual_confirmation_required"
  ]];

  let resolved = 0, needCmc = 0;

  // Load existing CMC IDs from previous registry to avoid overwriting good data
  const existingCmcIds = new Map<string, string>();
  const registryPath = join(REGISTRY_DIR, "token_metadata_registry.csv");
  if (existsSync(registryPath)) {
    const existing = readFileSync(registryPath, "utf-8").split("\n").slice(1);
    for (const line of existing) {
      const parts = line.split(",");
      if (parts.length >= 5 && parts[4] && parts[4].length > 0) {
        existingCmcIds.set(parts[0], parts[4]);
      }
    }
    console.log(`Loaded ${existingCmcIds.size} CMC IDs from existing registry.`);
  }

  for (const [symbol, info] of Object.entries(KNOWN)) {
    // Try to resolve CMC ID if not known. Check existing registry first.
    let cmcId = info.cmcId;
    const existingRow = existingCmcIds.get(symbol);
    if (cmcId === null && existingRow && existingRow.length > 0) {
      cmcId = parseInt(existingRow);
      if (!isNaN(cmcId)) resolved++;
    }
    if (cmcId === null) {
      console.log(`Resolving CMC ID for ${symbol}...`);
      cmcId = await resolveCmcId(symbol);
      if (cmcId) resolved++;
      else needCmc++;
    }

    const hasContract = info.contract.length > 5;
    const isMultichain = symbol === "BSB" ? "true" : "false";
    const dexEnabled = hasContract ? "true" : "false";
    const cexEnabled = "true";
    const supplyEnabled = (cmcId !== null && hasContract) ? "true" : (cmcId !== null ? "cmc_only" : "false");
    const manual = cmcId === null ? "true" : "false";

    rows.push([
      symbol, info.cgId, info.category, info.cgId, cmcId?.toString() || "",
      info.chain, info.contract, isMultichain,
      dexEnabled, cexEnabled, supplyEnabled,
      info.notes, manual
    ]);
  }

  const csv = rows.map(r => r.join(",")).join("\n");
  writeFileSync(join(REGISTRY_DIR, "token_metadata_registry.csv"), csv);

  console.log(`\nRegistry: ${rows.length - 1} tokens`);
  console.log(`CMC IDs resolved: ${resolved}, still missing: ${needCmc}`);
  console.log(`Registry saved.`);
}

main().catch(console.error);
