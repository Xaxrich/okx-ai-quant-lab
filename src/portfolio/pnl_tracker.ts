import { PositionLedger } from "./position_ledger.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const TRACKER_DIR = join(import.meta.dirname, "..", "..", "data", "portfolio");
const DAILY_STATS_PATH = join(TRACKER_DIR, "daily_stats.json");

export interface DailyPnLStats {
  date: string;
  dailyRealizedPnlUSDT: number;
  dailyUnrealizedPnlUSDT: number;
  totalEquityEstimate: number;
  maxDrawdownFromLedger: number;
  tradeCountToday: number;
  lossLimitHit: boolean;
  startingEquity: number;
}

export class PnLTracker {
  ledger: PositionLedger;
  private stats: DailyPnLStats;
  private peakEquity: number;

  constructor(ledger: PositionLedger, startingEquity: number = 0) {
    this.ledger = ledger;
    this.peakEquity = startingEquity;

    if (!existsSync(TRACKER_DIR)) {
      mkdirSync(TRACKER_DIR, { recursive: true });
    }

    const today = new Date().toISOString().slice(0, 10);
    const loaded = this.loadStats(today);

    if (loaded && loaded.date === today) {
      this.stats = loaded;
      if (loaded.totalEquityEstimate > this.peakEquity) {
        this.peakEquity = loaded.totalEquityEstimate;
      }
    } else {
      this.stats = {
        date: today,
        dailyRealizedPnlUSDT: 0,
        dailyUnrealizedPnlUSDT: 0,
        totalEquityEstimate: startingEquity,
        maxDrawdownFromLedger: 0,
        tradeCountToday: 0,
        lossLimitHit: false,
        startingEquity,
      };
    }
  }

  private loadStats(today: string): DailyPnLStats | null {
    if (!existsSync(DAILY_STATS_PATH)) return null;
    try {
      const raw = JSON.parse(readFileSync(DAILY_STATS_PATH, "utf-8")) as DailyPnLStats;
      return raw;
    } catch {
      return null;
    }
  }

  private saveStats(): void {
    writeFileSync(DAILY_STATS_PATH, JSON.stringify(this.stats, null, 2));
  }

  update(currentPrices: Record<string, number>): void {
    const totalRealized = this.ledger.getTotalRealizedPnl();
    const totalUnrealized = this.ledger.getTotalUnrealizedPnl(currentPrices);

    this.stats.dailyRealizedPnlUSDT = totalRealized;
    this.stats.dailyUnrealizedPnlUSDT = totalUnrealized;
    this.stats.totalEquityEstimate = this.stats.startingEquity + totalRealized + totalUnrealized;

    if (this.stats.totalEquityEstimate > this.peakEquity) {
      this.peakEquity = this.stats.totalEquityEstimate;
    }

    const dd = this.peakEquity > 0
      ? (this.peakEquity - this.stats.totalEquityEstimate) / this.peakEquity
      : 0;
    this.stats.maxDrawdownFromLedger = Math.max(this.stats.maxDrawdownFromLedger, dd);

    this.saveStats();
  }

  recordTrade(): void {
    this.stats.tradeCountToday++;
    this.saveStats();
  }

  checkLossLimit(maxDailyLossUSDT: number): boolean {
    const unrealizedLoss = this.stats.dailyUnrealizedPnlUSDT < 0
      ? Math.abs(this.stats.dailyUnrealizedPnlUSDT)
      : 0;
    const totalLoss = Math.abs(Math.min(0, this.stats.dailyRealizedPnlUSDT)) + unrealizedLoss;

    if (totalLoss >= maxDailyLossUSDT) {
      this.stats.lossLimitHit = true;
      this.saveStats();
      return true;
    }
    return false;
  }

  getStats(): DailyPnLStats {
    return { ...this.stats };
  }

  getCashPosition(currentPrices: Record<string, number>): number {
    return this.stats.startingEquity +
      this.ledger.getTotalRealizedPnl() +
      this.ledger.getTotalUnrealizedPnl(currentPrices);
  }

  isLossLimitHit(): boolean {
    return this.stats.lossLimitHit;
  }
}
