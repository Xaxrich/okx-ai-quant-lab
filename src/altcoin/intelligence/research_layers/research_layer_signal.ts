export type ResearchLayerName = "derivatives" | "dex_history" | "holder" | "transfer" | "social";

export interface ResearchLayerSignal {
  token: string;
  layer: ResearchLayerName;
  label: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  evidence: string[];
  limitations: string[];
  affectsMainScore: false;
}

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const DERIV_PATH = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "derivatives", "analysis", "okx_derivatives_event_level_analysis.csv");

export function loadDerivativesLayer(): ResearchLayerSignal[] {
  if (!existsSync(DERIV_PATH)) return [];
  const lines = readFileSync(DERIV_PATH, "utf-8").split("\n").slice(1);
  // CSV: token,breakout_date,oi_lead_lag_days,first_oi_lead_date,oi_overheat_days,fund_overheat_days,delev_days,label,confidence
  return lines.filter(l => l.trim()).map(l => {
    const p = l.split(",");
    const token = p[0];
    const leadLag = p[2] || "N/A";
    const oiOverheat = p[4] || "0";
    const fundOverheat = p[5] || "0";
    const delev = p[6] || "0";
    const label = p[7] || "DERIVATIVES_DATA_INSUFFICIENT";
    const confStr = p[8] || "LOW";
    const confidence: ResearchLayerSignal["confidence"] = (confStr === "HIGH" || confStr === "MEDIUM") ? confStr : "LOW";
    return {
      token, layer: "derivatives" as const, label, confidence,
      evidence: [`OI lead/lag: ${leadLag}d`, `OI overheat: ${oiOverheat}d`, `Fund overheat: ${fundOverheat}d`, `Deleveraging: ${delev}d`],
      limitations: ["OKX single-exchange", "No long/short ratio — direction unknown", "No taker volume"],
      affectsMainScore: false as const,
    };
  });
}

export function loadAllResearchLayers(): ResearchLayerSignal[] {
  return [...loadDerivativesLayer()];
}
