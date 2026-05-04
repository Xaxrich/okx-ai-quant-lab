#!/usr/bin/env bash
set -euo pipefail

echo "=== Running Backtest ==="

cd "$(dirname "$0")/.."
npx tsx src/backtest/run.ts

echo ""
echo "=== Backtest Complete ==="
echo "Report: reports/backtest_report.md"
