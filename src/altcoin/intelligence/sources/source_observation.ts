import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { writeCsv } from "../../../utils/csv.js";
import type { SourceEndpointSpec, SourceProvider } from "./source_registry.js";

export type SourceObservationStatus =
  | "OK"
  | "MISSING"
  | "STALE"
  | "PARTIAL"
  | "RATE_LIMITED"
  | "ERROR"
  | "NOT_CONFIGURED";

export interface SourceObservationInput {
  runId: string;
  token: string;
  provider: SourceProvider;
  endpoint: string;
  paramsHash: string;
  rawPayloadHash: string;
  requestedAt: string;
  responseAt: string;
  rows: number;
  configured?: boolean;
  errorCode?: string;
  normalizedTable?: string;
  featureVersion?: string;
}

export interface SourceObservation extends Required<Omit<SourceObservationInput, "configured" | "errorCode" | "normalizedTable" | "featureVersion">> {
  status: SourceObservationStatus;
  freshnessSeconds: number;
  errorCode: string;
  normalizedTable: string;
  featureVersion: string;
}

function secondsBetween(start: string, end: string): number {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((b - a) / 1000));
}

export function classifySourceObservation(spec: SourceEndpointSpec, input: SourceObservationInput, now = new Date()): SourceObservationStatus {
  if (input.configured === false) return "NOT_CONFIGURED";
  if (input.errorCode) {
    if (input.errorCode === "429" || input.errorCode.toUpperCase().includes("RATE_LIMIT")) return "RATE_LIMITED";
    return "ERROR";
  }

  const freshnessSeconds = secondsBetween(input.responseAt, now.toISOString());
  if (freshnessSeconds > spec.freshnessSlaSeconds) return "STALE";
  if (input.rows <= 0) return "MISSING";
  if (input.rows < 3 && spec.requiredFor.includes("EXECUTION_REVIEW_CANDIDATE")) return "PARTIAL";
  return "OK";
}

export function buildSourceObservation(spec: SourceEndpointSpec, input: SourceObservationInput, now = new Date()): SourceObservation {
  const responseAt = input.responseAt || now.toISOString();
  const status = classifySourceObservation(spec, { ...input, responseAt }, now);
  return {
    runId: input.runId,
    token: input.token,
    provider: input.provider,
    endpoint: input.endpoint,
    paramsHash: input.paramsHash,
    rawPayloadHash: input.rawPayloadHash,
    requestedAt: input.requestedAt,
    responseAt,
    freshnessSeconds: secondsBetween(responseAt, now.toISOString()),
    status,
    rows: input.rows,
    errorCode: input.errorCode || "",
    normalizedTable: input.normalizedTable || "",
    featureVersion: input.featureVersion || "",
  };
}

export const SOURCE_OBSERVATION_HEADERS = [
  "run_id",
  "token",
  "provider",
  "endpoint",
  "params_hash",
  "raw_payload_hash",
  "requested_at",
  "response_at",
  "freshness_seconds",
  "status",
  "rows",
  "error_code",
  "normalized_table",
  "feature_version",
] as const;

export function sourceObservationToCsvRow(observation: SourceObservation): string[] {
  return [
    observation.runId,
    observation.token,
    observation.provider,
    observation.endpoint,
    observation.paramsHash,
    observation.rawPayloadHash,
    observation.requestedAt,
    observation.responseAt,
    String(observation.freshnessSeconds),
    observation.status,
    String(observation.rows),
    observation.errorCode,
    observation.normalizedTable,
    observation.featureVersion,
  ];
}

export function writeSourceObservationsCsv(path: string, observations: SourceObservation[]): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeCsv(path, [
    [...SOURCE_OBSERVATION_HEADERS],
    ...observations.map(sourceObservationToCsvRow),
  ]);
}
