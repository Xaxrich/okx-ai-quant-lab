import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";

export interface RiskPolicy {
  mode: "demo" | "live";
  allowLiveTrading: boolean;
  maxOrderNotionalUSDT: number;
  maxDailyLossUSDT: number;
  maxDailyTrades: number;
  allowedInstruments: string[];
  blockedInstrumentTypes: string[];
  requireHumanApproval: boolean;
  dryRunByDefault: boolean;
}

let _cachedPolicy: RiskPolicy | null = null;

export function loadRiskPolicy(path?: string): RiskPolicy {
  if (_cachedPolicy && !path) return _cachedPolicy;

  const policyPath =
    path ||
    process.env.RISK_POLICY ||
    "config/risk_policy.demo.yaml";

  const content = readFileSync(policyPath, "utf-8");
  const parsed = parseYaml(content) as RiskPolicy;

  validatePolicyShape(parsed);
  _cachedPolicy = parsed;
  return parsed;
}

export function reloadRiskPolicy(path?: string): RiskPolicy {
  _cachedPolicy = null;
  return loadRiskPolicy(path);
}

function validatePolicyShape(policy: RiskPolicy): void {
  if (!policy.mode || !["demo", "live"].includes(policy.mode)) {
    throw new Error('Risk policy must have mode: "demo" or "live"');
  }
  if (policy.mode === "live" && policy.allowLiveTrading) {
    throw new Error(
      "LIVE TRADING MUST BE DISABLED. Set allowLiveTrading: false in risk policy."
    );
  }
  if (typeof policy.maxOrderNotionalUSDT !== "number") {
    throw new Error("Risk policy must specify maxOrderNotionalUSDT");
  }
  if (!Array.isArray(policy.allowedInstruments)) {
    throw new Error("Risk policy must specify allowedInstruments");
  }
}
