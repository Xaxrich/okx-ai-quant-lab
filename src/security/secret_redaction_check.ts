import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";

function loadDotenvValues(): Record<string, string> {
  const envPath = join(import.meta.dirname, "..", "..", ".env");
  if (!existsSync(envPath)) return {};

  const values: Record<string, string> = {};
  const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const name = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }
  return values;
}

const DOTENV_VALUES = loadDotenvValues();
const secretValue = (name: string): string => process.env[name] || DOTENV_VALUES[name] || "";

const KEYS: { name: string; value: string }[] = [
  { name: "ETHERSCAN_API_KEY", value: secretValue("ETHERSCAN_API_KEY") },
  { name: "COINMARKETCAP_API_KEY", value: secretValue("COINMARKETCAP_API_KEY") },
  { name: "COINGECKO_PRO_API_KEY", value: secretValue("COINGECKO_PRO_API_KEY") },
  { name: "COINGECKO_DEMO_API_KEY", value: secretValue("COINGECKO_DEMO_API_KEY") },
  { name: "BSCSCAN_API_KEY", value: secretValue("BSCSCAN_API_KEY") },
  { name: "COINGLASS_API_KEY", value: secretValue("COINGLASS_API_KEY") },
  { name: "MORALIS_API_KEY", value: secretValue("MORALIS_API_KEY") },
  { name: "ARKHAM_API_KEY", value: secretValue("ARKHAM_API_KEY") },
  { name: "OKX_API_KEY", value: secretValue("OKX_API_KEY") },
  { name: "OKX_SECRET_KEY", value: secretValue("OKX_SECRET_KEY") },
  { name: "OKX_PASSPHRASE", value: secretValue("OKX_PASSPHRASE") },
  { name: "FEISHU_APP_ID", value: secretValue("FEISHU_APP_ID") },
  { name: "FEISHU_APP_SECRET", value: secretValue("FEISHU_APP_SECRET") },
  { name: "FEISHU_CHAT_ID", value: secretValue("FEISHU_CHAT_ID") },
];

const nonEmptyKeys = KEYS.filter(k => k.value.length > 0);
if (nonEmptyKeys.length === 0) {
  console.log("WARNING: No API keys in environment. Security check limited.");
}

const SCAN_DIRS = ["logs", "reports", "data", "src", "scripts", "__tests__", "config", "."];
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const SKIP_EXTENSIONS = new Set([".exe", ".dll", ".png", ".jpg", ".bin", ".lock"]);
const SKIP_FILES = new Set([".env"]); // Keys belong here — it's gitignored

function findFiles(dir: string, baseDir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (SKIP_DIRS.has(entry) || SKIP_FILES.has(entry)) continue;
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...findFiles(fullPath, baseDir));
      } else {
        const ext = entry.slice(entry.lastIndexOf("."));
        if (!SKIP_EXTENSIONS.has(ext) && !entry.includes("package-lock")) {
          results.push(fullPath);
        }
      }
    } catch { /* skip permission errors */ }
  }
  return results;
}

async function main() {
  console.log("=== Secret Redaction Check ===\n");

  const findings: { file: string; type: string }[] = [];
  let totalFiles = 0;

  for (const dir of SCAN_DIRS) {
    const baseDir = join(import.meta.dirname, "..", "..");
    const absDir = join(baseDir, dir);
    const files = findFiles(absDir, baseDir);
    totalFiles += files.length;

    for (const file of files) {
      try {
        const content = readFileSync(file, "utf-8");
        for (const key of nonEmptyKeys) {
          if (content.includes(key.value)) {
            findings.push({ file: file.replace(baseDir + "/", "").replace(baseDir + "\\", ""), type: key.name });
          }
        }
      } catch { /* skip binary files */ }
    }
  }

  console.log(`Scanned ${totalFiles} files across ${SCAN_DIRS.length} directories.\n`);

  if (findings.length === 0) {
    console.log("RESULT: CLEAN — no API keys found in project files.\n");
  } else {
    console.log("RESULT: API KEYS FOUND — immediate action required:\n");
    for (const f of findings) {
      console.log(`  REDACTED_SECRET_FOUND: ${f.type} in ${f.file}`);
    }
    console.log("\nACTIONS:");
    console.log("  1. Rotate all exposed API keys immediately");
    console.log("  2. Replace keys in affected files with [REDACTED]");
    console.log("  3. Run 'npm run security:check-secrets' again to verify\n");
  }

  // Check specific safety items
  console.log("=== Additional Checks ===\n");

  // Check .env is in .gitignore
  try {
    const gitignore = readFileSync(join(import.meta.dirname, "..", "..", ".gitignore"), "utf-8");
    if (gitignore.includes(".env")) {
      console.log("OK: .env is in .gitignore");
    } else {
      console.log("WARNING: .env NOT in .gitignore — add it immediately");
    }
  } catch {
    console.log("WARNING: .gitignore not found");
  }

  // Check .env.example has no real keys
  try {
    const example = readFileSync(join(import.meta.dirname, "..", "..", ".env.example"), "utf-8");
    let exampleClean = true;
    for (const key of nonEmptyKeys) {
      if (example.includes(key.value)) { console.log(`REDACTED_SECRET_FOUND: .env.example contains ${key.name}`); exampleClean = false; }
    }
    if (exampleClean) {
      console.log("OK: .env.example contains no real keys");
    }
  } catch {
    console.log("WARNING: .env.example not found");
  }

  // Check scanner MVP outputs
  const scannerReportDir = join(import.meta.dirname, "..", "..", "reports", "altcoin", "scanner_mvp");
  if (existsSync(scannerReportDir)) {
    const reports = readdirSync(scannerReportDir).filter(f => f.endsWith(".md"));
    let clean = true;
    for (const r of reports) {
      const content = readFileSync(join(scannerReportDir, r), "utf-8");
      for (const key of nonEmptyKeys) {
        if (content.includes(key.value)) {
          console.log(`REDACTED_SECRET_FOUND: scanner report ${r} contains ${key.name}`);
          clean = false;
        }
      }
    }
    if (clean) console.log(`OK: ${reports.length} scanner reports checked — no keys found`);
  }

  process.exitCode = findings.length > 0 ? 1 : 0;
}

main().catch(console.error);
