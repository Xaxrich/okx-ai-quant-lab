import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const STATE_PATH = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live", "lab_feishu_last_sent_state.json");

interface SentState {
  last_fast_state: string;
  last_review_label: string;
  last_risk_bucket: string;
  last_sent_at: string;
  last_standard_brief_at: string;
  last_hourly_report_at: string;
  last_message_hash: string;
}

function getRiskBucket(score: number): string {
  if (score >= 71) return "HIGH_RISK_REVIEW";
  if (score >= 51) return "REVIEW_REQUIRED";
  if (score >= 31) return "WATCH";
  return "OBSERVE";
}

function loadState(): SentState {
  try {
    if (existsSync(STATE_PATH)) return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
  } catch { /* */ }
  return { last_fast_state: "", last_review_label: "", last_risk_bucket: "", last_sent_at: "", last_standard_brief_at: "", last_hourly_report_at: "", last_message_hash: "" };
}

function saveState(s: SentState) {
  const dir = join(STATE_PATH, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

export function shouldSendFastAlert(
  state: string, reviewLabel: string, riskScore: number, freshness: string, cgRemaining: number
): { send: boolean; reasons: string[] } {
  const prev = loadState();
  const reasons: string[] = [];
  const bucket = getRiskBucket(riskScore);
  const now = new Date().toISOString();

  if (state !== prev.last_fast_state) reasons.push(`state changed: ${prev.last_fast_state} → ${state}`);
  if (bucket !== prev.last_risk_bucket) reasons.push(`risk bucket: ${prev.last_risk_bucket} → ${bucket}`);
  if (reviewLabel !== prev.last_review_label) reasons.push(`review: ${prev.last_review_label} → ${reviewLabel}`);
  if (state.includes("ROLLOVER") || state.includes("SPIKE") || state.includes("DELEVERAGING")) reasons.push(`critical state: ${state}`);
  if (freshness === "BUDGET_BLOCKED" || freshness === "STALE") reasons.push(`data freshness: ${freshness}`);
  if (cgRemaining < 80) reasons.push(`CG budget low: ${cgRemaining}`);

  if (reasons.length > 0) {
    prev.last_fast_state = state;
    prev.last_review_label = reviewLabel;
    prev.last_risk_bucket = bucket;
    prev.last_sent_at = now;
    saveState(prev);
    return { send: true, reasons };
  }
  return { send: false, reasons: ["PUSH_SKIPPED_NO_MATERIAL_CHANGE"] };
}

export function shouldSendStandardBrief(hash: string, force?: boolean): { send: boolean; reason: string } {
  if (force) return { send: true, reason: "FORCED" };
  const prev = loadState();
  const now = new Date().toISOString();

  if (prev.last_standard_brief_at) {
    const lastAt = new Date(prev.last_standard_brief_at).getTime();
    if (!isNaN(lastAt) && Date.now() - lastAt < 14 * 60000) {
      return { send: false, reason: "THROTTLED: <15min since last standard brief" };
    }
  }
  if (hash === prev.last_message_hash && hash !== "") {
    return { send: false, reason: "DUPLICATE: same message hash" };
  }

  prev.last_standard_brief_at = now;
  prev.last_message_hash = hash;
  saveState(prev);
  return { send: true, reason: "OK" };
}

export function shouldSendHourlyReport(hash: string): { send: boolean; reason: string } {
  const prev = loadState();
  const now = new Date().toISOString();

  if (prev.last_hourly_report_at) {
    const lastAt = new Date(prev.last_hourly_report_at).getTime();
    if (Date.now() - lastAt < 55 * 60000) {
      return { send: false, reason: "THROTTLED: <55min since last hourly report" };
    }
  }
  if (hash === prev.last_message_hash) {
    return { send: false, reason: "DUPLICATE: same message hash" };
  }

  prev.last_hourly_report_at = now;
  prev.last_message_hash = hash;
  saveState(prev);
  return { send: true, reason: "OK" };
}

export function messageHash(text: string): string {
  return createHash("md5").update(text).digest("hex").slice(0, 8);
}
