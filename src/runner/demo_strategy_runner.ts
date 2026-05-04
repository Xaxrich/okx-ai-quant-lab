import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { randomBytes } from "crypto";
import { okxJson } from "../connectors/okx_cli.js";
import { fetchPaginated, type NormalizedCandle } from "../data/fetch_candles.js";
import { MaCrossStrategy } from "../strategies/ma_cross.js";
import { RsiReversionStrategy } from "../strategies/rsi_reversion.js";
import { VolatilityBreakoutStrategy } from "../strategies/volatility_breakout.js";
import type { Strategy, Signal } from "../strategies/strategy.js";
import { loadRiskPolicy } from "../risk/risk_policy.js";
import { guardOrderIntent } from "../risk/order_guard.js";
import { AuditLogger } from "../audit/logger.js";
import { PositionLedger } from "../portfolio/position_ledger.js";
import { PnLTracker } from "../portfolio/pnl_tracker.js";

// ── Types ──

interface SignalProcessingConfig {
  recordAllSignals: boolean;
  maxDisplayedSignalsPerStrategy: number;
  maxDisplayedSignalsPerInstrument: number;
  maxDryRunProposalsPerRun: number;
  maxExecutableOrdersPerRun: number;
}

interface ReportingConfig {
  includeNoSignalStrategies: boolean;
  groupByStrategy: boolean;
  groupByInstrument: boolean;
  groupByTimeframe: boolean;
  showBlockedReasons: boolean;
}

interface RunnerConfig {
  mode: string;
  profile: string;
  liveTradingEnabled: boolean;
  executeDemoByDefault: boolean;
  requireHumanApproval: boolean;
  allowedInstruments: string[];
  blockedInstrumentTypes: string[];
  allowedOrderTypes: string[];
  signalProcessing: SignalProcessingConfig;
  reporting: ReportingConfig;
}

type ActionCategory = "BLOCKED" | "OBSERVATION_ONLY" | "PROPOSAL_DRY_RUN" | "NO_SIGNAL";

interface SignalJournalEntry {
  runId: string;
  timestamp: string;
  strategyName: string;
  strategyVersion: string;
  instId: string;
  timeframe: string;
  signal: string;
  confidence: number;
  reason: string;
  admissionStatus: string;
  actionCategory: ActionCategory;
  blockedReason: string;
  priceAtSignal: string;
  marketRegime: string;
  proposalId: string;
  auditLogPath: string;
}

interface StrategySummary {
  strategyName: string;
  admissionStatus: string;
  rawSignalCount: number;
  displayedSignalCount: number;
  actionCategories: Record<string, number>;
  blockedReasons: string[];
  recommendation: string;
}

interface InstrumentSummary {
  instId: string;
  signalCount: number;
  strategyDistribution: Record<string, number>;
  riskDecisions: Record<string, number>;
}

// ── Paths ──

const SIGNAL_JOURNAL_DIR = join(import.meta.dirname, "..", "..", "data", "signals");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "reports");
const ADMISSION_REPORT_PATH = join(REPORTS_DIR, "strategy_admission_report.md");
const audit = new AuditLogger();

// ── Config ──

function loadRunnerConfig(): RunnerConfig {
  const raw = readFileSync("config/runner.demo.yaml", "utf-8");
  return parseYaml(raw) as RunnerConfig;
}

// ── Admission Status ──

function loadAdmissionStatuses(): Map<string, string> {
  const statuses = new Map<string, string>();
  if (!existsSync(ADMISSION_REPORT_PATH)) return statuses;
  const content = readFileSync(ADMISSION_REPORT_PATH, "utf-8");
  let inTable = false;
  for (const line of content.split("\n")) {
    if (line.includes("| Strategy | Inst | Bar | Level |")) { inTable = true; continue; }
    if (inTable && line.startsWith("|") && !line.includes("---")) {
      const parts = line.split("|").map(p => p.trim()).filter(Boolean);
      if (parts.length >= 4) {
        statuses.set(`${parts[0]}::${parts[1]}::${parts[2]}`, parts[3]);
      }
    }
    if (inTable && line.startsWith("##") && !line.includes("Strategy") && !line.includes("Results")) inTable = false;
  }
  return statuses;
}

// ── Classification ──

