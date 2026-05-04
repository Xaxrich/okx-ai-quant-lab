import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { arkhamGet, isArkhamConfigured, arkhamConfidence } from "./arkham_client.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham");
const MORALIS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "moralis");

interface LabelReconciliation {
  chain: string; address: string;
  moralis_entity: string; moralis_label: string; moralis_confidence: string;
  arkham_entity: string; arkham_label: string; arkham_entity_type: string; arkham_confidence: string;
  label_match_status: string; merged_entity: string; merged_label: string; merged_confidence: string;
  conflict_reason: string; action: string;
}

function classifyMatch(mEntity: string, mLabel: string, aEntity: string, aLabel: string, aConfidence: string): {
  status: string; mergedEntity: string; mergedLabel: string; mergedConfidence: string; conflictReason: string; action: string;
} {
  const mName = mEntity || mLabel;
  const aName = aEntity || aLabel;

  if (!mName && !aName) return { status: "UNKNOWN_BOTH", mergedEntity: "", mergedLabel: "", mergedConfidence: "REVIEW_REQUIRED", conflictReason: "No labels from either channel", action: "REVIEW" };
  if (!mName && aName) return { status: "ARKHAM_ONLY", mergedEntity: aEntity, mergedLabel: aLabel, mergedConfidence: aConfidence, conflictReason: "", action: "USE_ARKHAM" };
  if (mName && !aName) return { status: "MORALIS_ONLY", mergedEntity: mEntity, mergedLabel: mLabel, mergedConfidence: "LOW_TO_MEDIUM", conflictReason: "", action: "KEEP_MORALIS_TENTATIVE" };

  const mNameLower = mName.toLowerCase();
  const aNameLower = aName.toLowerCase();

  if (mNameLower === aNameLower || mNameLower.includes(aNameLower) || aNameLower.includes(mNameLower)) {
    return { status: "MATCH", mergedEntity: aEntity, mergedLabel: aLabel, mergedConfidence: "HIGH", conflictReason: "", action: "USE_ARKHAM_ENHANCED" };
  }

  // Similar but not same — Arkham enhances
  return { status: "ARKHAM_ENHANCES_MORALIS", mergedEntity: aEntity, mergedLabel: aLabel, mergedConfidence: "HIGH", conflictReason: "Different names but Arkham higher confidence", action: "USE_ARKHAM" };
}

async function main() {
  console.log("=== Arkham Entity Label Builder ===\n");
  if (!isArkhamConfigured()) { console.log("NOT_CONFIGURED"); return; }
  console.log("Arkham: CONFIGURED\n");

  if (!existsSync(OUT_DIR + "/labels")) mkdirSync(OUT_DIR + "/labels", { recursive: true });

  const reconciliations: LabelReconciliation[] = [];

  // Try to read Moralis transfers
  const moralisPath = join(MORALIS_DIR, "transfers", "moralis_token_transfers.csv");
  let moralisAddresses = new Set<string>();

  if (existsSync(moralisPath)) {
    const lines = readFileSync(moralisPath, "utf-8").split("\n").slice(1);
    for (const line of lines) {
      const cols = line.split(",");
      if (cols.length < 8) continue;
      moralisAddresses.add(cols[5]); // from_address
      moralisAddresses.add(cols[6]); // to_address
    }
    console.log(`Moralis addresses found: ${moralisAddresses.size}`);
  } else {
    console.log("No Moralis transfers file found — label reconciliation skipped.");
    console.log("To enable reconciliation, run intelligence:moralis features first.");
  }

  // Also read Arkham holders for entity-labeled addresses
  const holdersPath = join(OUT_DIR, "parsed", "arkham_token_holders.csv");
  const arkhamAddresses = new Map<string, { entity: string; label: string; eType: string; confidence: string }>();

  if (existsSync(holdersPath)) {
    const lines = readFileSync(holdersPath, "utf-8").split("\n").slice(1);
    for (const line of lines) {
      const cols = line.split(",");
      if (cols.length < 6) continue;
      const addr = cols[2];
      const entity = cols[4] || "";
      const eType = cols[5] || "";
      const label = cols[6] || "";
      if (entity || label) {
        arkhamAddresses.set(addr.toLowerCase(), { entity, label, eType, confidence: "HIGH" });
      }
    }
    console.log(`Arkham labeled addresses (from holders): ${arkhamAddresses.size}`);
  }

  // Cross-reference
  let matchCount = 0, arkhamOnly = 0, moralisOnly = 0, conflictCount = 0;
  const allAddresses = new Set([...moralisAddresses, ...Array.from(arkhamAddresses.keys())]);

  for (const addr of allAddresses) {
    const arkham = arkhamAddresses.get(addr.toLowerCase());
    const r = classifyMatch(
      "", "", // Moralis entity/label — from transfers CSV
      arkham?.entity || "", arkham?.label || "",
      arkham?.confidence || "UNKNOWN"
    );

    if (r.status === "MATCH" || r.status === "ARKHAM_ENHANCES_MORALIS") matchCount++;
    else if (r.status === "ARKHAM_ONLY") arkhamOnly++;
    else if (r.status === "MORALIS_ONLY") moralisOnly++;
    else if (r.status.includes("CONFLICT")) conflictCount++;

    reconciliations.push({
      chain: "ethereum", address: addr,
      moralis_entity: "", moralis_label: "", moralis_confidence: "MEDIUM",
      arkham_entity: arkham?.entity || "", arkham_label: arkham?.label || "",
      arkham_entity_type: arkham?.eType || "", arkham_confidence: arkham?.confidence || "UNKNOWN",
      label_match_status: r.status, merged_entity: r.mergedEntity, merged_label: r.mergedLabel,
      merged_confidence: r.mergedConfidence, conflict_reason: r.conflictReason, action: r.action,
    });
  }

  const h = "chain,address,moralis_entity,moralis_label,moralis_confidence,arkham_entity,arkham_label,arkham_entity_type,arkham_confidence,label_match_status,merged_entity,merged_label,merged_confidence,conflict_reason,action";
  const rows = [h, ...reconciliations.map(r =>
    [r.chain, r.address, r.moralis_entity, r.moralis_label, r.moralis_confidence,
      r.arkham_entity, r.arkham_label, r.arkham_entity_type, r.arkham_confidence,
      r.label_match_status, r.merged_entity, r.merged_label, r.merged_confidence,
      r.conflict_reason, r.action].join(",")
  )];
  writeFileSync(join(OUT_DIR, "labels", "entity_label_reconciliation.csv"), rows.join("\n"));

  console.log(`\nReconciliation: MATCH=${matchCount}, ARKHAM_ONLY=${arkhamOnly}, MORALIS_ONLY=${moralisOnly}, CONFLICT=${conflictCount}`);
  console.log(`Saved ${reconciliations.length} label reconciliations.`);
}

main().catch(console.error);
