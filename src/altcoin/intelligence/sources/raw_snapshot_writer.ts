import { createHash } from "crypto";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { SourceProvider } from "./source_registry.js";

export interface RawSnapshotInput {
  provider: SourceProvider;
  endpoint: string;
  requestedAt: string;
  params: Record<string, unknown>;
  payload: unknown;
}

export interface RawSnapshotResult {
  path: string;
  paramsHash: string;
  rawPayloadHash: string;
  bytes: number;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._=-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function dateSegment(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "unknown-date";
  return parsed.toISOString().slice(0, 10);
}

export function buildRawSnapshotPath(root: string, input: Omit<RawSnapshotInput, "payload"> & { paramsHash: string }): string {
  return join(
    root,
    "data",
    "altcoin",
    "intelligence",
    "raw",
    safeSegment(input.provider),
    safeSegment(input.endpoint),
    dateSegment(input.requestedAt),
    `${input.paramsHash}.json`,
  );
}

export function writeRawSnapshot(root: string, input: RawSnapshotInput): RawSnapshotResult {
  const paramsHash = sha256Hex(input.params).slice(0, 16);
  const rawPayloadHash = sha256Hex(input.payload);
  const path = buildRawSnapshotPath(root, { ...input, paramsHash });
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const body = JSON.stringify({
    provider: input.provider,
    endpoint: input.endpoint,
    requested_at: input.requestedAt,
    params_hash: paramsHash,
    raw_payload_hash: rawPayloadHash,
    params: canonicalize(input.params),
    payload: input.payload,
  }, null, 2);

  writeFileSync(path, `${body}\n`, "utf-8");
  return { path, paramsHash, rawPayloadHash, bytes: Buffer.byteLength(body, "utf-8") + 1 };
}
