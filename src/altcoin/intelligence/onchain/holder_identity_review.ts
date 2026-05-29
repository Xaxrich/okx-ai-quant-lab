import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";
import { fetchJsonWithFallback } from "../../../utils/http.js";
import { arkhamGet } from "../arkham/arkham_client.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const ENTITY_FLOW_PATH = join(ROOT, "data", "altcoin", "intelligence", "onchain", "entity_flow_review_latest.csv");
const OUT_DIR = join(ROOT, "data", "altcoin", "intelligence", "onchain");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "onchain");

type HolderIdentityDecision = "IDENTITY_RESOLVED" | "PROJECT_CONTRACT_LIKELY" | "HIGH_CONCENTRATION_UNRESOLVED" | "LOW_PRIORITY" | "RETRY_REQUIRED";

interface EntityFlowRow {
  token: string;
  chain: string;
  top_holder_address: string;
  top_holder_entity: string;
  top_holder_is_contract: string;
  top_holder_pct_supply: string;
  top10_holder_pct_supply: string;
}

export interface ContractMetadata {
  status: string;
  contractName: string;
  isVerified: boolean;
  isProxy: boolean;
  implementation: string;
}

export interface HolderIdentityResult {
  token: string;
  chain: string;
  address: string;
  moralisEntity: string;
  moralisIsContract: boolean | null;
  topHolderPctSupply: number | null;
  top10HolderPctSupply: number | null;
  explorerStatus: string;
  contractName: string;
  isVerified: boolean;
  isProxy: boolean;
  implementation: string;
  arkhamStatus: string;
  arkhamEntityName: string;
  arkhamEntityType: string;
  arkhamLabelName: string;
  identityClass: string;
  decision: HolderIdentityDecision;
  reason: string;
}

