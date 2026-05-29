import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

const DEFAULT_LEDGER_DIR = join(import.meta.dirname, "..", "..", "data", "portfolio");
const DEFAULT_LEDGER_PATH = join(DEFAULT_LEDGER_DIR, "positions.json");

export interface Position {
  instId: string;
  baseCurrency: string;
  quoteCurrency: string;
  qty: number;
  avgEntryPrice: number;
  realizedPnlUSDT: number;
  updatedAt: string;
  source: "demo" | "live";
}

export interface FillRecord {
  instId: string;
  side: "buy" | "sell";
  fillSz: number;
  fillPx: number;
  fee: number;
  feeCcy: string;
  ts: number;
}

export class PositionLedger {
  private positions: Map<string, Position> = new Map();
  private ledgerPath: string;

  constructor(ledgerPath: string = DEFAULT_LEDGER_PATH) {
    this.ledgerPath = ledgerPath;

    const ledgerDir = dirname(this.ledgerPath);
    if (!existsSync(ledgerDir)) {
      mkdirSync(ledgerDir, { recursive: true });
    }
    this.load();
  }

  private load(): void {
    if (!existsSync(this.ledgerPath)) {
      this.save();
      return;
    }
    try {
      const raw = JSON.parse(readFileSync(this.ledgerPath, "utf-8")) as Position[];
      for (const p of raw) {
        this.positions.set(p.instId, p);
      }
    } catch {
      this.positions.clear();
    }
  }

  private save(): void {
    const arr = Array.from(this.positions.values());
    writeFileSync(this.ledgerPath, JSON.stringify(arr, null, 2), "utf-8");
  }

  get(instId: string): Position | undefined {
    return this.positions.get(instId);
  }

  getAll(): Position[] {
    return Array.from(this.positions.values());
  }

  applyFill(fill: FillRecord, currentPrice: number): void {
    let pos = this.positions.get(fill.instId);
    if (!pos) {
      const [base, quote] = fill.instId.split("-");
      pos = {
        instId: fill.instId,
        baseCurrency: base,
        quoteCurrency: quote,
        qty: 0,
        avgEntryPrice: 0,
        realizedPnlUSDT: 0,
        updatedAt: new Date().toISOString(),
        source: "demo",
      };
    }

    if (fill.side === "buy") {
      const totalCost = pos.qty * pos.avgEntryPrice + fill.fillSz * fill.fillPx;
      pos.qty += fill.fillSz;
      pos.avgEntryPrice = pos.qty > 0 ? totalCost / pos.qty : 0;
    } else {
      if (pos.qty > 0) {
        const realizedPnl = (fill.fillPx - pos.avgEntryPrice) * Math.min(fill.fillSz, pos.qty);
        pos.realizedPnlUSDT += realizedPnl - fill.fee;
      }
      pos.qty -= fill.fillSz;
      if (pos.qty <= 0) {
        pos.qty = 0;
        pos.avgEntryPrice = 0;
      }
    }

    pos.updatedAt = new Date().toISOString();
    this.positions.set(fill.instId, pos);
    this.save();
  }

  rebuildFromFills(fills: FillRecord[], currentPrices: Record<string, number>): void {
    this.positions.clear();
    for (const fill of fills) {
      this.applyFill(fill, currentPrices[fill.instId] ?? 0);
    }
  }

  getUnrealizedPnl(instId: string, currentPrice: number): number {
    const pos = this.positions.get(instId);
    if (!pos || pos.qty <= 0) return 0;
    return (currentPrice - pos.avgEntryPrice) * pos.qty;
  }

  getTotalUnrealizedPnl(currentPrices: Record<string, number>): number {
    let total = 0;
    for (const [instId, pos] of this.positions) {
      total += this.getUnrealizedPnl(instId, currentPrices[instId] ?? 0);
    }
    return total;
  }

  getTotalRealizedPnl(): number {
    let total = 0;
    for (const pos of this.positions.values()) {
      total += pos.realizedPnlUSDT;
    }
    return total;
  }
}
