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
  return lines.filter(l => l.trim()).map(l => {
    const p = l.split(",");
    const token = p[0];
    const label = p[7] || "DERIVATIVES_DATA_INSUFFICIENT";
    const confStr = p[8] || "LOW";
    const confidence: ResearchLayerSignal["confidence"] = (confStr === "HIGH" || confStr === "MEDIUM") ? confStr : "LOW";
    return {
      token, layer: "derivatives" as const, label, confidence,
      evidence: [`OI fields: confirm=${p[2] || "0"}d overheat=${p[4] || "0"}d`, `Funding overheat: ${p[5] || "0"}d`, `Deleveraging: ${p[6] || "0"}d`],
      limitations: ["OKX single-exchange", "No long/short ratio — direction unknown", "No taker volume"],
      affectsMainScore: false as const,
    };
  });
}

export function loadAllResearchLayers(): ResearchLayerSignal[] {
  return [...loadDerivativesLayer()];
}
