#!/usr/bin/env bash
set -euo pipefail

echo "=== Running Walk-Forward Validation ==="

cd "$(dirname "$0")/.."
npx tsx src/backtest/walk_forward.ts

echo ""
echo "=== Walk-Forward Complete ==="
echo "Report: reports/walk_forward_report.md"
