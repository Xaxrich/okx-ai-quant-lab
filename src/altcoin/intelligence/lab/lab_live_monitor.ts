import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from "fs";
import { join } from "path";

const CG_KEY = process.env.COINGECKO_PRO_API_KEY || "";
const CG_BASE = "https://pro-api.coingecko.com/api/v3";
const CG_KEY_PARAM = CG_KEY ? `x_cg_pro_api_key=${CG_KEY}` : "";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "lab");
const CG_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "coinglass");

const LAB = { sym: "LAB", cgId: "lab", okxInstId: "LAB-USDT-SWAP", chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A" };

// ── Live Fetchers ──

async function fetchCoinGeckoLive(): Promise<Record<string, any>> {
  const result: Record<string, any> = { ok: false };
  try {
    const url = `${CG_BASE}/coins/${LAB.cgId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false${CG_KEY_PARAM ? "&" + CG_KEY_PARAM : ""}`;
    const r = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!r.ok) { result.error = `HTTP ${r.status}`; return result; }
    const j = await r.json();
    const m = j.market_data || {};
    result.ok = true;
    result.price_usd = m.current_price?.usd || null;
    result.market_cap = m.market_cap?.usd || null;
    result.volume_24h = m.total_volume?.usd || null;
    result.price_change_1h = m.price_change_percentage_1h_in_currency?.usd || null;
    result.price_change_24h = m.price_change_percentage_24h || null;
    result.price_change_7d = m.price_change_percentage_7d || null;
    result.high_24h = m.high_24h?.usd || null;
    result.low_24h = m.low_24h?.usd || null;
    result.circulating_supply = m.circulating_supply || null;
    result.total_supply = m.total_supply || null;
    result.fdv = m.fully_diluted_valuation?.usd || null;
  } catch (e: any) { result.error = e.message; }
  return result;
}

async function fetchCoinGlassLive(): Promise<Record<string, any>> {
  const result: Record<string, any> = { ok: false };
  const CG_API = process.env.COINGLASS_API_KEY;
  if (!CG_API) { result.error = "No CoinGlass key"; return result; }
  try {
    // OI history (latest rows, 4h interval for recent granularity)
    const oiR = await fetch(`https://open-api-v4.coinglass.com/api/futures/open-interest/aggregated-history?symbol=${LAB.sym}&interval=4h&limit=12&unit=usd`, { headers: { "CG-API-KEY": CG_API, "Accept": "application/json" } });
    const oiJ = await oiR.json();
    result.oi_ok = oiJ.code === "0";
    const oiData = oiJ.data || [];
    if (oiData.length > 0) {
      result.oi_current = parseFloat(oiData[oiData.length - 1].close || "0");
      if (oiData.length >= 2) result.oi_change_4h = parseFloat(oiData[oiData.length - 1].close || "0") - parseFloat(oiData[oiData.length - 2].close || "0");
      if (oiData.length >= 6) result.oi_change_24h = parseFloat(oiData[oiData.length - 1].close || "0") - parseFloat(oiData[oiData.length - 6].close || "0");
      const oiVals = oiData.map((d: any) => parseFloat(d.close || "0")).filter((v: number) => v > 0);
      if (oiVals.length > 0) {
        const mean = oiVals.reduce((a: number, b: number) => a + b, 0) / oiVals.length;
        const std = Math.sqrt(oiVals.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / oiVals.length);
        result.oi_zscore = std > 0 ? (result.oi_current - mean) / std : null;
      }
    }

    // Funding
    const fundR = await fetch(`https://open-api-v4.coinglass.com/api/futures/funding-rate/oi-weight-history?symbol=${LAB.sym}&interval=4h&limit=12`, { headers: { "CG-API-KEY": CG_API, "Accept": "application/json" } });
    const fundJ = await fundR.json();
    result.funding_ok = fundJ.code === "0";
    const fundData = fundJ.data || [];
    if (fundData.length > 0) {
      result.funding_current = parseFloat(fundData[fundData.length - 1].close || "0");
      const fundVals = fundData.map((d: any) => parseFloat(d.close || "0")).filter((v: number) => !isNaN(v));
      if (fundVals.length > 0) {
        const fMean = fundVals.reduce((a: number, b: number) => a + b, 0) / fundVals.length;
        const fStd = Math.sqrt(fundVals.reduce((s: number, v: number) => s + (v - fMean) ** 2, 0) / fundVals.length);
        result.funding_zscore = fStd > 0 ? (result.funding_current - fMean) / fStd : null;
        result.funding_positive_streak = 0;
        for (let i = fundVals.length - 1; i >= 0 && fundVals[i] > 0; i--) result.funding_positive_streak++;
      }
    }

    // Liquidation (4h, recent)
    const liqR = await fetch(`https://open-api-v4.coinglass.com/api/futures/liquidation/aggregated-history?symbol=${LAB.sym}&interval=4h&limit=6&exchange_list=Binance,OKX,Bybit`, { headers: { "CG-API-KEY": CG_API, "Accept": "application/json" } });
    const liqJ = await liqR.json();
    result.liquidation_ok = liqJ.code === "0";
    const liqData = liqJ.data || [];
    if (liqData.length > 0) {
      result.liq_volume_4h = liqData.reduce((s: number, d: any) => s + (parseFloat(d.aggregated_long_liquidation_usd || "0") + parseFloat(d.aggregated_short_liquidation_usd || "0")), 0);
      result.liq_long_4h = liqData.reduce((s: number, d: any) => s + parseFloat(d.aggregated_long_liquidation_usd || "0"), 0);
      result.liq_short_4h = liqData.reduce((s: number, d: any) => s + parseFloat(d.aggregated_short_liquidation_usd || "0"), 0);
      result.liq_imbalance = result.liq_volume_4h > 0 ? (result.liq_long_4h - result.liq_short_4h) / result.liq_volume_4h : null;
    }

    result.ok = result.oi_ok && result.funding_ok;
  } catch (e: any) { result.error = e.message; }
  return result;
}

