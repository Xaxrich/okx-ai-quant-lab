#!/usr/bin/env bash
set -euo pipefail

echo "=== Fetching Market Data ==="
echo "Instruments: ${DEFAULT_INST_IDS:-BTC-USDT,ETH-USDT}"
echo "Bars: ${DEFAULT_BARS:-1H,4H,1D}"
echo ""

cd "$(dirname "$0")/.."
npx tsx src/data/fetch_candles.ts

echo ""
echo "=== Fetch Complete ==="
echo "Raw data: data/raw/"
echo "Processed data: data/processed/"
