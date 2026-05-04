import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const ARKHAM_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham");
const MORALIS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "moralis");
const SCANNER_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "scanner_v02");

type AddressType = "TOKEN_CONTRACT" | "HOLDER" | "CEX_ENTITY" | "DEX_POOL" | "FUND_OR_INSTITUTION" | "MARKET_MAKER_PROXY" | "DEPLOYER" | "UNKNOWN_WALLET" | "SYSTEM_CONTRACT";
type LabelMatchStatus = "MATCH" | "ARKHAM_ENHANCES_MORALIS" | "ARKHAM_OVERRIDES_MORALIS" | "CONFLICT_REQUIRES_REVIEW" | "MORALIS_ONLY" | "ARKHAM_ONLY" | "UNKNOWN_BOTH";

interface LabelEntry {
  chain: string; address: string; address_type: AddressType;
  arkham_entity_id: string; arkham_entity_name: string; arkham_entity_type: string; arkham_label: string; arkham_confidence: string;
  moralis_entity: string; moralis_label: string; moralis_confidence: string;
  merged_entity: string; merged_label: string; merged_confidence: string; label_match_status: LabelMatchStatus;
  first_seen_source: string; first_seen_token: string; first_seen_date: string;
  last_updated_at: string; limitations: string;
}

function classifyAddressType(
  isContract: boolean, isHolder: boolean, arkhamType: string, moralisLabel: string, isPool: boolean,
): AddressType {
  const tLower = arkhamType.toLowerCase();
  if (isContract) return "TOKEN_CONTRACT";
  if (tLower === "cex") return "CEX_ENTITY";
  if (tLower === "dex" || isPool) return "DEX_POOL";
  if (tLower === "fund" || tLower === "institution") return "FUND_OR_INSTITUTION";
  if (tLower === "market_maker" || tLower === "marketmaker") return "MARKET_MAKER_PROXY";
  if (arkhamType === "meme" || arkhamType === "yield" || arkhamType === "misc") return "SYSTEM_CONTRACT";
  if (isHolder) return "HOLDER";
  return "UNKNOWN_WALLET";
}

function mergeLabels(
  mEntity: string, mLabel: string, mConf: string,
  aEntity: string, aLabel: string, aType: string, aConf: string,
): { mergedEntity: string; mergedLabel: string; mergedConfidence: string; status: LabelMatchStatus; limitations: string } {
  const hasM = !!(mEntity || mLabel);
  const hasA = !!(aEntity || aLabel);

  if (!hasM && !hasA) return { mergedEntity: "", mergedLabel: "", mergedConfidence: "REVIEW_REQUIRED", status: "UNKNOWN_BOTH", limitations: "No labels from either channel" };
  if (!hasM && hasA) return { mergedEntity: aEntity, mergedLabel: aLabel, mergedConfidence: aConf, status: "ARKHAM_ONLY", limitations: "Only Arkham has label" };
  if (hasM && !hasA) return { mergedEntity: mEntity, mergedLabel: mLabel, mergedConfidence: "LOW_TO_MEDIUM", status: "MORALIS_ONLY", limitations: "Only Moralis has label" };

  // Both have labels — compare
  const mName = (mEntity || mLabel).toLowerCase();
  const aName = (aEntity || aLabel).toLowerCase();

  if (mName === aName || mName.includes(aName) || aName.includes(mName)) {
    return { mergedEntity: aEntity, mergedLabel: aLabel, mergedConfidence: "HIGH", status: "MATCH", limitations: "" };
  }

  if (aConf === "HIGH") {
    return { mergedEntity: aEntity, mergedLabel: aLabel, mergedConfidence: "HIGH", status: "ARKHAM_OVERRIDES_MORALIS", limitations: "Different names; Arkham confidence higher" };
  }

  return { mergedEntity: aEntity, mergedLabel: aLabel, mergedConfidence: "MEDIUM", status: "ARKHAM_ENHANCES_MORALIS", limitations: "Different names; Arkham adds context" };
}

