import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "derivatives");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "derivatives");
const OKX_BASE = "https://www.okx.com/api/v5";

interface ProbeResult {
  endpoint: string; instId: string; token: string;
  status: string; rowsReturned: number;
  earliestTs: string; latestTs: string; granularity: string;
  errorCode: string; errorMsg: string; usable: boolean;
}

const TOKENS = ["BSB", "LAB", "PEPE", "WIF", "BONK", "FLOKI"];

async function probe(endpoint: string, instId: string, token: string): Promise<ProbeResult> {
  try {
    const r = await fetch(`${OKX_BASE}${endpoint}`);
    if (!r.ok) return { endpoint, instId, token, status: `HTTP_${r.status}`, rowsReturned: 0, earliestTs: "", latestTs: "", granularity: "", errorCode: "", errorMsg: "", usable: false };
    const d = await r.json() as any;
    const data = d.data || [];

    const rows = Array.isArray(data) ? data.length : 0;
    const earliest = rows > 0 ? new Date(parseInt(data[0][0])).toISOString().slice(0, 10) : "";
    const latest = rows > 0 ? new Date(parseInt(data[rows - 1][0])).toISOString().slice(0, 10) : "";

    // Detect granularity from data spacing
    let gran = "unknown";
    if (rows >= 2) {
      const diff = parseInt(data[1][0]) - parseInt(data[0][0]);
      if (diff < 3600000) gran = "5m-1h";
      else if (diff < 86400000) gran = "1h-4h";
      else gran = "1d";
    }

    const usable = rows > 10 && d.code === "0";

    return {
      endpoint, instId, token,
      status: d.code === "0" ? "OK" : `CODE_${d.code}`,
      rowsReturned: rows,
      earliestTs: earliest, latestTs: latest, granularity: gran,
      errorCode: d.code || "", errorMsg: d.msg || "", usable,
    };
  } catch (e: any) {
    return { endpoint, instId, token, status: "FETCH_ERROR", rowsReturned: 0, earliestTs: "", latestTs: "", granularity: "", errorCode: "", errorMsg: e.message, usable: false };
  }
}

async function main() {
  console.log("=== OKX Trading Statistics Endpoint Probe ===\n");
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const allResults: ProbeResult[] = [];

  for (const token of TOKENS) {
    const instId = `${token}-USDT-SWAP`;
    console.log(`${token} (${instId}):`);

    // 1. Open interest history
    const oiHist = await probe(`/rubik/stat/contracts/open-interest-history?instId=${instId}&period=1D&limit=90`, instId, token);
    console.log(`  OI history: ${oiHist.rowsReturned} rows [${oiHist.earliestTs} → ${oiHist.latestTs}] ${oiHist.usable ? "✓" : "✗"}`);
    allResults.push(oiHist);

    // 2. OI and volume
    const oiVol = await probe(`/rubik/stat/contracts/open-interest-volume?instId=${instId}&period=1D&limit=90`, instId, token);
    console.log(`  OI+Volume: ${oiVol.rowsReturned} rows ${oiVol.usable ? "✓" : "✗"}`);
    allResults.push(oiVol);

    // 3. Long/short ratio
    const ls = await probe(`/rubik/stat/contracts/long-short-account-ratio?instId=${instId}&period=1D&limit=90`, instId, token);
    console.log(`  Long/Short: ${ls.rowsReturned} rows ${ls.usable ? "✓" : "✗"}`);
    allResults.push(ls);

    // 4. Taker volume
    const taker = await probe(`/rubik/stat/contracts/taker-volume?instId=${instId}&period=1D&limit=90`, instId, token);
    console.log(`  Taker vol: ${taker.rowsReturned} rows ${taker.usable ? "✓" : "✗"}`);
    allResults.push(taker);

    // 5. Top trader long/short
    const topLS = await probe(`/rubik/stat/contracts/top-trader-long-short-account-ratio?instId=${instId}&period=1D&limit=90`, instId, token);
    console.log(`  Top trader L/S: ${topLS.rowsReturned} rows ${topLS.usable ? "✓" : "✗"}`);
    allResults.push(topLS);

    console.log("");
  }

  // Write CSV
  const csvH = "endpoint,token,instId,status,rows,earliest,latest,granularity,usable";
  const csvR = [csvH];
  for (const r of allResults) {
    csvR.push(`${r.endpoint.split("?")[0].split("/").pop()},${r.token},${r.instId},${r.status},${r.rowsReturned},${r.earliestTs},${r.latestTs},${r.granularity},${r.usable}`);
  }
  writeFileSync(join(OUT_DIR, "okx_trading_stats_endpoint_probe.csv"), csvR.join("\n"));

  // Summary
  const usableEndpoints = [...new Set(allResults.filter(r => r.usable).map(r => r.endpoint.split("?")[0]))];
  const usableTokens = [...new Set(allResults.filter(r => r.usable).map(r => r.token))];
  const oiHistoryWorked = allResults.filter(r => r.endpoint.includes("open-interest-history") && r.usable).length;

  console.log(`=== Summary ===`);
  console.log(`  Usable endpoints: ${usableEndpoints.length}`);
  console.log(`  Tokens with usable data: ${usableTokens.length}/${TOKENS.length}`);
  console.log(`  OI history available: ${oiHistoryWorked}/${TOKENS.length}`);
  console.log(`  Phase 5.3 correction needed: ${oiHistoryWorked > 0 ? "YES — OI history IS available" : "STILL BLOCKED"}`);

  // Quick report
  const reportLines = [
    "# OKX Trading Statistics Capability Report", "", `Generated: ${new Date().toISOString()}`,
    "", "## Probe Results", "",
    "| Token | OI History | OI+Volume | Long/Short | Taker Vol | Top Trader L/S |",
    "|-------|:---:|:---:|:---:|:---:|:---:|",
  ];

  for (const token of TOKENS) {
    const tResults = allResults.filter(r => r.token === token);
    const cells = ["open-interest-history", "open-interest-volume", "long-short-account-ratio", "taker-volume", "top-trader-long-short"];
    const cellVals = cells.map(c => {
      const found = tResults.find(r => r.endpoint.includes(c));
      return found?.usable ? "✓" : ((found?.rowsReturned ?? 0) > 0 ? "PARTIAL" : "✗");
    });
    reportLines.push(`| ${token} | ${cellVals.join(" | ")} |`);
  }

  reportLines.push("", "## Phase 5.3 Correction", "",
    oiHistoryWorked > 0
      ? `**Phase 5.3 conclusion "OI is snapshot-only" was INCORRECT.** OKX /rubik/stat/contracts/open-interest-history returns OI time-series for ${oiHistoryWorked}/${TOKENS.length} tokens. Full OI history is available.`
      : "OI history still not available via Trading Statistics. Further investigation needed.",
    "", "## Next Steps", "",
    oiHistoryWorked >= 4 ? "P0: Full OKX Trading Statistics integration. Replace OI snapshot with OI history. Re-run derivatives positioning analysis with real OI time-series." : "P0: Investigate why OI history probe failed. Check endpoint parameter format."
  );

  writeFileSync(join(REPORTS_DIR, "okx_trading_statistics_capability_report.md"), reportLines.join("\n"));
  console.log(`\nReport: ${join(REPORTS_DIR, "okx_trading_statistics_capability_report.md")}`);
}

main().catch(console.error);
