import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { arkhamGet, isArkhamConfigured } from "./arkham_client.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham");

async function probeEndpoint(name: string, path: string) {
  console.log(`  ${name}: ${path}`);
  const r = await arkhamGet(path);
  const preview = typeof r.data === "string" ? r.data.slice(0, 300)
    : JSON.stringify(r.data).slice(0, 500);
  console.log(`    ok=${r.ok} status=${r.status} preview=${preview.slice(0, 120)}`);
  return { name, path, ok: r.ok, status: r.status, error: r.error, preview, limitations: r.limitations || [] };
}

async function main() {
  console.log("=== Arkham Schema Probe ===\n");
  if (!isArkhamConfigured()) { console.log("NOT_CONFIGURED"); return; }

  if (!existsSync(OUT_DIR + "/raw")) mkdirSync(OUT_DIR + "/raw", { recursive: true });

  const results: any[] = [];

  // Token holders schema
  results.push(await probeEndpoint("token_holders_chain", "/token/holders/ethereum/0x6982508145454ce325ddbe47a25d4ec3d2311933?limit=2"));
  results.push(await probeEndpoint("token_holders_id", "/token/holders/pepe?limit=2"));

  // Top flow - try with various time params
  results.push(await probeEndpoint("top_flow_id", "/token/top_flow/pepe"));
  results.push(await probeEndpoint("top_flow_id_time", "/token/top_flow/pepe?timeGte=1700000000&timeLte=1750000000"));
  results.push(await probeEndpoint("top_flow_id_fromTo", "/token/top_flow/pepe?from=1700000000&to=1750000000"));

  // Volume - try granularity
  results.push(await probeEndpoint("volume_id", "/token/volume/pepe"));
  results.push(await probeEndpoint("volume_id_gran", "/token/volume/pepe?granularity=1d&timeGte=1700000000&timeLte=1750000000"));
  results.push(await probeEndpoint("volume_chain", "/token/volume/ethereum/0x6982508145454ce325ddbe47a25d4ec3d2311933?granularity=1d"));

  // Transfers schema
  results.push(await probeEndpoint("transfers_simple", "/transfers?chains=ethereum&tokens=0x6982508145454ce325ddbe47a25d4ec3d2311933&limit=2"));
  results.push(await probeEndpoint("transfers_histogram", "/transfers/histogram/simple?chains=ethereum&tokens=0x6982508145454ce325ddbe47a25d4ec3d2311933"));

  // Intelligence schema
  results.push(await probeEndpoint("intel_token_id", "/intelligence/token/pepe"));
  results.push(await probeEndpoint("intel_balance_changes", "/intelligence/entity_balance_changes"));

  // Counterparties
  results.push(await probeEndpoint("counterparties_address", "/counterparties/address/0xF977814e90dA44bFA03b6295A0616a897441aceC"));

  // Balances
  results.push(await probeEndpoint("balances_address", "/balances/address/0xF977814e90dA44bFA03b6295A0616a897441aceC?chain=ethereum"));

  // Portfolio
  results.push(await probeEndpoint("portfolio_ts_entity", "/portfolio/timeSeries/entity/binance?token=pepe"));

  const rows = [["endpoint","path","ok","status","preview","limitations"],
    ...results.map((r: any) => [r.name, r.path, String(r.ok), r.status, r.preview.slice(0, 200), (r.limitations || []).join("; ")])];
  writeFileSync(join(OUT_DIR, "probes", "arkham_schema_probe.csv"), rows.map(r => r.join(",")).join("\n"));
  console.log("\nSchema probe saved.");
}

main().catch(console.error);