async function fetchOkxLive(): Promise<Record<string, any>> {
  const result: Record<string, any> = { ok: false };
  try {
    // OKX OI
    const oiR = await fetch(`https://www.okx.com/api/v5/public/open-interest?instId=${LAB.okxInstId}`);
    const oiJ = await oiR.json();
    if (oiJ.code === "0" && oiJ.data?.[0]) {
      result.oi_current = parseFloat(oiJ.data[0].oi || "0");
      result.oi_ts = oiJ.data[0].ts;
      result.oi_ok = true;
    }

    // OKX funding rate
    const frR = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${LAB.okxInstId}`);
    const frJ = await frR.json();
    if (frJ.code === "0" && frJ.data?.[0]) {
      result.funding_rate = parseFloat(frJ.data[0].fundingRate || "0");
      result.funding_ts = frJ.data[0].fundingTime;
      result.fr_ok = true;
    }

    // Funding rate history (last 3)
    const frhR = await fetch(`https://www.okx.com/api/v5/public/funding-rate-history?instId=${LAB.okxInstId}&limit=3`);
    const frhJ = await frhR.json();
    if (frhJ.code === "0") {
      const rates = (frhJ.data || []).map((d: any) => parseFloat(d.fundingRate || "0"));
      result.funding_rate_history = rates;
      result.funding_positive_streak = 0;
      for (let i = rates.length - 1; i >= 0 && rates[i] > 0; i--) result.funding_positive_streak++;
    }

    result.ok = result.oi_ok || result.fr_ok;
  } catch (e: any) { result.error = e.message; }
  return result;
}