function loadDotenv(): void {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [name, valueRaw] = line.split(/=(.*)/s);
    if (!name || process.env[name]) continue;
    process.env[name] = (valueRaw || "").trim().replace(/^["']|["']$/g, "");
  }
}

function rowsToObjects<T extends object>(path: string): T[] {
  const csv = readCsv(path);
  if (!csv) return [];
  return csv.rows.map((row) => {
    const out: Record<string, string> = {};
    csv.h.forEach((header, index) => {
      out[header] = row[index] || "";
    });
    return out as T;
  });
}

function numOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolOrNull(value: string | undefined): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function chainId(chain: string): string | null {
  const ids: Record<string, string> = { eth: "1", ethereum: "1", bsc: "56" };
  return ids[chain.toLowerCase()] || null;
}

function arkhamChain(chain: string): string | null {
  const chains: Record<string, string> = { eth: "ethereum", ethereum: "ethereum", bsc: "bsc" };
  return chains[chain.toLowerCase()] || null;
}

async function etherscanContractMetadata(chain: string, address: string): Promise<ContractMetadata> {
  const key = process.env.ETHERSCAN_API_KEY || "";
  const id = chainId(chain);
  if (!key) return { status: "ETHERSCAN_NOT_CONFIGURED", contractName: "", isVerified: false, isProxy: false, implementation: "" };
  if (!id) return { status: "UNSUPPORTED_CHAIN", contractName: "", isVerified: false, isProxy: false, implementation: "" };

  try {
    const url = new URL("https://api.etherscan.io/v2/api");
    url.search = new URLSearchParams({ chainid: id, module: "contract", action: "getsourcecode", address, apikey: key }).toString();
    const response = await fetchJsonWithFallback(url.toString());
    if (response.status < 200 || response.status >= 300) return { status: `HTTP_${response.status}`, contractName: "", isVerified: false, isProxy: false, implementation: "" };
    const data = response.body as any;
    const first = Array.isArray(data?.result) ? data.result[0] : null;
    if (!first || data.status !== "1") {
      return { status: String(data?.message || "UNEXPECTED_RESPONSE"), contractName: "", isVerified: false, isProxy: false, implementation: "" };
    }
    const source = String(first.SourceCode || "");
    const abi = String(first.ABI || "");
    const contractName = String(first.ContractName || "");
    const implementation = String(first.Implementation || "");
    const proxyRaw = String(first.Proxy || first.IsProxy || "").toLowerCase();
    return {
      status: "OK",
      contractName,
      isVerified: Boolean(source) && abi !== "Contract source code not verified",
      isProxy: proxyRaw === "1" || proxyRaw === "true" || Boolean(implementation),
      implementation,
    };
  } catch (err) {
    return { status: err instanceof Error ? `ERROR_${err.message}` : "ERROR", contractName: "", isVerified: false, isProxy: false, implementation: "" };
  }
}

export function classifyHolderIdentity(input: Pick<HolderIdentityResult, "moralisEntity" | "moralisIsContract" | "contractName" | "isVerified" | "isProxy" | "topHolderPctSupply" | "arkhamEntityName" | "arkhamEntityType">): { identityClass: string; decision: HolderIdentityDecision; reason: string } {
  const holderPct = input.topHolderPctSupply ?? 0;
  const arkhamEntityName = input.arkhamEntityName;
  const arkhamEntityType = input.arkhamEntityType;
  const text = `${input.moralisEntity} ${input.contractName} ${arkhamEntityName}`.toLowerCase();
  const hasProjectTerm = ["treasury", "governor", "voting", "escrow", "staking", "vesting", "vault", "token", "foundation", "protocol", "finance"].some((term) => text.includes(term));
  const isGenericMultisigProxy = ["gnosissafeproxy", "gnosis safe proxy", "safeproxy", "safe proxy"].some((term) => text.includes(term));

  if (arkhamEntityName) {
    const suffix = arkhamEntityType ? arkhamEntityType.toUpperCase().replace(/[^A-Z0-9]+/g, "_") : "ENTITY";
    return { identityClass: `ARKHAM_${suffix}_RESOLVED`, decision: "IDENTITY_RESOLVED", reason: "Arkham resolved top holder entity" };
  }
  if (input.moralisEntity) {
    return { identityClass: hasProjectTerm ? "LABELED_PROJECT_OR_PROTOCOL" : "LABELED_ENTITY", decision: "IDENTITY_RESOLVED", reason: "Moralis provided an entity or label for top holder" };
  }
  if (holderPct >= 25 && isGenericMultisigProxy) {
    return { identityClass: "UNATTRIBUTED_MULTISIG_PROXY", decision: "HIGH_CONCENTRATION_UNRESOLVED", reason: "High concentration Gnosis/Safe proxy lacks entity attribution" };
  }
  if (input.contractName && hasProjectTerm) {
    return { identityClass: "PROJECT_CONTRACT_LIKELY", decision: "PROJECT_CONTRACT_LIKELY", reason: "Explorer contract name looks project/protocol related" };
  }
  if (holderPct >= 25 && input.moralisIsContract === true && !input.contractName) {
    return { identityClass: "UNLABELED_HIGH_CONCENTRATION_CONTRACT", decision: "HIGH_CONCENTRATION_UNRESOLVED", reason: "High concentration contract lacks entity and verified contract name" };
  }
  if (holderPct >= 25 && !input.moralisEntity) {
    return { identityClass: "UNLABELED_HIGH_CONCENTRATION_HOLDER", decision: "HIGH_CONCENTRATION_UNRESOLVED", reason: "High concentration holder lacks entity label" };
  }
  if (input.contractName || input.isVerified || input.isProxy) {
    return { identityClass: "UNLABELED_CONTRACT", decision: "LOW_PRIORITY", reason: "Contract has some explorer metadata but no high concentration blocker" };
  }
  return { identityClass: "UNLABELED_LOW_PRIORITY", decision: "LOW_PRIORITY", reason: "No high concentration blocker" };
}

async function arkhamAddressIdentity(chain: string, address: string): Promise<{ status: string; entityName: string; entityType: string; labelName: string }> {
  const mapped = arkhamChain(chain);
  if (!mapped) return { status: "ARKHAM_UNSUPPORTED_CHAIN", entityName: "", entityType: "", labelName: "" };
  const response = await arkhamGet(`/intelligence/address/${address}?chain=${mapped}`, { token: `holder-${address}`, cacheTtlHours: 6 });
  const data = response.data as any;
  return {
    status: response.status,
    entityName: data?.arkhamEntity?.name || "",
    entityType: data?.arkhamEntity?.type || "",
    labelName: data?.arkhamLabel?.name || "",
  };
}

async function reviewOne(row: EntityFlowRow): Promise<HolderIdentityResult> {
  const metadata = await etherscanContractMetadata(row.chain, row.top_holder_address);
  const arkham = await arkhamAddressIdentity(row.chain, row.top_holder_address);
  const base = {
    token: row.token,
    chain: row.chain,
    address: row.top_holder_address,
    moralisEntity: row.top_holder_entity,
    moralisIsContract: boolOrNull(row.top_holder_is_contract),
    topHolderPctSupply: numOrNull(row.top_holder_pct_supply),
    top10HolderPctSupply: numOrNull(row.top10_holder_pct_supply),
    explorerStatus: metadata.status,
    contractName: metadata.contractName,
    isVerified: metadata.isVerified,
    isProxy: metadata.isProxy,
    implementation: metadata.implementation,
    arkhamStatus: arkham.status,
    arkhamEntityName: arkham.entityName,
    arkhamEntityType: arkham.entityType,
    arkhamLabelName: arkham.labelName,
  };
  const classified = classifyHolderIdentity(base);
  return { ...base, ...classified };
}

function buildReport(rows: HolderIdentityResult[]): string {
  const lines = [
    "# Holder Identity Review",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| token | decision | holder_pct | arkham_entity | moralis_entity | contract_name | verified | proxy | reason |",
    "| --- | --- | ---: | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    lines.push(`| ${row.token} | ${row.decision} | ${row.topHolderPctSupply === null ? "" : row.topHolderPctSupply.toFixed(2) + "%"} | ${row.arkhamEntityName} | ${row.moralisEntity} | ${row.contractName} | ${row.isVerified} | ${row.isProxy} | ${row.reason} |`);
  }
  return lines.join("\n");
}

async function main() {
  loadDotenv();
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const rows = rowsToObjects<EntityFlowRow>(ENTITY_FLOW_PATH).filter((row) => row.top_holder_address);
  const results: HolderIdentityResult[] = [];
  for (const row of rows) {
    results.push(await reviewOne(row));
  }

  const outPath = join(OUT_DIR, "holder_identity_review_latest.csv");
  const reportPath = join(REPORTS_DIR, "holder_identity_review_latest.md");
  writeCsv(outPath, [
    ["checked_at", "token", "chain", "top_holder_address", "moralis_entity", "moralis_is_contract", "top_holder_pct_supply", "top10_holder_pct_supply", "explorer_status", "contract_name", "is_verified", "is_proxy", "implementation", "arkham_status", "arkham_entity_name", "arkham_entity_type", "arkham_label_name", "identity_class", "decision", "reason"],
    ...results.map((row) => [new Date().toISOString(), row.token, row.chain, row.address, row.moralisEntity, row.moralisIsContract === null ? "" : String(row.moralisIsContract), row.topHolderPctSupply ?? "", row.top10HolderPctSupply ?? "", row.explorerStatus, row.contractName, String(row.isVerified), String(row.isProxy), row.implementation, row.arkhamStatus, row.arkhamEntityName, row.arkhamEntityType, row.arkhamLabelName, row.identityClass, row.decision, row.reason]),
  ]);
  writeFileSync(reportPath, buildReport(results), "utf-8");

  console.log("=== Holder Identity Review ===");
  for (const row of results) {
    console.log(`${row.token}: ${row.decision} holder=${row.topHolderPctSupply ?? "?"}% contract=${row.contractName || "(none)"} arkham=${row.arkhamEntityName || "(none)"} moralis=${row.moralisEntity || "(none)"}`);
  }
  console.log(`Output: ${outPath}`);
  console.log(`Report: ${reportPath}`);
}

const isMain = process.argv[1]?.includes("holder_identity_review");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