function classifySignal(
  admissionStatus: string,
  signal: Signal,
  instId: string,
  policy: ReturnType<typeof loadRiskPolicy>
): { actionCategory: ActionCategory; blockedReason: string; proposalId: string } {
  if (!admissionStatus || admissionStatus === "REJECTED" || admissionStatus === "UNKNOWN") {
    return {
      actionCategory: "BLOCKED",
      blockedReason: `Strategy status is ${admissionStatus || "UNKNOWN"} — all signals blocked.`,
      proposalId: "",
    };
  }

  if (admissionStatus === "RESEARCH_ONLY") {
    return {
      actionCategory: "OBSERVATION_ONLY",
      blockedReason: "",
      proposalId: "",
    };
  }

  if (admissionStatus === "ADMITTED_TO_DEMO") {
    const intent = {
      ts: signal.ts, instId,
      side: signal.action === "BUY" ? "buy" as const : "sell" as const,
      sz: "0.0001", px: "0", ordType: "limit" as const,
      notionalUSDT: 5, strategyName: signal.reason, signalReason: signal.reason,
    };
    const gr = guardOrderIntent(intent, policy, { tradeCount: 0, dailyLossUSDT: 0 });
    if (!gr.approved && !gr.pendingApproval) {
      return {
        actionCategory: "BLOCKED",
        blockedReason: `Risk guard: ${gr.rejectedReason}`,
        proposalId: "",
      };
    }
    return {
      actionCategory: "PROPOSAL_DRY_RUN",
      blockedReason: "",
      proposalId: `proposal_${Date.now()}_${randomBytes(3).toString("hex")}`,
    };
  }

  return {
    actionCategory: "BLOCKED",
    blockedReason: `Unknown admission status: ${admissionStatus}`,
    proposalId: "",
  };
}

// ── Market ──

async function getMarketSnapshot(instId: string): Promise<{ price: string; high24h: string; low24h: string; vol24h: string }> {
  const r = await okxJson(["market", "ticker", instId]);
  if (!r.ok || !Array.isArray(r.data)) return { price: "N/A", high24h: "N/A", low24h: "N/A", vol24h: "N/A" };
  const d = (r.data as Record<string, string>[])[0];
  return { price: d?.last ?? "N/A", high24h: d?.high24h ?? "N/A", low24h: d?.low24h ?? "N/A", vol24h: d?.vol24h ?? "N/A" };
}

function computeRegime(candles: NormalizedCandle[]): string {
  if (candles.length < 20) return "insufficient_data";
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  const pct = ((last - first) / first) * 100;
  if (pct > 3) return "strong_uptrend";
  if (pct > 1) return "uptrend";
  if (pct < -3) return "strong_downtrend";
  if (pct < -1) return "downtrend";
  return "ranging";
}

// ── Report Generation ──

