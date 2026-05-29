import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

export interface DotenvLoadResult {
  path: string;
  loaded: boolean;
  keys: string[];
}

let loadedOnce = false;
let lastResult: DotenvLoadResult | null = null;

export function projectRoot(): string {
  return resolve(import.meta.dirname, "..", "..");
}

export function parseDotenv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;

    const name = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (!name) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }
  return values;
}

export function loadDotenv(options?: { path?: string; override?: boolean }): DotenvLoadResult {
  const envPath = options?.path ? resolve(options.path) : join(projectRoot(), ".env");
  const override = options?.override === true;

  if (loadedOnce && !override && !options?.path && lastResult) return lastResult;
  loadedOnce = true;

  if (!existsSync(envPath)) {
    lastResult = { path: envPath, loaded: false, keys: [] };
    return lastResult;
  }

  const values = parseDotenv(readFileSync(envPath, "utf-8"));
  const keys: string[] = [];
  for (const [name, value] of Object.entries(values)) {
    if (!override && process.env[name]) continue;
    process.env[name] = value;
    keys.push(name);
  }

  lastResult = { path: envPath, loaded: true, keys };
  return lastResult;
}

export function loadDotenvOnce(): DotenvLoadResult {
  return loadDotenv();
}

export function envValue(name: string, fallback = ""): string {
  loadDotenvOnce();
  return process.env[name] || fallback;
}

export function hasEnvValue(name: string): boolean {
  return envValue(name).length > 0;
}

