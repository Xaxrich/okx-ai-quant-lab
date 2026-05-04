import type { EventStudyEntry, SignalValidationReport, ValidationDecision } from "../schemas/validation_schema.js";

export interface EventStudyInput {
  token: string;
  eventDate: string;
  signalTriggerDates: { signalId: string; date: string; signalType: EventStudyEntry["signalType"] }[];
  forwardReturns: { date: string; return1d: number; return3d: number; return7d: number; maxDrawdown7d: number }[];
  isPositiveSample: boolean;
  isControlSample: boolean;
}

export function runEventStudy(inputs: EventStudyInput[]): EventStudyEntry[] {
  const entries: EventStudyEntry[] = [];

  for (const input of inputs) {
    for (const trigger of input.signalTriggerDates) {
      const triggerIdx = input.forwardReturns.findIndex(r => r.date >= trigger.date);
      const fwd = triggerIdx >= 0 ? input.forwardReturns[triggerIdx] : null;

      const entry: EventStudyEntry = {
        signalId: trigger.signalId,
        token: input.token,
        triggerDate: trigger.date,
        signalType: trigger.signalType,
        leadLagDays: input.eventDate
          ? Math.round((new Date(trigger.date).getTime() - new Date(input.eventDate).getTime()) / 86400000)
          : 0,
        forwardReturn1d: fwd?.return1d ?? null,
        forwardReturn3d: fwd?.return3d ?? null,
        forwardReturn7d: fwd?.return7d ?? null,
        forwardMaxDrawdown7d: fwd?.maxDrawdown7d ?? null,
        positiveSampleHit: input.isPositiveSample,
        controlSampleHit: input.isControlSample,
        falsePositiveFlag: input.isControlSample,
        decision: "NEED_MORE_DATA",
        notes: "",
      };

      entries.push(entry);
    }
  }

  return entries;
}

export function aggregateValidation(entries: EventStudyEntry[]): SignalValidationReport[] {
  const bySignal = new Map<string, EventStudyEntry[]>();
  for (const e of entries) {
    const list = bySignal.get(e.signalId) || [];
    list.push(e);
    bySignal.set(e.signalId, list);
  }

  const reports: SignalValidationReport[] = [];

  for (const [signalId, signalEntries] of bySignal) {
    const total = signalEntries.length;
    const posHits = signalEntries.filter(e => e.positiveSampleHit).length;
    const ctrlHits = signalEntries.filter(e => e.controlSampleHit).length;
    const fpCount = signalEntries.filter(e => e.falsePositiveFlag).length;
    const posRate = total > 0 ? posHits / total : 0;
    const ctrlRate = total > 0 ? ctrlHits / total : 0;
    const fpRate = total > 0 ? fpCount / total : 0;
    const leadTimes = signalEntries.map(e => e.leadLagDays).filter(d => d !== 0);

    let decision: ValidationDecision;
    if (total < 5) decision = "NEED_MORE_DATA";
    else if (fpRate > 0.3) decision = "REJECT_HIGH_FALSE_POSITIVE";
    else if (posRate > 0.5 && fpRate < 0.1) decision = "KEEP";
    else if (posRate > 0.3 && fpRate < 0.15) decision = "KEEP_AS_RISK_SIGNAL";
    else decision = "NEED_MORE_DATA";

    reports.push({
      signalId,
      signalType: signalEntries[0]?.signalType || "UNKNOWN",
      triggerCount: total,
      positiveTriggerRate: posRate,
      controlTriggerRate: ctrlRate,
      falsePositiveRate: fpRate,
      averageLeadTime: leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : null,
      medianLeadTime: leadTimes.length > 0 ? leadTimes.sort((a, b) => a - b)[Math.floor(leadTimes.length / 2)] : null,
      averageForwardReturn7d: null,
      averageForwardDrawdown7d: null,
      decision,
      limitations: total < 10 ? ["Sample size < 10 — statistically unreliable"] : [],
    });
  }

  return reports;
}
