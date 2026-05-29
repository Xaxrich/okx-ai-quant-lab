import { loadDotenvOnce } from "../../config/env.js";

export type CgAuthMode = "PRO" | "DEMO" | "NO_KEY";

export interface CgAuth {
  mode: CgAuthMode;
  baseUrl: string;
  headers: Record<string, string>;
  sleepMs: number;
}

export function getCoinGeckoAuth(): CgAuth {
  loadDotenvOnce();
  const proKey = process.env.COINGECKO_PRO_API_KEY;
  const demoKey = process.env.COINGECKO_DEMO_API_KEY;

  if (proKey && proKey.length > 0) {
    return {
      mode: "PRO",
      baseUrl: "https://pro-api.coingecko.com/api/v3",
      headers: { "x-cg-pro-api-key": proKey },
      sleepMs: 1000,
    };
  }

  if (demoKey && demoKey.length > 0) {
    return {
      mode: "DEMO",
      baseUrl: "https://api.coingecko.com/api/v3",
      headers: { "x-cg-demo-api-key": demoKey },
      sleepMs: 5000,
    };
  }

  return {
    mode: "NO_KEY",
    baseUrl: "https://api.coingecko.com/api/v3",
    headers: {},
    sleepMs: 30000,
  };
}

export function formatMode(auth: CgAuth): string {
  return `${auth.mode} | ${auth.baseUrl} | sleep=${auth.sleepMs}ms`;
}
