export type ValidationDecision =
  | "KEEP"
  | "KEEP_AS_CONTEXT"
  | "KEEP_AS_RISK_SIGNAL"
  | "NEED_MORE_DATA"
  | "REJECT_HIGH_FALSE_POSITIVE";

export interface EventStudyEntry {
  signalId: string;
  token: string;
  triggerDate: string;
  signalType: "EARLY_SETUP" | "MARKUP_CONFIRMATION" | "DISTRIBUTION_RISK" | "CONTEXT";
  leadLagDays: number;
  forwardReturn1d: number | null;
  forwardReturn3d: number | null;
  forwardReturn7d: number | null;
  forwardMaxDrawdown7d: number | null;
  positiveSampleHit: boolean;
  controlSampleHit: boolean;
  falsePositiveFlag: boolean;
  decision: ValidationDecision;
  notes: string;
}

export interface SignalValidationReport {
  signalId: string;
  signalType: string;
  triggerCount: number;
  positiveTriggerRate: number;
  controlTriggerRate: number;
  falsePositiveRate: number;
  averageLeadTime: number | null;
  medianLeadTime: number | null;
  averageForwardReturn7d: number | null;
  averageForwardDrawdown7d: number | null;
  decision: ValidationDecision;
  limitations: string[];
}