function generateReport(
  config: RunnerConfig,
  allEntries: SignalJournalEntry[],
  summaries: StrategySummary[],
  instrumentSummaries: InstrumentSummary[],
  snapshots: Record<string, { price: string; high24h: string; low24h: string; vol24h: string }>,
  regimes: Record<string, string>,
  ledger: PositionLedger,
  pnlTracker: PnLTracker,
  runId: string,
): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const pnlStats = pnlTracker.getStats();
  const blocked = allEntries.filter(e => e.actionCategory === "BLOCKED").length;
  const observed = allEntries.filter(e => e.actionCategory === "OBSERVATION_ONLY").length;
  const proposals = allEntries.filter(e => e.actionCategory === "PROPOSAL_DRY_RUN").length;
  const noSignals = allEntries.filter(e => e.actionCategory === "NO_SIGNAL").length;

  const lines: string[] = [
    "# Demo Strategy Runner Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Run ID: ${runId}`,
    "",
    "## Summary",
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| Total raw signals | ${allEntries.filter(e => e.actionCategory !== "NO_SIGNAL").length} |`,
    `| Displayed in report | ${Math.min(allEntries.length, config.signalProcessing.maxDisplayedSignalsPerStrategy * summaries.length)} |`,
    `| Strategies evaluated | ${summaries.length} |`,
    `| Instruments evaluated | ${instrumentSummaries.length} |`,
    `| Timeframes evaluated | 1H |`,
    `| BLOCKED signals | ${blocked} |`,
    `| OBSERVATION_ONLY signals | ${observed} |`,
    `| PROPOSAL_DRY_RUN signals | ${proposals} |`,
    `| NO_SIGNAL entries | ${noSignals} |`,
    `| Executed orders | 0 |`,
    "",
    "## Strategy Summary",
    "",
  ];

  // Strategy summaries
  for (const s of summaries) {
    lines.push(`### ${s.strategyName}`);
    lines.push(`- **Admission status:** ${s.admissionStatus}`);
    lines.push(`- **Raw signal count:** ${s.rawSignalCount}`);
    lines.push(`- **Displayed:** ${s.displayedSignalCount}`);
    lines.push(`- **Actions:** BLOCKED=${s.actionCategories["BLOCKED"] || 0}, OBSERVE=${s.actionCategories["OBSERVATION_ONLY"] || 0}, PROPOSAL=${s.actionCategories["PROPOSAL_DRY_RUN"] || 0}, NO_SIGNAL=${s.actionCategories["NO_SIGNAL"] || 0}`);
    if (s.blockedReasons.length > 0) {
      lines.push(`- **Blocked reasons:** ${s.blockedReasons.join("; ")}`);
    }
    lines.push(`- **Recommendation:** ${s.recommendation}`);
    lines.push("");
  }

  // Instrument summaries
  lines.push("## Instrument Summary");
  lines.push("");
  for (const inst of instrumentSummaries) {
    lines.push(`### ${inst.instId}`);
    lines.push(`- Signal count: ${inst.signalCount}`);
    for (const [strategy, count] of Object.entries(inst.strategyDistribution)) {
      lines.push(`  - ${strategy}: ${count}`);
    }
    lines.push("");
  }

  // Market snapshot
  lines.push("## Market Snapshot");
  lines.push("");
  for (const [instId, snap] of Object.entries(snapshots)) {
    lines.push(`### ${instId}`);
    lines.push(`- Price: $${snap.price}`);
    lines.push(`- 24H High: $${snap.high24h} / Low: $${snap.low24h}`);
    lines.push(`- Volume: ${snap.vol24h}`);
    lines.push(`- Regime: ${regimes[instId] ?? "N/A"}`);
    lines.push("");
  }

  // Signal samples (capped per strategy)
  lines.push("## Signal Samples");
  lines.push("");

  const displayedCap = config.signalProcessing.maxDisplayedSignalsPerStrategy;
  const entriesByStrategy = new Map<string, SignalJournalEntry[]>();
  for (const e of allEntries) {
    if (e.actionCategory === "NO_SIGNAL") continue;
    const key = `${e.strategyName}::${e.instId}`;
    if (!entriesByStrategy.has(key)) entriesByStrategy.set(key, []);
    entriesByStrategy.get(key)!.push(e);
  }

  for (const [key, entries] of entriesByStrategy) {
    const [strategy, instId] = key.split("::");
    const display = entries.slice(0, displayedCap);
    lines.push(`### ${strategy} — ${instId} (showing ${display.length}/${entries.length})`);
    lines.push("");
    lines.push("| # | Signal | Confidence | Admission | Action | Reason |");
    lines.push("|---|--------|------------|-----------|--------|--------|");
    for (let i = 0; i < display.length; i++) {
      const e = display[i];
      lines.push(`| ${i + 1} | ${e.signal} | ${e.confidence.toFixed(2)} | ${e.admissionStatus} | ${e.actionCategory} | ${e.reason.slice(0, 50)} |`);
    }
    lines.push("");
  }

  // Risk decisions
  lines.push("## Risk Decisions");
  lines.push("");

  // Deduplicate blocked reasons
  const blockedReasons = new Set<string>();
  for (const e of allEntries) {
    if (e.actionCategory === "BLOCKED" && e.blockedReason) {
      blockedReasons.add(e.blockedReason);
    }
  }
  for (const r of blockedReasons) {
    lines.push(`- [BLOCKED] ${r}`);
  }
  lines.push(`- [OBSERVATION] ${observed} signals logged for research`);
  lines.push(`- [PROPOSAL] ${proposals} proposals generated (dry-run only)`);
  lines.push("");

  // Paper portfolio
  lines.push("## Paper Portfolio");
  lines.push("");
  const positions = ledger.getAll();
  if (positions.length === 0) {
    lines.push("No paper positions held.");
  } else {
    for (const p of positions) {
      lines.push(`- ${p.instId}: qty=${p.qty}, avgEntry=$${p.avgEntryPrice.toFixed(2)}, realizedPnL=$${p.realizedPnlUSDT.toFixed(2)}`);
    }
  }
  lines.push(`- Daily PnL: realized=$${pnlStats.dailyRealizedPnlUSDT.toFixed(2)}, unrealized=$${pnlStats.dailyUnrealizedPnlUSDT.toFixed(2)}`);
  lines.push(`- Trade count today: ${pnlStats.tradeCountToday}`);
  lines.push(`- Loss limit: ${pnlStats.lossLimitHit ? "HIT" : "OK"}`);
  lines.push("");

  // Audit
  lines.push("## Audit");
  lines.push("");
  lines.push(`- Signal journal: data/signals/signal_journal.jsonl`);
  lines.push(`- Audit log: logs/audit_${date}.jsonl`);
  lines.push(`- Run ID: ${runId}`);
  lines.push("");

  // Safety state
  lines.push("## Safety State");
  lines.push("");
  lines.push("| Gate | Status |");
  lines.push("|------|--------|");
  lines.push("| Live trading | DISABLED |");
  lines.push("| Demo execution | DISABLED |");
  lines.push("| Market order | BLOCKED |");
  lines.push("| Derivatives (SWAP/FUTURES/OPTION) | BLOCKED |");
  lines.push("| Executed orders | 0 |");
  lines.push("| Strategies admitted | 0 |");

  return lines.join("\n");
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--execute-demo")) {
    console.log("FATAL: --execute-demo is not supported in observation mode.");
    console.log("To execute a demo order, use: npm run demo:roundtrip -- --execute-demo EXECUTE_DEMO_ORDER");
    audit.logSystem("runner_refused_execute_flag", { args });
    process.exit(1);
  }

  const runId = `run_${Date.now()}_${randomBytes(4).toString("hex")}`;
  console.log("╔══════════════════════════════════════╗");
  console.log("║  Demo Strategy Runner v3.1           ║");
  console.log("║  OBSERVATION MODE — No Execution     ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`  Run ID: ${runId}\n`);

  const config = loadRunnerConfig();

  if (config.liveTradingEnabled) {
    console.log("FATAL: liveTradingEnabled is true.");
    audit.logSystem("runner_refused_live", { config });
    return;
  }

  if (config.executeDemoByDefault) {
    console.log("FATAL: executeDemoByDefault is true.");
    audit.logSystem("runner_refused_execute_default", { config });
    return;
  }

  console.log(`Config: mode=${config.mode}, profile=${config.profile}`);
  console.log(`Record all signals: ${config.signalProcessing.recordAllSignals}`);
  console.log(`Max displayed per strategy: ${config.signalProcessing.maxDisplayedSignalsPerStrategy}`);
  console.log(`Max proposals: ${config.signalProcessing.maxDryRunProposalsPerRun}`);
  console.log(`Max executable orders: ${config.signalProcessing.maxExecutableOrdersPerRun} (fixed at 0)\n`);

  // ── Step 1: Market Data ──
  console.log("── Step 1: Market Data ──");
  const instIds = config.allowedInstruments;
  const timeframes = ["1H"];
  const snapshots: Record<string, { price: string; high24h: string; low24h: string; vol24h: string }> = {};
  const regimes: Record<string, string> = {};
  const candlesCache: Record<string, NormalizedCandle[]> = {};

  for (const instId of instIds) {
    snapshots[instId] = await getMarketSnapshot(instId);
    console.log(`  ${instId}: $${snapshots[instId].price}`);

    for (const tf of timeframes) {
      const candles = await fetchPaginated(instId, tf, 500);
      candlesCache[`${instId}::${tf}`] = candles;
      regimes[`${instId}::${tf}`] = computeRegime(candles);
      console.log(`  ${instId}/${tf}: ${candles.length} candles, regime=${regimes[`${instId}::${tf}`]}`);
    }
  }

  // ── Step 2: Portfolio State ──
  console.log("\n── Step 2: Portfolio State ──");
  const ledger = new PositionLedger();
  const pnlTracker = new PnLTracker(ledger, 0);
  console.log(`  Paper positions: ${ledger.getAll().length}`);
  console.log(`  Daily PnL: $${pnlTracker.getStats().dailyRealizedPnlUSDT.toFixed(2)}`);

  // ── Step 3: Run ALL strategies, record ALL signals ──
  console.log("\n── Step 3: Strategy Signals (recording ALL) ──");
  const policy = loadRiskPolicy();
  const admissionStatuses = loadAdmissionStatuses();
  console.log(`  Admission entries loaded: ${admissionStatuses.size}\n`);

  interface StrategyDef { name: string; version: string; strategy: Strategy; }
  const strategyDefs: StrategyDef[] = [
    { name: "MA Crossover", version: "1.0.0", strategy: new MaCrossStrategy() },
    { name: "RSI Mean Reversion", version: "1.0.0", strategy: new RsiReversionStrategy() },
    { name: "Volatility Breakout", version: "1.0.0", strategy: new VolatilityBreakoutStrategy() },
  ];

  const allEntries: SignalJournalEntry[] = [];
  const proposals: SignalJournalEntry[] = [];
  const maxProposals = config.signalProcessing.maxDryRunProposalsPerRun;

  for (const instId of instIds) {
    const currentPrice = snapshots[instId]?.price ?? "0";

    for (const tf of timeframes) {
      const candles = candlesCache[`${instId}::${tf}`] || [];
      const regime = regimes[`${instId}::${tf}`] ?? "unknown";

      for (const sdef of strategyDefs) {
        const signals = sdef.strategy.generate(candles, instId);
        const nonHold = signals.filter(sig => sig.action !== "HOLD");
        const admissionKey = `${sdef.name}::${instId}::${tf}`;
        const admissionStatus = admissionStatuses.get(admissionKey) ?? "UNKNOWN";

        if (nonHold.length === 0) {
          const noSignalEntry: SignalJournalEntry = {
            runId, timestamp: new Date().toISOString(),
            strategyName: sdef.name, strategyVersion: sdef.version,
            instId, timeframe: tf,
            signal: "NO_SIGNAL", confidence: 0,
            reason: "Strategy produced no signal in this run",
            admissionStatus, actionCategory: "NO_SIGNAL",
            blockedReason: "", priceAtSignal: currentPrice,
            marketRegime: regime, proposalId: "",
            auditLogPath: `logs/audit_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.jsonl`,
          };
          allEntries.push(noSignalEntry);
          console.log(`  ${sdef.name}/${instId}/${tf}: NO_SIGNAL (${admissionStatus})`);
          continue;
        }

        for (const signal of nonHold) {
          const classification = classifySignal(admissionStatus, signal, instId, policy);

          if (classification.actionCategory === "PROPOSAL_DRY_RUN" && proposals.length >= maxProposals) {
            // Downgrade to observation if proposal cap hit
            classification.actionCategory = "OBSERVATION_ONLY";
            classification.blockedReason = `Proposal cap (${maxProposals}) reached — downgraded to observation.`;
            classification.proposalId = "";
          }

          const entry: SignalJournalEntry = {
            runId, timestamp: new Date().toISOString(),
            strategyName: sdef.name, strategyVersion: sdef.version,
            instId, timeframe: tf,
            signal: signal.action, confidence: signal.confidence,
            reason: signal.reason,
            admissionStatus, actionCategory: classification.actionCategory,
            blockedReason: classification.blockedReason,
            priceAtSignal: currentPrice,
            marketRegime: regime,
            proposalId: classification.proposalId,
            auditLogPath: `logs/audit_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.jsonl`,
          };

          allEntries.push(entry);
          if (classification.actionCategory === "PROPOSAL_DRY_RUN") {
            proposals.push(entry);
          }

          const prefix = classification.actionCategory === "BLOCKED" ? "[BLOCKED]"
            : classification.actionCategory === "OBSERVATION_ONLY" ? "[OBSERVE]"
            : "[PROPOSAL]";
          console.log(`  ${prefix} ${sdef.name}/${instId}/${tf} | ${signal.action} | ${admissionStatus}`);
        }
      }
    }
  }

  // ── Step 4: Build summaries ──
  console.log("\n── Step 4: Strategy Summaries ──");
  const summaries: StrategySummary[] = [];
  const instrumentSummaries: InstrumentSummary[] = [];

  for (const sdef of strategyDefs) {
    const strategyEntries = allEntries.filter(e => e.strategyName === sdef.name);
    const admissionStatus = strategyEntries[0]?.admissionStatus ?? "UNKNOWN";
    const nonNoSignal = strategyEntries.filter(e => e.actionCategory !== "NO_SIGNAL");
    const actionCategories: Record<string, number> = { BLOCKED: 0, OBSERVATION_ONLY: 0, PROPOSAL_DRY_RUN: 0, NO_SIGNAL: 0 };
    for (const e of strategyEntries) actionCategories[e.actionCategory] = (actionCategories[e.actionCategory] || 0) + 1;

    const blockedReasons = [...new Set(strategyEntries.filter(e => e.blockedReason).map(e => e.blockedReason))];
    const recommendation = admissionStatus === "REJECTED" ? "Do not use — all signals blocked"
      : admissionStatus === "RESEARCH_ONLY" ? "Observe only — gather more data"
      : admissionStatus === "ADMITTED_TO_DEMO" ? "Ready for dry-run proposal"
      : "Unevaluated";

    summaries.push({
      strategyName: sdef.name,
      admissionStatus,
      rawSignalCount: nonNoSignal.length,
      displayedSignalCount: Math.min(nonNoSignal.length, config.signalProcessing.maxDisplayedSignalsPerStrategy),
      actionCategories,
      blockedReasons,
      recommendation,
    });

    console.log(`  ${sdef.name}: ${nonNoSignal.length} signals, ${actionCategories["NO_SIGNAL"] || 0} NO_SIGNAL, status=${admissionStatus}`);
  }

  for (const instId of instIds) {
    const instEntries = allEntries.filter(e => e.instId === instId);
    const strategyDist: Record<string, number> = {};
    const riskDecisions: Record<string, number> = {};
    for (const e of instEntries) {
      strategyDist[e.strategyName] = (strategyDist[e.strategyName] || 0) + 1;
      riskDecisions[e.actionCategory] = (riskDecisions[e.actionCategory] || 0) + 1;
    }
    instrumentSummaries.push({
      instId,
      signalCount: instEntries.filter(e => e.actionCategory !== "NO_SIGNAL").length,
      strategyDistribution: strategyDist,
      riskDecisions,
    });
  }

  // ── Step 5: Write Signal Journal (ALL entries) ──
  console.log("\n── Step 5: Signal Journal ──");
  if (!existsSync(SIGNAL_JOURNAL_DIR)) mkdirSync(SIGNAL_JOURNAL_DIR, { recursive: true });
  const journalPath = join(SIGNAL_JOURNAL_DIR, "signal_journal.jsonl");
  for (const entry of allEntries) {
    appendFileSync(journalPath, JSON.stringify(entry) + "\n");
  }
  console.log(`  Written: ${allEntries.length} entries (complete, no truncation)`);

  // ── Step 6: Audit ──
  console.log("\n── Step 6: Audit Log ──");
  for (const entry of allEntries) {
    audit.log({
      timestamp: entry.timestamp,
      action: "runner_signal_v31",
      input: { runId, strategyName: entry.strategyName, instId: entry.instId, timeframe: entry.timeframe, signal: entry.signal },
      riskDecision: `${entry.actionCategory}: ${entry.blockedReason || entry.reason || "none"}`,
    });
  }
  console.log(`  Audit entries: ${allEntries.length}`);

  // ── Step 7: Report ──
  console.log("\n── Step 7: Observation Report ──");
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  const report = generateReport(config, allEntries, summaries, instrumentSummaries, snapshots, regimes, ledger, pnlTracker, runId);
  const reportPath = join(REPORTS_DIR, `demo_strategy_runner_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.md`);
  writeFileSync(reportPath, report);
  console.log(`  Report: ${reportPath}`);

  // ── Final summary ──
  const blockedCount = allEntries.filter(e => e.actionCategory === "BLOCKED").length;
  const observedCount = allEntries.filter(e => e.actionCategory === "OBSERVATION_ONLY").length;
  const proposalCount = allEntries.filter(e => e.actionCategory === "PROPOSAL_DRY_RUN").length;
  const noSignalCount = allEntries.filter(e => e.actionCategory === "NO_SIGNAL").length;

  console.log("\n═══════════════════════════════════════");
  console.log("  Runner v3.1 Complete");
  console.log(`  Journal entries: ${allEntries.length}`);
  console.log(`  BLOCKED: ${blockedCount} | OBSERVE: ${observedCount} | PROPOSAL: ${proposalCount} | NO_SIGNAL: ${noSignalCount}`);
  console.log(`  Strategies evaluated: ${summaries.length}`);
  console.log(`  Orders executed: 0`);
  console.log("═══════════════════════════════════════");

  audit.logSystem("runner_v31_complete", {
    runId, totalEntries: allEntries.length,
    blocked: blockedCount, observed: observedCount,
    proposals: proposalCount, noSignals: noSignalCount,
    strategiesEvaluated: summaries.length,
    ordersExecuted: 0,
  });
}

main().catch((err) => {
  console.error("Runner crashed:", err.message);
  audit.logSystem("runner_error", {}, null, err.message);
  process.exit(1);
});