function loadLocalArkhamReference(): Record<string, any> {
  const result: Record<string, any> = { ok: false };
  try {
    // LAB holder entity snapshot
    const holderPath = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham", "features", "arkham_holder_entity_features.csv");
    if (existsSync(holderPath)) {
      const lines = readFileSync(holderPath, "utf-8").split("\n");
      const labRow = lines.slice(1).find(l => l.startsWith("LAB,"));
      if (labRow) {
        const cols = labRow.split(",");
        result.holder_labeled_ratio = parseFloat(cols[6] || "0");
        result.holder_cex_count = parseInt(cols[9] || "0");
        result.holder_entity_coverage = parseFloat(cols[19] || "0");
      }
    }

    // LAB segmented transfer SEG_D (breakout) data
    const segPath = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham", "features", "arkham_segmented_transfer_entity_features.csv");
    if (existsSync(segPath)) {
      const lines = readFileSync(segPath, "utf-8").split("\n");
      const segD = lines.slice(1).find(l => l.startsWith("LAB,") && l.includes("SEG_D"));
      if (segD) {
        const cols = segD.split(",");
        result.seg_transfer_count = parseInt(cols[7] || "0");
        result.seg_cex_count = parseInt(cols[11] || "0");
        result.seg_labeled_ratio = parseFloat(cols[9] || "0");
      }
    }
    result.ok = Object.keys(result).length > 1;
  } catch { /* local only */ }
  return result;
}

// ── State Machine ──

interface RiskState { state: string; confidence: string; evidence: string[]; limitations: string[]; }
type StateId = "INSUFFICIENT" | "NO_SIGNAL" | "DELEVERAGING" | "LIQ_RISK" | "FUNDING_HOT" | "EFF_DECAY" | "CROWDING" | "BREAKOUT";

