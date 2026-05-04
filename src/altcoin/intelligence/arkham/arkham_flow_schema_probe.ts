import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { arkhamGet, isArkhamConfigured } from "./arkham_client.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham", "schema");

// Only test LAB, BSB, PEPE — low cost
const TEST_TOKENS = [
  { sym: "LAB", chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A", cgId: "lab" },
  { sym: "BSB", chain: "ethereum", contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411", cgId: "block-street" },
  { sym: "PEPE", chain: "ethereum", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", cgId: "pepe" },
];

async function main() {
  console.log("=== Arkham Flow Schema Probe (Low-Cost) ===\n");
  if (!isArkhamConfigured()) { console.log("NOT_CONFIGURED"); return; }
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  // ── Top Flow Schema ──
  console.log("── Top Flow Schema ──\n");
  const tfRows: string[][] = [["token","endpoint_variant","params","status","rows","first_row_keys","parser_ready","limitations"]];
  const tfVariants = [
    { name: "pricing_id", build: (t: typeof TEST_TOKENS[0]) => `/token/top_flow/${t.cgId}` },
    { name: "pricing_id_time", build: (t: typeof TEST_TOKENS[0]) => `/token/top_flow/${t.cgId}?from=1700000000&to=1750000000` },
    { name: "chain_address", build: (t: typeof TEST_TOKENS[0]) => `/token/top_flow/${t.chain}/${t.contract}` },
  ];

  for (const t of TEST_TOKENS) {
    for (const v of tfVariants) {
      const path = v.build(t);
      const r = await arkhamGet(path, { token: t.sym, cacheTtlHours: 24 });
      const data = r.data as any;
      let rows = 0, keys = "", parserReady = false;
      if (r.ok && data) {
        if (Array.isArray(data)) { rows = data.length; keys = Object.keys(data[0] || {}).join("; "); parserReady = rows > 0; }
        else if (typeof data === "object") {
          const arr = data.data || data.items || data.flows || data.result || [];
          if (Array.isArray(arr) && arr.length > 0) { rows = arr.length; keys = Object.keys(arr[0] || {}).slice(0, 8).join("; "); parserReady = true; }
        }
      }
      console.log(`  ${t.sym} ${v.name}: ${r.status} rows=${rows} keys=${keys.slice(0, 80)}`);
      tfRows.push([t.sym, v.name, path.split("?")[1] || "", r.status, String(rows), keys, String(parserReady), (r.limitations || []).join("; ")]);
    }
  }
  writeFileSync(join(OUT_DIR, "arkham_top_flow_schema_probe.csv"), tfRows.map(r => r.join(",")).join("\n"));

  // ── Volume Schema ──
  console.log("\n── Volume Schema ──\n");
  const volRows: string[][] = [["token","endpoint_variant","params","status","rows","first_row_keys","parser_ready","limitations"]];
  const volVariants = [
    { name: "pricing_id", build: (t: typeof TEST_TOKENS[0]) => `/token/volume/${t.cgId}` },
    { name: "pricing_id_gran", build: (t: typeof TEST_TOKENS[0]) => `/token/volume/${t.cgId}?granularity=1d` },
    { name: "chain_address_gran", build: (t: typeof TEST_TOKENS[0]) => `/token/volume/${t.chain}/${t.contract}?granularity=1d` },
  ];

  for (const t of TEST_TOKENS) {
    for (const v of volVariants) {
      const path = v.build(t);
      const r = await arkhamGet(path, { token: t.sym, cacheTtlHours: 24 });
      const data = r.data as any;
      let rows = 0, keys = "", parserReady = false;
      if (r.ok && data) {
        if (Array.isArray(data)) { rows = data.length; keys = Object.keys(data[0] || {}).join("; "); parserReady = rows > 0; }
        else if (typeof data === "object") {
          const arr = data.data || data.items || data.result || [];
          if (Array.isArray(arr) && arr.length > 0) { rows = arr.length; keys = Object.keys(arr[0] || {}).slice(0, 8).join("; "); parserReady = true; }
        }
      }
      console.log(`  ${t.sym} ${v.name}: ${r.status} rows=${rows} keys=${keys.slice(0, 80)}`);
      volRows.push([t.sym, v.name, path.split("?")[1] || "", r.status, String(rows), keys, String(parserReady), (r.limitations || []).join("; ")]);
    }
  }
  writeFileSync(join(OUT_DIR, "arkham_volume_schema_probe.csv"), volRows.map(r => r.join(",")).join("\n"));

  // ── Transfers Schema ──
  console.log("\n── Transfers Schema ──\n");
  const txRows: string[][] = [["token","endpoint_variant","params","status","rows","has_from_entity","has_to_entity","has_amount_usd","parser_ready","limitations"]];
  const txVariants = [
    { name: "transfers_basic", build: (t: typeof TEST_TOKENS[0]) => `/transfers?chains=${t.chain === "bsc" ? "bsc" : t.chain}&tokens=${t.contract}&limit=3&flow=all` },
    { name: "histogram_simple", build: (t: typeof TEST_TOKENS[0]) => `/transfers/histogram/simple?chains=${t.chain === "bsc" ? "bsc" : t.chain}&tokens=${t.contract}&limit=5` },
  ];

  for (const t of TEST_TOKENS) {
    for (const v of txVariants) {
      const path = v.build(t);
      const r = await arkhamGet(path, { token: t.sym, allowHeavyOverride: true, cacheTtlHours: 24 });
      const data = r.data as any;
      let rows = 0, fromEntity = false, toEntity = false, hasAmount = false, parserReady = false;
      if (r.ok && data) {
        const arr = Array.isArray(data) ? data : (data.data || data.transfers || data.result || []);
        if (Array.isArray(arr) && arr.length > 0) {
          rows = arr.length;
          const first = arr[0];
          fromEntity = !!(first.from?.arkhamEntity || first.from_address_entity || first.fromEntity);
          toEntity = !!(first.to?.arkhamEntity || first.to_address_entity || first.toEntity);
          hasAmount = !!(first.amount_usd || first.amountUsd || first.valueUsd);
          parserReady = fromEntity || toEntity;
        }
      }
      console.log(`  ${t.sym} ${v.name}: ${r.status} rows=${rows} fromEntity=${fromEntity} toEntity=${toEntity} amount=${hasAmount}`);
      txRows.push([t.sym, v.name, path.split("?")[1]?.slice(0, 80) || "", r.status, String(rows), String(fromEntity), String(toEntity), String(hasAmount), String(parserReady), (r.limitations || []).join("; ")]);
    }
  }

  // If all transfers still show no entity: mark unresolved
  const anyEntity = txRows.slice(1).some(r => r[8] === "true");
  if (!anyEntity) {
    txRows.push(["SUMMARY", "", "", "", "", "", "", "", "", "TRANSFER_ENTITY_SCHEMA_UNRESOLVED: No entity field could be parsed from transfer responses"]);
    console.log("\n  TRANSFER_ENTITY_SCHEMA_UNRESOLVED");
  }
  writeFileSync(join(OUT_DIR, "arkham_transfers_schema_probe.csv"), txRows.map(r => r.join(",")).join("\n"));

  console.log(`\nSchema probes saved to ${OUT_DIR}`);
}

main().catch(console.error);
