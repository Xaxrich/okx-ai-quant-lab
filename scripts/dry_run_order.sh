#!/usr/bin/env bash
set -euo pipefail

echo "=== Dry Run Order Intent ==="
echo ""

cd "$(dirname "$0")/.."
npx tsx src/execution/dry_run.ts

echo ""
echo "=== Dry Run Complete ==="
echo "Check logs/ for audit trail."
