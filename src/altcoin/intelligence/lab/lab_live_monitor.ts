import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from "fs";
import { join } from "path";
import { fetchCompatWithFallback as fetch } from "../../../utils/http.js";

const CG_KEY = process.env.COINGECKO_PRO_API_KEY || "";
const CG_BASE = "https://pro-api.coingecko.com/api/v3";
const CG_KEY_PARAM = CG_KEY ? `x_cg_pro_api_key=${CG_KEY}` : "";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "lab");

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
    // OI history (4h, last 12 for rolling stats)
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

    // Funding (4h, last 12)
    const fundR = await fetch(`https://open-api-v4.coinglass.com/api/futures/funding-rate/oi-weight-history?symbol=${LAB.sym}&interval=4h&limit=12`, { headers: { "CG-API-KEY": CG_API, "Accept": "application/json" } });
    const fundJ = await fundR.json();
    result.funding_ok = fundJ.code === "0";
    const fundData = fundJ.data || [];
    if (fundData.length > 0) {
      const raw = parseFloat(fundData[fundData.length - 1].close || "0");
      result.funding_rate_raw = raw;
      result.funding_rate_decimal = raw;
      result.funding_rate_percent = raw * 100;
      result.funding_unit_status = "CONFIRMED_DECIMAL";
      result.funding_current = raw; // keep backwards compat
      const fundVals = fundData.map((d: any) => parseFloat(d.close || "0")).filter((v: number) => !isNaN(v));
      if (fundVals.length > 0) {
        const fMean = fundVals.reduce((a: number, b: number) => a + b, 0) / fundVals.length;
        const fStd = Math.sqrt(fundVals.reduce((s: number, v: number) => s + (v - fMean) ** 2, 0) / fundVals.length);
        result.funding_zscore = fStd > 0 ? (raw - fMean) / fStd : null;
        result.funding_positive_streak = 0;
        for (let i = fundVals.length - 1; i >= 0 && fundVals[i] > 0; i--) result.funding_positive_streak++;
      }
    }

    // Liquidation (4h, last 6)
    const liqR = await fetch(`https://open-api-v4.coinglass.com/api/futures/liquidation/aggregated-history?symbol=${LAB.sym}&interval=4h&limit=6&exchange_list=Binance,OKX,Bybit`, { headers: { "CG-API-KEY": CG_API, "Accept": "application/json" } });
    const liqJ = await liqR.json();
    result.liquidation_ok = liqJ.code === "0";
    const liqData = liqJ.data || [];
    if (liqData.length > 0) {
      // FIXED: 4h = latest candle only, 24h = sum of last 6
      const latest = liqData[liqData.length - 1];
      const latestLong = parseFloat(latest.aggregated_long_liquidation_usd || "0");
      const latestShort = parseFloat(latest.aggregated_short_liquidation_usd || "0");
      result.liquidation_volume_4h = latestLong + latestShort;
      result.long_liquidation_volume_4h = latestLong;
      result.short_liquidation_volume_4h = latestShort;
      result.liquidation_imbalance_4h = result.liquidation_volume_4h > 0 ? (latestLong - latestShort) / result.liquidation_volume_4h : null;

      const sum24Long = liqData.reduce((s: number, d: any) => s + parseFloat(d.aggregated_long_liquidation_usd || "0"), 0);
      const sum24Short = liqData.reduce((s: number, d: any) => s + parseFloat(d.aggregated_short_liquidation_usd || "0"), 0);
      result.liquidation_volume_24h = sum24Long + sum24Short;
      result.long_liquidation_volume_24h = sum24Long;
      result.short_liquidation_volume_24h = sum24Short;
      result.liquidation_imbalance_24h = result.liquidation_volume_24h > 0 ? (sum24Long - sum24Short) / result.liquidation_volume_24h : null;
    }

    result.ok = result.oi_ok && result.funding_ok;
  } catch (e: any) { result.error = e.message; }
  return result;
}