function classifyState(cg: any, cgl: any, okx: any, dex: any, arkham: any, dqScore: number): { mainState: RiskState; secondaryStates: RiskState[] } {
  const secondary: RiskState[] = [];

  if (dqScore < 0.7) {
    return { mainState: { state: "LAB_DATA_INSUFFICIENT", confidence: "HIGH", evidence: [`data_quality_score=${dqScore.toFixed(2)}`], limitations: ["Below 0.7 threshold"] }, secondaryStates: [] };
  }

  const priceUp = (cg.price_change_24h || 0) > 5;
  const priceExtreme = (cg.price_change_24h || 0) > 30;
  const volElevated = cg.market_cap > 0 ? (cg.volume_24h || 0) / cg.market_cap > 0.3 : false;
  const oiRising24h = (cgl.oi_change_24h || 0) > 0;
  const oiZscoreHigh = (cgl.oi_zscore || 0) > 2;
  const fundingHigh = (cgl.funding_zscore || 0) > 2;
  const fundingPositive = (cgl.funding_positive_streak || 0) >= 3;
  const liqElevated = (cgl.liq_volume_4h || 0) > 100000;
  const liqImbalanced = Math.abs(cgl.liq_imbalance || 0) > 0.5;
  const oiDeclining = (cgl.oi_change_4h || 0) < 0 && (cgl.oi_change_24h || 0) < 0;
  const okxConfirm = okx.ok && okx.oi_ok && (cgl.oi_current > 0 ? Math.abs((okx.oi_current || 0) / cgl.oi_current - 1) < 0.3 : false);
  const effDecay = priceUp && volElevated && (cg.price_change_1h || 0) < (cg.price_change_24h || 0) / 24 * 1.5;

  // Check each state with 2-layer evidence

  // Deleveraging: OI decline + liquidation spike
  if (oiDeclining && liqElevated) {
    secondary.push({ state: "LAB_DELEVERAGING_OBSERVED", confidence: liqImbalanced ? "HIGH" : "MEDIUM", evidence: [`OI change 4h=${cgl.oi_change_4h?.toFixed(0) || "?"} 24h=${cgl.oi_change_24h?.toFixed(0) || "?"}`, `Liq volume 4h=$${(cgl.liq_volume_4h || 0).toFixed(0)}`, `Liq imbalance=${(cgl.liq_imbalance || 0).toFixed(2)}`], limitations: ["Cannot confirm deleveraging direction"] });
  }

  // Liquidation risk: liq elevated + price volatility
  if (liqElevated && (priceExtreme || oiZscoreHigh)) {
    secondary.push({ state: "LAB_LIQUIDATION_RISK", confidence: liqImbalanced ? "HIGH" : "MEDIUM", evidence: [`Liq volume 4h=$${(cgl.liq_volume_4h || 0).toFixed(0)}`, priceExtreme ? `Price 24h=${cg.price_change_24h?.toFixed(1)}%` : `OI zscore=${cgl.oi_zscore?.toFixed(1)}`], limitations: ["Liquidation proxy — not confirmed direction"] });
  }

  // Funding overheated: funding high + OI or price elevated
  if (fundingHigh && (oiZscoreHigh || priceUp)) {
    secondary.push({ state: "LAB_FUNDING_OVERHEATED", confidence: fundingPositive && fundingHigh ? "HIGH" : "MEDIUM", evidence: [`Funding zscore=${(cgl.funding_zscore || 0).toFixed(1)}`, `Streak=${cgl.funding_positive_streak || 0}`, oiZscoreHigh ? `OI zscore=${cgl.oi_zscore?.toFixed(1)}` : `Price 24h=${cg.price_change_24h?.toFixed(1)}%`], limitations: ["Funding overheated is risk indicator, not reversal signal"] });
  }

  // Efficiency decay: price advancing + vol/OI continuing but return/effort declining
  if (effDecay && (oiRising24h || volElevated)) {
    secondary.push({ state: "LAB_EFFICIENCY_DECAY", confidence: "MEDIUM", evidence: [`Price 24h=${cg.price_change_24h?.toFixed(1)}% 1h=${cg.price_change_1h?.toFixed(1)}%`, `Volume/mcap elevated=${volElevated}`, `OI rising 24h=${oiRising24h}`], limitations: ["Efficiency decay is structural observation, not timing signal"] });
  }

  // Derivatives crowding: OI rising + OI zscore high
  if (oiRising24h && oiZscoreHigh && !fundingHigh) {
    secondary.push({ state: "LAB_DERIVATIVES_CROWDING_PROXY", confidence: okxConfirm ? "HIGH" : "MEDIUM", evidence: [`OI zscore=${(cgl.oi_zscore || 0).toFixed(1)}`, `OI change 24h=+$${(cgl.oi_change_24h || 0).toFixed(0)}`, okxConfirm ? "OKX confirms" : "OKX cross-check pending"], limitations: ["OI crowding is structural context, not directional signal"] });
  }

  // Breakout confirmation
  if (priceUp && volElevated && oiRising24h && !fundingHigh) {
    secondary.push({ state: "LAB_BREAKOUT_CONFIRMATION", confidence: okxConfirm ? "HIGH" : "MEDIUM", evidence: [`Price 24h=${cg.price_change_24h?.toFixed(1)}%`, `Volume/mcap elevated=${volElevated}`, `OI rising=${oiRising24h}`], limitations: ["Breakout confirmation is research context, not entry signal"] });
  }

  // Sort by priority
  const priorityOrder: StateId[] = ["DELEVERAGING", "LIQ_RISK", "FUNDING_HOT", "EFF_DECAY", "CROWDING", "BREAKOUT"];
  const priorityMap: Record<string, StateId> = {
    "LAB_DELEVERAGING_OBSERVED": "DELEVERAGING", "LAB_LIQUIDATION_RISK": "LIQ_RISK",
    "LAB_FUNDING_OVERHEATED": "FUNDING_HOT", "LAB_EFFICIENCY_DECAY": "EFF_DECAY",
    "LAB_DERIVATIVES_CROWDING_PROXY": "CROWDING", "LAB_BREAKOUT_CONFIRMATION": "BREAKOUT",
  };

  secondary.sort((a, b) => {
    const pa = priorityMap[a.state] || "BREAKOUT";
    const pb = priorityMap[b.state] || "BREAKOUT";
    return priorityOrder.indexOf(pa) - priorityOrder.indexOf(pb);
  });

  const mainState = secondary.length > 0 ? secondary[0] : { state: "LAB_NO_CLEAR_RISK_SIGNAL", confidence: "MEDIUM", evidence: ["No risk states triggered"], limitations: ["Data quality sufficient but no clear risk signals detected"] };
  return { mainState, secondaryStates: secondary.filter(s => s.state !== mainState.state) };
}