async function main() {
  console.log("=== Arkham Entity Label Registry v1 ===\n");

  const outDir = join(ARKHAM_DIR, "labels");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const registry = new Map<string, LabelEntry>();
  const today = new Date().toISOString().slice(0, 10);

  // Source 1: Arkham holders
  const holdersPath = join(ARKHAM_DIR, "parsed", "arkham_token_holders.csv");
  if (existsSync(holdersPath)) {
    const lines = readFileSync(holdersPath, "utf-8").split("\n").slice(1);
    for (const line of lines) {
      const cols = line.split(",");
      if (cols.length < 7) continue;
      const [token, chain, addr, entityId, entityName, entityType, label, , , , , confidence] = cols;
      if (!addr) continue;
      const key = `${chain}:${addr.toLowerCase()}`;
      const aType = classifyAddressType(false, true, entityType || "", "", false);

      if (!registry.has(key) || (confidence === "HIGH")) {
        const { mergedEntity, mergedLabel, mergedConfidence, status, limitations } = mergeLabels(
          registry.get(key)?.moralis_entity || "", registry.get(key)?.moralis_label || "", registry.get(key)?.moralis_confidence || "",
          entityName, label, entityType, confidence || "HIGH",
        );
        registry.set(key, {
          chain, address: addr, address_type: aType,
          arkham_entity_id: entityId, arkham_entity_name: entityName, arkham_entity_type: entityType, arkham_label: label, arkham_confidence: confidence || "HIGH",
          moralis_entity: registry.get(key)?.moralis_entity || "", moralis_label: registry.get(key)?.moralis_label || "", moralis_confidence: registry.get(key)?.moralis_confidence || "",
          merged_entity: mergedEntity, merged_label: mergedLabel, merged_confidence: mergedConfidence, label_match_status: status,
          first_seen_source: registry.get(key)?.first_seen_source || "ARKHAM_HOLDERS", first_seen_token: registry.get(key)?.first_seen_token || token,
          first_seen_date: registry.get(key)?.first_seen_date || today,
          last_updated_at: today, limitations,
        });
      }
    }
    console.log(`Arkham holder addresses: ${registry.size}`);
  }

  // Source 2: Token contracts from metadata registry
  const metaPath = join(SCANNER_DIR, "registry", "token_metadata_registry.csv");
  if (existsSync(metaPath)) {
    const lines = readFileSync(metaPath, "utf-8").split("\n").slice(1);
    for (const line of lines) {
      const cols = line.split(",");
      if (cols.length < 8) continue;
      const [sym, , , , , chain, contract] = cols;
      if (!contract || !chain) continue;
      const key = `${chain}:${contract.toLowerCase()}`;
      if (!registry.has(key)) {
        registry.set(key, {
          chain, address: contract, address_type: "TOKEN_CONTRACT",
          arkham_entity_id: "", arkham_entity_name: "", arkham_entity_type: "", arkham_label: "", arkham_confidence: "",
          moralis_entity: "", moralis_label: "", moralis_confidence: "",
          merged_entity: sym, merged_label: `Token contract: ${sym}`, merged_confidence: "HIGH", label_match_status: "MORALIS_ONLY",
          first_seen_source: "TOKEN_METADATA", first_seen_token: sym,
          first_seen_date: today, last_updated_at: today, limitations: "",
        });
      }
    }
    console.log(`+ Token contracts. Total addresses: ${registry.size}`);
  }

  // Source 3: Moralis entity-lite labels from reconciliation
  const reconPath = join(ARKHAM_DIR, "labels", "entity_label_reconciliation.csv");
  if (existsSync(reconPath)) {
    const existingAddresses = new Set(registry.keys());
    const lines = readFileSync(reconPath, "utf-8").split("\n").slice(1);
    for (const line of lines) {
      const cols = line.split(",");
      if (cols.length < 5) continue;
      const [chain, addr] = cols;
      if (!addr) continue;
      const key = `${chain || "ethereum"}:${addr.toLowerCase()}`;
      if (!existingAddresses.has(key) && !registry.has(key)) {
        registry.set(key, {
          chain: chain || "ethereum", address: addr, address_type: "UNKNOWN_WALLET",
          arkham_entity_id: "", arkham_entity_name: "", arkham_entity_type: "", arkham_label: "", arkham_confidence: "",
          moralis_entity: "", moralis_label: "", moralis_confidence: "MEDIUM",
          merged_entity: "", merged_label: "", merged_confidence: "LOW_TO_MEDIUM", label_match_status: "UNKNOWN_BOTH",
          first_seen_source: "MORALIS_RECONCILIATION", first_seen_token: "",
          first_seen_date: today, last_updated_at: today, limitations: "Address from Moralis reconciliation — no entity label yet",
        });
      }
    }
    console.log(`+ Moralis reconciliation addresses. Total: ${registry.size}`);
  }

  // Write registry
  const h = "chain,address,address_type,arkham_entity_id,arkham_entity_name,arkham_entity_type,arkham_label,arkham_confidence,moralis_entity,moralis_label,moralis_confidence,merged_entity,merged_label,merged_confidence,label_match_status,first_seen_source,first_seen_token,first_seen_date,last_updated_at,limitations";
  const rows = [h];
  for (const [, entry] of registry) {
    rows.push([
      entry.chain, entry.address, entry.address_type,
      entry.arkham_entity_id, entry.arkham_entity_name, entry.arkham_entity_type, entry.arkham_label, entry.arkham_confidence,
      entry.moralis_entity, entry.moralis_label, entry.moralis_confidence,
      entry.merged_entity, entry.merged_label, entry.merged_confidence, entry.label_match_status,
      entry.first_seen_source, entry.first_seen_token, entry.first_seen_date, entry.last_updated_at, entry.limitations,
    ].join(","));
  }
  writeFileSync(join(outDir, "entity_label_registry_v1.csv"), rows.join("\n"));

  // Stats
  const all = Array.from(registry.values());
  const counts = { TOKEN_CONTRACT: 0, HOLDER: 0, CEX_ENTITY: 0, DEX_POOL: 0, FUND_OR_INSTITUTION: 0, MARKET_MAKER_PROXY: 0, DEPLOYER: 0, UNKNOWN_WALLET: 0, SYSTEM_CONTRACT: 0 };
  const matchCounts = { MATCH: 0, ARKHAM_ENHANCES_MORALIS: 0, ARKHAM_OVERRIDES_MORALIS: 0, CONFLICT_REQUIRES_REVIEW: 0, MORALIS_ONLY: 0, ARKHAM_ONLY: 0, UNKNOWN_BOTH: 0 };
  for (const e of all) {
    counts[e.address_type]++;
    matchCounts[e.label_match_status]++;
  }

  console.log(`\nRegistry: ${all.length} addresses`);
  console.log("By type:");
  for (const [t, c] of Object.entries(counts)) { if (c > 0) console.log(`  ${t}: ${c}`); }
  console.log("By match status:");
  for (const [t, c] of Object.entries(matchCounts)) { if (c > 0) console.log(`  ${t}: ${c}`); }
  console.log(`\nSaved to ${outDir}/entity_label_registry_v1.csv`);
}

main().catch(console.error);