async function fetchOkxLive(): Promise<Record<string, any>> {
  const result: Record<string, any> = { ok: false };
  try {
    const oiR = await fetch(`https://www.okx.com/api/v5/public/open-interest?instId=${LAB.okxInstId}`);
    const oiJ = await oiR.json();
    if (oiJ.code === "0" && oiJ.data?.[0]) {
      const d = oiJ.data[0];
      result.okx_oi_raw = d.oi || "";
      result.okx_oi_ccy = d.oiCcy || "";
      result.okx_oi_usd_direct = d.oiUsd ? parseFloat(d.oiUsd) : null;
      result.okx_oi_ts = d.ts || "";

      if (result.okx_oi_usd_direct !== null) {
        result.okx_oi_usd_estimated = result.okx_oi_usd_direct;
        result.okx_oi_unit = "USD_DIRECT";
        result.oi_current = result.okx_oi_usd_direct; // for backwards compat
      } else if (d.oiCcy) {
        result.okx_oi_unit = "ESTIMATED_FROM_OI_CCY";
        result.okx_oi_usd_estimated = null; // needs price to estimate
        result.oi_current = null;
      } else {
        result.okx_oi_unit = "RAW_CONTRACT_OR_TOKEN_UNCONFIRMED";
        result.okx_oi_usd_estimated = null;
        result.oi_current = null;
      }
      result.oi_ok = true;
    }

    // Funding rate
    const frR = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${LAB.okxInstId}`);
    const frJ = await frR.json();
    if (frJ.code === "0" && frJ.data?.[0]) {
      result.funding_rate = parseFloat(frJ.data[0].fundingRate || "0");
      result.funding_ts = frJ.data[0].fundingTime;
      result.fr_ok = true;
    }

    // Funding rate history
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
    result.ok = Object.keys(result).length > 1;
  } catch { /* local only */ }
  return result;
}

// ── State Machine (with absolute extreme support) ──

interface RiskState { state: string; confidence: string; evidence: string[]; limitations: string[]; }

function classifyState(cg: any, cgl: any, okx: any, dex: any, arkham: any, coreDq: number): { mainState: RiskState; secondaryStates: RiskState[] } {
  const secondary: RiskState[] = [];

  if (coreDq < 0.7) {
    return { mainState: { state: "LAB_DATA_INSUFFICIENT", confidence: "HIGH", evidence: [`core_data_quality=${coreDq.toFixed(2)}`], limitations: ["Below 0.7 threshold"] }, secondaryStates: [] };
  }

  // Core signals
  const priceUp = (cg.price_change_24h || 0) > 5;
  const priceExtreme = (cg.price_change_24h || 0) > 30;
  const volElevated = cg.market_cap > 0 ? (cg.volume_24h || 0) / cg.market_cap > 0.3 : false;
  const oiRising24h = (cgl.oi_change_24h || 0) > 0;
  const oiZscoreHigh = (cgl.oi_zscore || 0) > 2;
  const oiToMcap = cg.market_cap > 0 && cgl.oi_current ? cgl.oi_current / cg.market_cap : 0;
  const oiToMcapExtreme = oiToMcap >= 1.0;
  const oiChange24hRatio = cgl.oi_current > 0 ? (cgl.oi_change_24h || 0) / (cgl.oi_current - (cgl.oi_change_24h || 0)) : 0;
  const oiChange24hExtreme = oiChange24hRatio >= 0.30;

  // Funding
  const fundingPct = cgl.funding_rate_percent || 0;
  const fundingAbsExtreme = cgl.funding_unit_status === "CONFIRMED_DECIMAL" ? fundingPct >= 5 : (cgl.funding_rate_raw || 0) >= 0.05;
  const fundingZscoreHigh = (cgl.funding_zscore || 0) > 2;
  const fundingStreakExtreme = (cgl.funding_positive_streak || 0) >= 6;
  const fundingUnitConfirmed = cgl.funding_unit_status === "CONFIRMED_DECIMAL";

  // Liquidation
  const liq4hToOi = cgl.oi_current > 0 ? (cgl.liquidation_volume_4h || 0) / cgl.oi_current : 0;
  const liq24hToOi = cgl.oi_current > 0 ? (cgl.liquidation_volume_24h || 0) / cgl.oi_current : 0;
  const liqElevated24h = (cgl.liquidation_volume_24h || 0) > 500000;
  const liqImbalanced = Math.abs(cgl.liquidation_imbalance_4h || 0) > 0.5;

  // OKX
  const okxUsdAvail = okx.okx_oi_unit === "USD_DIRECT" && okx.okx_oi_usd_direct !== null;
  const okxRatio = okxUsdAvail && cgl.oi_current > 0 ? okx.okx_oi_usd_direct / cgl.oi_current : null;
  const okxConfirm = okxRatio !== null && okxRatio > 0.01 && okxRatio < 0.5;

  // OI decline
  const oiDeclining4h = (cgl.oi_change_4h || 0) < 0;
  const oiDeclining24h = (cgl.oi_change_24h || 0) < 0;

  // Efficiency decay
  const effDecay = priceUp && volElevated && cg.price_change_1h !== null && cg.price_change_24h !== null ? (cg.price_change_1h < cg.price_change_24h / 24 * 1.2) : false;

  // ── State Assessment ──

  // Deleveraging: OI decline + liquidation spike (2 layers: OI + liq)
  if (oiDeclining24h && liqElevated24h) {
    secondary.push({ state: "LAB_DELEVERAGING_OBSERVED", confidence: liqImbalanced ? "HIGH" : "MEDIUM", evidence: [`OI 24h change=${(cgl.oi_change_24h || 0).toFixed(0)}`, `Liq 24h=$${(cgl.liquidation_volume_24h || 0).toFixed(0)}`, `Liq 4h imbalance=${(cgl.liquidation_imbalance_4h || 0).toFixed(2)}`], limitations: ["OI decline + liq spike = deleveraging proxy, not confirmed direction"] });
  }

  // Liquidation risk: liq elevated + (OI extreme or price volatile)
  if (liqElevated24h && (oiChange24hExtreme || priceExtreme)) {
    secondary.push({ state: "LAB_LIQUIDATION_RISK", confidence: liqImbalanced ? "HIGH" : "MEDIUM", evidence: [`Liq 24h=$${(cgl.liquidation_volume_24h || 0).toFixed(0)}`, oiChange24hExtreme ? `OI 24h ratio=${(oiChange24hRatio*100).toFixed(0)}%` : `Price 24h=${cg.price_change_24h?.toFixed(1)}%`], limitations: ["Liquidation proxy — not confirmed forced close direction"] });
  }

  // Funding overheated: abs extreme OR zscore high + supporting evidence
  if (fundingAbsExtreme && (fundingStreakExtreme || oiToMcapExtreme) && !oiDeclining24h) {
    const conf = fundingUnitConfirmed ? (fundingStreakExtreme && oiToMcapExtreme ? "HIGH" : "MEDIUM") : "MEDIUM";
    secondary.push({ state: "LAB_FUNDING_OVERHEATED", confidence: conf, evidence: [`Funding=${fundingPct.toFixed(2)}% (raw=${(cgl.funding_rate_raw || 0).toFixed(4)})`, `Streak=${cgl.funding_positive_streak || 0}`, oiToMcapExtreme ? `OI/MCap=${oiToMcap.toFixed(2)}` : ""], limitations: [fundingUnitConfirmed ? "" : "Funding unit NEEDS_CONFIRMATION", "Funding overheated = risk indicator, not reversal signal"].filter(Boolean) });
  } else if (fundingZscoreHigh && (oiZscoreHigh || priceUp)) {
    secondary.push({ state: "LAB_FUNDING_OVERHEATED", confidence: "MEDIUM", evidence: [`Funding zscore=${(cgl.funding_zscore || 0).toFixed(1)}`, oiZscoreHigh ? `OI zscore=${cgl.oi_zscore?.toFixed(1)}` : `Price 24h=${cg.price_change_24h?.toFixed(1)}%`], limitations: ["Funding overheated = risk indicator, not reversal signal"] });
  }

  // Efficiency decay
  if (effDecay && (oiRising24h || volElevated)) {
    secondary.push({ state: "LAB_EFFICIENCY_DECAY", confidence: "MEDIUM", evidence: [`Price 1h=${cg.price_change_1h?.toFixed(1)}% vs 24h=${cg.price_change_24h?.toFixed(1)}%`, `OI rising 24h=${oiRising24h}`], limitations: ["Efficiency decay is structural observation, not timing signal"] });
  }

  // Derivatives crowding: OI extreme + not yet overheat
  if ((oiChange24hExtreme && oiToMcapExtreme) || (oiZscoreHigh && oiRising24h)) {
    const alreadyOverheated = secondary.some(s => s.state === "LAB_FUNDING_OVERHEATED");
    if (!alreadyOverheated || oiChange24hExtreme) {
      secondary.push({ state: "LAB_DERIVATIVES_CROWDING_PROXY", confidence: okxConfirm ? "HIGH" : (oiToMcapExtreme ? "MEDIUM" : "LOW"), evidence: [`OI/MCap=${oiToMcap.toFixed(2)}`, `OI 24h ratio=${(oiChange24hRatio*100).toFixed(0)}%`, okxConfirm ? `OKX ratio=${(okxRatio!*100).toFixed(1)}%` : `OKX unit=${okx.okx_oi_unit || "?"}`], limitations: ["OI crowding = structural context, not directional signal"] });
    }
  }

  // Breakout confirmation
  if (priceUp && volElevated && !oiDeclining24h) {
    secondary.push({ state: "LAB_BREAKOUT_CONFIRMATION", confidence: okxConfirm ? "HIGH" : "MEDIUM", evidence: [`Price 24h=${cg.price_change_24h?.toFixed(1)}%`, `Vol/MCap=${cg.market_cap > 0 ? ((cg.volume_24h || 0) / cg.market_cap * 100).toFixed(0) : "?"}%`, `OI rising=${oiRising24h}`], limitations: ["Breakout confirmation = research context, not entry signal"] });
  }

  // Priority sort
  const prio: Record<string, number> = { "LAB_DELEVERAGING_OBSERVED": 1, "LAB_LIQUIDATION_RISK": 2, "LAB_FUNDING_OVERHEATED": 3, "LAB_EFFICIENCY_DECAY": 4, "LAB_DERIVATIVES_CROWDING_PROXY": 5, "LAB_BREAKOUT_CONFIRMATION": 6 };
  secondary.sort((a, b) => (prio[a.state] || 99) - (prio[b.state] || 99));

  const mainState = secondary.length > 0 ? secondary[0] : { state: "LAB_NO_CLEAR_RISK_SIGNAL", confidence: "MEDIUM", evidence: ["No risk states triggered"], limitations: [] };
  return { mainState, secondaryStates: secondary.filter(s => s.state !== mainState.state) };
}

// ── Main ──

async function main() {
  console.log("=== LAB 高位风险监控 (v2) ===\n");

  if (process.env.NO_ARKHAM_MODE !== "true") {
    console.log("LAB_MONITOR_REQUIRES_NO_ARKHAM_MODE: set NO_ARKHAM_MODE=true");
    return;
  }
  console.log("NO_ARKHAM_MODE: true\n");

  for (const d of [OUT_DIR, REPORTS_DIR]) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

  const ts = new Date().toISOString();

  // 获取数据
  console.log("── 获取实时数据 ──\n");
  const cg = await fetchCoinGeckoLive();
  console.log(`CoinGecko: ${cg.ok ? "OK" : "失败"} $${cg.price_usd?.toFixed(4) || "?"} 24h=${cg.price_change_24h?.toFixed(1) || "?"}%`);

  const cgl = await fetchCoinGlassLive();
  console.log(`CoinGlass: ${cgl.ok ? "OK" : "失败"} OI=$${(cgl.oi_current || 0).toFixed(0)} 资金费率=${(cgl.funding_rate_raw || 0).toFixed(4)} (${cgl.funding_rate_percent?.toFixed(2) || "?"}%)`);

  const okx = await fetchOkxLive();
  console.log(`OKX: ${okx.ok ? "OK" : "失败"} 单位=${okx.okx_oi_unit || "?"} usd=${okx.okx_oi_usd_direct?.toFixed(0) || "?"} 原始=${okx.okx_oi_raw || "?"}`);

  const dex: Record<string, any> = { ok: false, error: "DEX数据不可用" };
  console.log(`DEX: 不可用`);

  const arkham = loadLocalArkhamReference();
  console.log(`Arkham 本地: ${arkham.ok ? "可用" : "无数据"}`);

  // 数据质量
  const coreDq = (cg.ok ? 0.25 : 0) + (cgl.ok && cgl.oi_ok ? 0.40 : 0) + (cgl.liquidation_ok ? 0.20 : 0) + (okx.ok && okx.oi_ok ? 0.15 : 0);
  const ctxDq = (dex.ok ? 0.70 : 0) + (arkham.ok ? 0.30 : 0);
  const finalDq = coreDq;

  console.log(`\n数据质量: 核心${coreDq.toFixed(2)} 扩展${ctxDq.toFixed(2)} 综合${finalDq.toFixed(2)}`);

  // 判定
  const { mainState, secondaryStates } = classifyState(cg, cgl, okx, dex, arkham, coreDq);
  console.log(`主状态: ${mainState.state} (${mainState.confidence})`);
  for (const s of secondaryStates) console.log(`  次状态: ${s.state} (${s.confidence})`);

  // ── Snapshot v2 ──
  const oiToMcap = cg.market_cap > 0 && cgl.oi_current ? cgl.oi_current / cg.market_cap : 0;
  const oiChange24hRatio = cgl.oi_current > 0 && cgl.oi_change_24h ? cgl.oi_change_24h / (cgl.oi_current - cgl.oi_change_24h) : 0;
  const liq4hToOi = cgl.oi_current > 0 ? (cgl.liquidation_volume_4h || 0) / cgl.oi_current : 0;
  const liq24hToOi = cgl.oi_current > 0 ? (cgl.liquidation_volume_24h || 0) / cgl.oi_current : 0;
  // Report-scoped values (order: okxVsGlobal must be computed before rOkxConfirm)
  const okxOiUsd = okx.okx_oi_usd_direct || okx.okx_oi_usd_estimated;
  const okxVsGlobal: number | null = okxOiUsd && cgl.oi_current > 0 ? okxOiUsd / cgl.oi_current : null;
  const rOkxConfirm = okxVsGlobal !== null && okxVsGlobal > 0.01 && okxVsGlobal < 0.5;
  const rOiChange24hExtreme = oiChange24hRatio >= 0.30;
  const rLiqElevated24h = (cgl.liquidation_volume_24h || 0) > 500000;
  const rOiDeclining24h = (cgl.oi_change_24h || 0) < 0;
  const okxRatioStatus = okx.okx_oi_unit === "USD_DIRECT" ? "USD_DIRECT" : okx.okx_oi_unit === "ESTIMATED_FROM_OI_CCY" ? "ESTIMATED" : "UNCONFIRMED";

  const snapH = "timestamp,token,price_usd,market_cap,volume_24h,return_1h,return_24h,return_7d,volume_to_mcap,coinglass_oi_usd,oi_change_4h,oi_change_24h,oi_change_24h_ratio,oi_zscore_24h,oi_to_market_cap,oi_to_mcap_extreme,oi_change_24h_extreme,funding_rate_raw,funding_rate_decimal,funding_rate_percent,funding_unit_status,funding_zscore_24h,funding_positive_streak,funding_abs_extreme,funding_streak_extreme,liquidation_volume_4h,liquidation_volume_24h,long_liq_4h,short_liq_4h,long_liq_24h,short_liq_24h,liquidation_imbalance_4h,liquidation_imbalance_24h,liquidation_to_oi_4h,liquidation_to_oi_24h,okx_oi_raw,okx_oi_ccy,okx_oi_usd_direct,okx_oi_unit,okx_vs_global_oi_ratio,okx_vs_global_oi_ratio_status,core_data_quality,context_data_quality,final_data_quality,main_state";

  const snapRow = [
    ts, LAB.sym, cg.price_usd || "", cg.market_cap || "", cg.volume_24h || "",
    cg.price_change_1h || "", cg.price_change_24h || "", cg.price_change_7d || "",
    cg.market_cap > 0 ? ((cg.volume_24h || 0) / cg.market_cap).toFixed(4) : "",
    cgl.oi_current || "", cgl.oi_change_4h || "", cgl.oi_change_24h || "",
    oiChange24hRatio.toFixed(4), cgl.oi_zscore?.toFixed(2) || "", oiToMcap.toFixed(4),
    String(oiToMcap >= 1.0), String(oiChange24hRatio >= 0.30),
    cgl.funding_rate_raw || "", cgl.funding_rate_decimal || "", cgl.funding_rate_percent?.toFixed(2) || "",
    cgl.funding_unit_status || "NEEDS_CONFIRMATION",
    cgl.funding_zscore?.toFixed(2) || "", cgl.funding_positive_streak || "",
    String((cgl.funding_rate_percent || 0) >= 5), String((cgl.funding_positive_streak || 0) >= 6),
    cgl.liquidation_volume_4h || "", cgl.liquidation_volume_24h || "",
    cgl.long_liquidation_volume_4h || "", cgl.short_liquidation_volume_4h || "",
    cgl.long_liquidation_volume_24h || "", cgl.short_liquidation_volume_24h || "",
    cgl.liquidation_imbalance_4h?.toFixed(4) || "", cgl.liquidation_imbalance_24h?.toFixed(4) || "",
    liq4hToOi.toFixed(6), liq24hToOi.toFixed(6),
    okx.okx_oi_raw || "", okx.okx_oi_ccy || "", okx.okx_oi_usd_direct || "",
    okx.okx_oi_unit || "", okxVsGlobal?.toFixed(4) || "", okxRatioStatus,
    coreDq.toFixed(2), ctxDq.toFixed(2), finalDq.toFixed(2), mainState.state,
  ];

  const snapPath = join(OUT_DIR, "lab_live_feature_snapshot_v2.csv");
  const isNew = !existsSync(snapPath);
  const escapeCsv = (v: any) => String(v ?? "").includes(",") ? `"${v}"` : String(v ?? "");
  if (isNew) writeFileSync(snapPath, snapH + "\n" + snapRow.map(escapeCsv).join(",") + "\n");
  else appendFileSync(snapPath, snapRow.map(escapeCsv).join(",") + "\n");
  console.log(`Snapshot v2 ${isNew ? "created" : "appended"}`);

  // DQ CSV
  const dqPath = join(OUT_DIR, "lab_live_data_quality.csv");
  const dqH = "timestamp,coingecko_ok,coinglass_ok,okx_ok,dex_ok,local_arkham_ok,core_data_quality,context_data_quality,final_data_quality,final_status_allowed";
  const dqRow = [ts, String(cg.ok), String(cgl.ok), String(okx.ok), String(dex.ok), String(arkham.ok), coreDq.toFixed(2), ctxDq.toFixed(2), finalDq.toFixed(2), coreDq >= 0.7 ? "ALLOWED" : "LAB_DATA_INSUFFICIENT"];
  if (!existsSync(dqPath)) writeFileSync(dqPath, dqH + "\n");
  appendFileSync(dqPath, dqRow.join(",") + "\n");

  // ── 报告（中文）──
  const riskLabel = (s: string) => s.includes("DELEVERAGING") || s.includes("LIQUIDATION") ? "🔴" : s.includes("FUNDING") || s.includes("OVERHEATED") ? "🟠" : s.includes("CROWDING") || s.includes("EFFICIENCY") ? "🟡" : "🟢";
  const reportLines = [
    "# LAB 高位风险监控报告", "",
    `生成时间: ${ts.slice(0, 19).replace("T", " ")}`,
    `数据质量: 核心${coreDq.toFixed(2)} / 扩展${ctxDq.toFixed(2)} / 综合${finalDq.toFixed(2)}`,
    "",
    "## 1. 综合研判", "",
    `**主状态: ${riskLabel(mainState.state)} ${mainState.state}**（置信度: ${mainState.confidence}）`,
    coreDq < 0.7 ? "**⚠️ 核心数据质量不足，结论需谨慎。**" : "",
    ...(secondaryStates.length > 0 ? [`次状态: ${secondaryStates.map(s => s.state).join("、")}`] : []),
    "",
    "## 2. 市场快照", "",
    `- 价格: $${cg.price_usd?.toFixed(6) || "?"}`,
    `- 市值: $${(cg.market_cap || 0).toLocaleString()}`,
    `- 24h 成交量: $${(cg.volume_24h || 0).toLocaleString()}`,
    `- 1h: ${cg.price_change_1h?.toFixed(1) || "?"}% | 24h: ${cg.price_change_24h?.toFixed(1) || "?"}% | 7d: ${cg.price_change_7d?.toFixed(1) || "?"}%`,
    `- 换手率: ${cg.market_cap > 0 ? ((cg.volume_24h || 0) / cg.market_cap * 100).toFixed(1) : "?"}%`,
    `- 流通量: ${cg.circulating_supply?.toLocaleString() || "?"}`,
    `- FDV: $${(cg.fdv || 0).toLocaleString()}`,
    "",
    "## 3. 衍生品（CoinGlass）", "",
    `- 聚合 OI: $${(cgl.oi_current || 0).toLocaleString()}`,
    `- OI/市值: ${oiToMcap.toFixed(2)} ${oiToMcap >= 1.0 ? "⚠️极端" : ""}`,
    `- OI 4h: ${(cgl.oi_change_4h || 0) >= 0 ? "+" : ""}$${Math.abs(cgl.oi_change_4h || 0).toLocaleString()}`,
    `- OI 24h: ${(cgl.oi_change_24h || 0) >= 0 ? "+" : ""}$${Math.abs(cgl.oi_change_24h || 0).toLocaleString()} (${(oiChange24hRatio*100).toFixed(0)}%) ${oiChange24hRatio >= 0.30 ? "⚠️极端" : ""}`,
    `- OI z-score: ${cgl.oi_zscore?.toFixed(2) || "?"}`,
    "",
    `- 资金费率: ${(cgl.funding_rate_percent || 0).toFixed(2)}%（原始值: ${(cgl.funding_rate_raw || 0).toFixed(4)}，单位: ${cgl.funding_unit_status || "?"}）`,
    `- 资金费率 z-score: ${cgl.funding_zscore?.toFixed(2) || "?"}`,
    `- 资金费率连续正向: ${cgl.funding_positive_streak || 0} 期 ${(cgl.funding_positive_streak || 0) >= 6 ? "⚠️极端" : ""}`,
    `- 资金费率绝对值极端: ${(cgl.funding_rate_percent || 0) >= 5 ? "是 (≥5%)" : "否"}`,
    "",
    `- 清算 4h: $${(cgl.liquidation_volume_4h || 0).toLocaleString()} (上行 $${(cgl.long_liquidation_volume_4h || 0).toLocaleString()} / 下行 $${(cgl.short_liquidation_volume_4h || 0).toLocaleString()})`,
    `- 清算 24h: $${(cgl.liquidation_volume_24h || 0).toLocaleString()}`,
    `- 清算 4h 不平衡: ${cgl.liquidation_imbalance_4h?.toFixed(2) || "?"}`,
    `- 清算 4h/OI: ${(liq4hToOi*100).toFixed(4)}% | 清算 24h/OI: ${(liq24hToOi*100).toFixed(4)}%`,
    "",
    "## 4. OKX 对照", "",
    `- OKX OI 单位: ${okx.okx_oi_unit || "?"}`,
    `- OKX OI USD: ${okxOiUsd ? "$" + okxOiUsd.toLocaleString() : "未知"}`,
    `- OKX 占全球 OI: ${okxVsGlobal ? (okxVsGlobal*100).toFixed(1) + "%" : "不可用 (单位=" + okxRatioStatus + ")"}`,
    `- OKX 资金费率: ${okx.funding_rate?.toFixed(4) || "?"} (${((okx.funding_rate || 0)*100).toFixed(2)}%)`,
    "",
    "## 5. DEX 上下文", "",
    dex.ok ? "- 可用" : "- DEX 数据不可用",
    "",
    "## 6. 风险状态证据", "",
    "| 状态 | 等级 | 证据 | 置信度 | 限制 |",
    "|------|------|------|--------|------|",
    `| ${mainState.state} | 主状态 | ${mainState.evidence.join("；")} | ${mainState.confidence} | ${mainState.limitations.join("；")} |`,
    ...secondaryStates.map(s => `| ${s.state} | 次状态 | ${s.evidence.join("；")} | ${s.confidence} | ${s.limitations.join("；")} |`),
    "",
    "## 7. 人工复核清单", "",
    `- [ ] 多交易所 OI 同步: ${rOiChange24hExtreme ? "⚠️极端 (+" + (oiChange24hRatio*100).toFixed(0) + "%)" : "正常"}`,
    `- [ ] 资金费率极端: ${(cgl.funding_rate_percent || 0) >= 5 ? "⚠️是 (" + (cgl.funding_rate_percent || 0).toFixed(1) + "%)" : "否"}`,
    `- [ ] 清算放大: ${rLiqElevated24h ? "⚠️是 ($" + ((cgl.liquidation_volume_24h || 0)/1e6).toFixed(1) + "M)" : "否"}`,
    `- [ ] 价格推进效率下降: ${mainState.state === "LAB_EFFICIENCY_DECAY" ? "⚠️是" : "不明确"}`,
    `- [ ] OI 开始下降: ${rOiDeclining24h ? "⚠️是" : "否（仍在上升）"}`,
    `- [ ] 出现去杠杆: ${mainState.state.includes("DELEVERAGING") ? "⚠️是" : "否"}`,
    `- [ ] OKX 确认: ${rOkxConfirm ? "是" : "不可用"}`,
    `- [ ] DEX 确认: ${dex.ok ? "是" : "否"}`,
    `- [ ] 数据完整: ${coreDq >= 0.7 ? "是" : "否"}`,
    "",
    "## 8. 无法确认的事项", "",
    "- 无法确认吸筹",
    "- 无法确认出货",
    "- 无法确认方向性入场",
    "- 无法推断买卖意图",
    "- 不构成交易建议",
  ];

  writeFileSync(join(REPORTS_DIR, "lab_live_monitor_report.md"), reportLines.join("\n"));
  console.log(`\nReport saved.`);
}

main().catch(console.error);