// ── Main ──

async function main() {
  console.log("=== LAB Live Overheating & Reversal-Risk Monitor ===\n");

  if (process.env.NO_ARKHAM_MODE !== "true") {
    console.log("LAB_MONITOR_REQUIRES_NO_ARKHAM_MODE: set NO_ARKHAM_MODE=true");
    return;
  }
  console.log("NO_ARKHAM_MODE: true\n");

  for (const d of [OUT_DIR, REPORTS_DIR]) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

  const ts = new Date().toISOString();
  const today = ts.slice(0, 10);

  // Fetch all live data
  console.log("── Fetching Live Data ──\n");
  const cg = await fetchCoinGeckoLive();
  console.log(`CoinGecko: ${cg.ok ? "OK" : "FAILED"} price=$${cg.price_usd?.toFixed(4) || "?"} 24h=${cg.price_change_24h?.toFixed(1) || "?"}%`);

  const cgl = await fetchCoinGlassLive();
  console.log(`CoinGlass: ${cgl.ok ? "OK" : "FAILED"} OI=$${(cgl.oi_current || 0).toFixed(0)} funding=${cgl.funding_current?.toFixed(4) || "?"}`);

  const okx = await fetchOkxLive();
  console.log(`OKX: ${okx.ok ? "OK" : "FAILED"} OI=$${(okx.oi_current || 0).toFixed(0)} funding=${okx.funding_rate?.toFixed(4) || "?"}`);

  const dex: Record<string, any> = { ok: false, error: "DEX_DATA_INSUFFICIENT" };
  console.log(`DEX: UNAVAILABLE (CoinGecko pool OHLCV may cover this)`);

  const arkham = loadLocalArkhamReference();
  console.log(`Arkham local: ${arkham.ok ? "OK" : "NO LOCAL DATA"} holder_coverage=${arkham.holder_entity_coverage?.toFixed(2) || "?"}`);

  // Data quality score
  let dqScore = 0;
  const missing: string[] = [];
  if (cg.ok && cg.price_usd) dqScore += 0.25; else missing.push("CoinGecko");
  if (cgl.ok && cgl.oi_current) dqScore += 0.35; else missing.push("CoinGlass OI");
  if (cgl.liquidation_ok) dqScore += 0.15; else missing.push("CoinGlass liquidation");
  if (okx.ok) dqScore += 0.15; else missing.push("OKX");
  if (dex.ok) dqScore += 0.10; else missing.push("DEX");
  if (arkham.ok) dqScore += 0.05;
  const intradayAvail = cgl.oi_change_4h !== undefined;

  console.log(`\nData quality: ${dqScore.toFixed(2)} (intraday: ${intradayAvail})`);

  // Classify
  const { mainState, secondaryStates } = classifyState(cg, cgl, okx, dex, arkham, dqScore);
  console.log(`Main state: ${mainState.state} (${mainState.confidence})`);
  for (const s of secondaryStates) console.log(`  Secondary: ${s.state} (${s.confidence})`);

  // ── Snapshot CSV ──
  const snapH = "timestamp,token,price_usd,market_cap,volume_24h,return_1h,return_24h,return_7d,volume_to_mcap,coinglass_oi_usd,coinglass_oi_change_4h,coinglass_oi_change_24h,coinglass_oi_zscore_24h,oi_to_market_cap,oi_weighted_funding,funding_zscore_24h,funding_positive_streak,liquidation_volume_4h,long_liquidation_volume,short_liquidation_volume,liquidation_imbalance,okx_oi_usd,okx_funding_rate,okx_vs_global_oi_ratio,data_quality_score,main_state,limitations";
  const snapRow = [
    ts, LAB.sym,
    cg.price_usd || "", cg.market_cap || "", cg.volume_24h || "",
    cg.price_change_1h || "", cg.price_change_24h || "", cg.price_change_7d || "",
    cg.market_cap > 0 ? ((cg.volume_24h || 0) / cg.market_cap).toFixed(4) : "",
    cgl.oi_current || "", cgl.oi_change_4h || "", cgl.oi_change_24h || "", cgl.oi_zscore?.toFixed(2) || "",
    cg.market_cap > 0 && cgl.oi_current ? (cgl.oi_current / cg.market_cap).toFixed(6) : "",
    cgl.funding_current || "", cgl.funding_zscore?.toFixed(2) || "", cgl.funding_positive_streak || "",
    cgl.liq_volume_4h || "", cgl.liq_long_4h || "", cgl.liq_short_4h || "", cgl.liq_imbalance?.toFixed(2) || "",
    okx.oi_current || "", okx.funding_rate || "",
    cgl.oi_current > 0 && okx.oi_current ? (okx.oi_current / cgl.oi_current).toFixed(4) : "",
    dqScore.toFixed(2), mainState.state,
    missing.length > 0 ? `Missing: ${missing.join(", ")}` : "",
  ];

  const snapPath = join(OUT_DIR, "lab_live_feature_snapshot.csv");
  const isNew = !existsSync(snapPath);
  if (isNew) {
    writeFileSync(snapPath, snapH + "\n" + snapRow.map(v => String(v ?? "").includes(",") ? `"${v}"` : String(v ?? "")).join(",") + "\n");
  } else {
    appendFileSync(snapPath, snapRow.map(v => String(v ?? "").includes(",") ? `"${v}"` : String(v ?? "")).join(",") + "\n");
  }
  console.log(`Snapshot ${isNew ? "created" : "appended"}: ${snapPath}`);

  // Data quality CSV
  const dqPath = join(OUT_DIR, "lab_live_data_quality.csv");
  const dqH = "timestamp,coingecko_ok,coinglass_ok,okx_ok,dex_ok,local_arkham_ok,missing_fields,intraday_available,data_quality_score,final_status_allowed";
  const dqRow = [ts, String(cg.ok), String(cgl.ok), String(okx.ok), String(dex.ok), String(arkham.ok), missing.join("; "), String(intradayAvail), dqScore.toFixed(2), dqScore >= 0.7 ? "ALLOWED" : "LAB_DATA_INSUFFICIENT"];
  if (!existsSync(dqPath)) writeFileSync(dqPath, dqH + "\n");
  appendFileSync(dqPath, dqRow.join(",") + "\n");

  // ── Report ──
  const reportLines = [
    "# LAB Live Overheating & Reversal-Risk Monitor", "",
    `Generated: ${ts}`,
    `Data quality: ${dqScore.toFixed(2)}/${intradayAvail ? "intraday available" : "daily only"}`,
    "",
    "## 1. Executive Summary", "",
    `**Main State: ${mainState.state}** (confidence: ${mainState.confidence})`,
    dqScore < 0.7 ? "**WARNING: Data quality insufficient — treat with caution.**" : "",
    "",
    "## 2. Current Market Snapshot", "",
    `- Price: $${cg.price_usd?.toFixed(6) || "?"}`,
    `- Market cap: $${(cg.market_cap || 0).toLocaleString()}`,
    `- Volume 24h: $${(cg.volume_24h || 0).toLocaleString()}`,
    `- Price 1h: ${cg.price_change_1h?.toFixed(1) || "?"}%`,
    `- Price 24h: ${cg.price_change_24h?.toFixed(1) || "?"}%`,
    `- Price 7d: ${cg.price_change_7d?.toFixed(1) || "?"}%`,
    `- Volume/MCap: ${cg.market_cap > 0 ? ((cg.volume_24h || 0) / cg.market_cap * 100).toFixed(1) : "?"}%`,
    `- Circulating supply: ${cg.circulating_supply?.toLocaleString() || "?"}`,
    `- FDV: $${(cg.fdv || 0).toLocaleString()}`,
    "",
    "## 3. Derivatives Snapshot (CoinGlass)", "",
    `- Aggregated OI: $${(cgl.oi_current || 0).toLocaleString()}`,
    `- OI change 4h: $${(cgl.oi_change_4h || 0).toLocaleString()}`,
    `- OI change 24h: $${(cgl.oi_change_24h || 0).toLocaleString()}`,
    `- OI z-score (24h): ${cgl.oi_zscore?.toFixed(2) || "?"}`,
    `- OI / Market cap: ${cg.market_cap > 0 && cgl.oi_current ? (cgl.oi_current / cg.market_cap * 100).toFixed(2) : "?"}%`,
    `- OI-weighted funding: ${cgl.funding_current?.toFixed(4) || "?"}`,
    `- Funding z-score: ${cgl.funding_zscore?.toFixed(2) || "?"}`,
    `- Funding positive streak: ${cgl.funding_positive_streak || 0}`,
    `- Liq volume 4h: $${(cgl.liq_volume_4h || 0).toLocaleString()}`,
    `- Long liq: $${(cgl.liq_long_4h || 0).toLocaleString()} / Short: $${(cgl.liq_short_4h || 0).toLocaleString()}`,
    `- Liq imbalance: ${cgl.liq_imbalance?.toFixed(2) || "?"}`,
    "",
    "## 4. OKX Cross-Check", "",
    `- OKX OI: $${(okx.oi_current || 0).toLocaleString()}`,
    `- OKX funding rate: ${okx.funding_rate?.toFixed(4) || "?"}`,
    `- OKX vs Global OI ratio: ${cgl.oi_current > 0 && okx.oi_current ? (okx.oi_current / cgl.oi_current * 100).toFixed(1) : "?"}%`,
    `- Cross-check status: ${okx.ok ? "OK" : "UNAVAILABLE"}`,
    "",
    "## 5. DEX Context", "",
    dex.ok ? `- DEX pool volume available` : "- DEX_DATA_INSUFFICIENT",
    "",
    "## 6. Risk State Evidence", "",
    "| State | Triggered | Evidence | Confidence | Limitations |",
    "|-------|-----------|----------|------------|-------------|",
    `| ${mainState.state} | **MAIN** | ${mainState.evidence.join("; ")} | ${mainState.confidence} | ${mainState.limitations.join("; ")} |`,
    ...secondaryStates.map(s => `| ${s.state} | secondary | ${s.evidence.join("; ")} | ${s.confidence} | ${s.limitations.join("; ")} |`),
    "",
    "## 7. Manual Review Checklist", "",
    `- [ ] Multi-exchange OI同步上升: ${cgl.oi_change_24h > 0 ? "YES" : "NO/UNKNOWN"}`,
    `- [ ] Funding极端: ${(cgl.funding_zscore || 0) > 2 ? "YES" : "NO"}`,
    `- [ ] Liquidation放大: ${(cgl.liq_volume_4h || 0) > 100000 ? "YES" : "NO"}`,
    `- [ ] 价格推进效率下降: ${mainState.state === "LAB_EFFICIENCY_DECAY" ? "YES" : "UNCLEAR"}`,
    `- [ ] OI开始下降: ${(cgl.oi_change_4h || 0) < 0 ? "YES" : "NO"}`,
    `- [ ] 出现去杠杆: ${mainState.state === "LAB_DELEVERAGING_OBSERVED" ? "YES" : "NO"}`,
    `- [ ] DEX数据确认: ${dex.ok ? "YES" : "NO"}`,
    `- [ ] 数据完整: ${dqScore >= 0.7 ? "YES" : "NO (score=" + dqScore.toFixed(2) + ")"}`,
    "",
    "## 8. What We Cannot Know", "",
    "- Cannot confirm accumulation",
    "- Cannot confirm distribution",
    "- Cannot confirm short entry",
    "- Cannot infer buy/sell intent",
    "- No trading recommendation",
  ];

  writeFileSync(join(REPORTS_DIR, "lab_live_monitor_report.md"), reportLines.join("\n"));
  console.log(`\nReport saved: ${REPORTS_DIR}/lab_live_monitor_report.md`);
}

main().catch(console.error);
