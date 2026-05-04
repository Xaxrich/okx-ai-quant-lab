import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const MORALIS_KEY = process.env.MORALIS_API_KEY || "";
const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";
const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "moralis");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "moralis");

interface ProbeResult { endpoint: string; token: string; status: string; rows: number; usable: boolean; limitations: string; }

async function moralisGet(path: string): Promise<any> {
  if (!MORALIS_KEY) return { status: "MORALIS_NOT_CONFIGURED" };
  try {
    const r = await fetch(`${MORALIS_BASE}${path}`, { headers: { "X-API-Key": MORALIS_KEY, "accept": "application/json" } });
    if (r.status === 401 || r.status === 403) return { status: `AUTH_ERROR_${r.status}` };
    if (r.status === 429) return { status: "RATE_LIMITED" };
    if (!r.ok) return { status: `HTTP_${r.status}` };
    return { status: "OK", data: await r.json() };
  } catch (e: any) { return { status: "FETCH_ERROR", error: e.message }; }
}

const TOKENS = [
  { sym: "BSB", chain: "eth", contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411", group: "P0" },
  { sym: "LAB", chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A", group: "P0" },
  { sym: "PEPE", chain: "eth", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", group: "CONTROL" },
  { sym: "FLOKI", chain: "eth", contract: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e", group: "CONTROL" },
];

async function main() {
  console.log("=== Moralis Capability Probe ===\n");
  if (!MORALIS_KEY) { console.log("MORALIS_NOT_CONFIGURED — set MORALIS_API_KEY in .env"); return; }
  console.log("Moralis API key: CONFIGURED\n");

  if (!existsSync(OUT_DIR + "/probes")) mkdirSync(OUT_DIR + "/probes", { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const allResults: ProbeResult[] = [];

  for (const token of TOKENS) {
    console.log(`${token.sym} (${token.chain}):`);

    // 1. Token holders
    const holdersR = await moralisGet(`/erc20/${token.contract}/holders?chain=${token.chain}&limit=10`);
    const holdersOk = holdersR.status === "OK" && holdersR.data?.result?.length > 0;
    console.log(`  Holders: ${holdersOk ? holdersR.data.result.length + " holders" : holdersR.status}`);
    allResults.push({ endpoint: "token_holders", token: token.sym, status: holdersR.status, rows: holdersR.data?.result?.length || 0, usable: holdersOk, limitations: "" });

    // 2. Token transfers (recent, limited)
    const transfersR = await moralisGet(`/erc20/${token.contract}/transfers?chain=${token.chain}&limit=10&order=DESC`);
    const transfersOk = transfersR.status === "OK" && transfersR.data?.result?.length > 0;
    if (transfersOk) {
      const sample = transfersR.data.result[0];
      const hasEntity = sample?.from_address_entity || sample?.to_address_entity;
      const hasLabel = sample?.from_address_label || sample?.to_address_label;
      console.log(`  Transfers: ${transfersR.data.result.length} rows | entity=${!!hasEntity} | label=${!!hasLabel}`);
    } else {
      console.log(`  Transfers: ${transfersR.status}`);
    }
    allResults.push({ endpoint: "token_transfers", token: token.sym, status: transfersR.status, rows: transfersR.data?.result?.length || 0, usable: transfersOk, limitations: "" });

    // 3. Token price
    const priceR = await moralisGet(`/erc20/${token.contract}/price?chain=${token.chain}`);
    const priceOk = priceR.status === "OK" && priceR.data;
    console.log(`  Price: ${priceOk ? "$" + (priceR.data.usdPrice || "?") : priceR.status}`);

    // 4. Top gainers / trending (single call, shared)
    if (token.sym === "BSB") {
      const gainersR = await moralisGet("/discovery/tokens/top-gainers?limit=5");
      console.log(`  Top gainers: ${gainersR.status === "OK" ? gainersR.data?.length + " tokens" : gainersR.status}`);
      const trendingR = await moralisGet("/discovery/tokens/trending?limit=5");
      console.log(`  Trending: ${trendingR.status === "OK" ? trendingR.data?.length + " tokens" : trendingR.status}`);
    }

    console.log("");
  }

  // Write results
  const csvH = "endpoint,token,status,rows,usable";
  const csvR = [csvH, ...allResults.map(r => `${r.endpoint},${r.token},${r.status},${r.rows},${r.usable}`)];
  writeFileSync(join(OUT_DIR, "probes", "moralis_capability_probe.csv"), csvR.join("\n"));

  const usableEndpoints = allResults.filter(r => r.usable);
  console.log(`=== Summary: ${usableEndpoints.length}/${allResults.length} requests usable ===`);

  const reportLines = [
    "# Moralis Capability Report", "", `Generated: ${new Date().toISOString()}`,
    "", "## 1. API Status", "",
    MORALIS_KEY ? "API key: CONFIGURED" : "MORALIS_NOT_CONFIGURED",
    "", "## 2. Endpoint Coverage", "",
    `Token holders: ${allResults.filter(r => r.endpoint === "token_holders" && r.usable).length}/${TOKENS.length} usable`,
    `Token transfers: ${allResults.filter(r => r.endpoint === "token_transfers" && r.usable).length}/${TOKENS.length} usable`,
    "", "## 3. What Moralis Can Support Now", "",
    "- Token holder snapshots (current holders)",
    "- Token transfer history (with entity/label metadata)",
    "- Token price queries",
    "- Top gainers / trending discovery",
    "", "## 4. What Moralis Cannot Prove", "",
    "- Cannot confirm accumulation (need historical holder time-series)",
    "- Cannot confirm distribution (Moralis entity labels are MEDIUM confidence)",
    "- Cannot confirm CEX inflow/outflow (label coverage unknown)",
    "- Cannot replace Arkham high-confidence entity intelligence",
    "", "## 5. Recommendation", "",
    usableEndpoints.length >= 6 ? "**ADD_MORALIS_HOLDER_TRANSFER_LITE** — integrate holder snapshots + transfer entity-lite into research layer." : usableEndpoints.length >= 3 ? "**MORALIS_PARTIAL_USEFUL** — some endpoints work, continue probing." : "**NEED_MORE_PROBE** — expand token set or check chain compatibility.",
  ];
  writeFileSync(join(REPORTS_DIR, "moralis_capability_report.md"), reportLines.join("\n"));
  console.log(`\nReport: ${join(REPORTS_DIR, "moralis_capability_report.md")}`);
}

main().catch(console.error);
