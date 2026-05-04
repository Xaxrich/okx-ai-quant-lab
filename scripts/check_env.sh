#!/usr/bin/env bash
set -euo pipefail

echo "=== OKX AI Quant Lab - Environment Check ==="
echo ""

echo "Node.js:"
node --version || echo "  NOT FOUND - install Node.js >= 18"

echo ""
echo "npm:"
npm --version || echo "  NOT FOUND"

echo ""
echo "OKX CLI:"
if command -v okx &> /dev/null; then
  okx --version || echo "  Found but version check failed"
else
  echo "  NOT FOUND - install with: npm install -g @okx_ai/okx-trade-cli"
fi

echo ""
echo "OKX Config:"
if [ -f "$HOME/.okx/config.toml" ]; then
  echo "  Found at ~/.okx/config.toml"
else
  echo "  NOT FOUND - create ~/.okx/config.toml with demo profile credentials"
fi

echo ""
echo "OKX Market Data (read-only test):"
if command -v okx &> /dev/null; then
  okx market ticker BTC-USDT --json 2>&1 | head -5 || echo "  FAILED - check OKX CLI configuration"
else
  echo "  SKIPPED - OKX CLI not installed"
fi

echo ""
echo "Project Dependencies:"
cd "$(dirname "$0")/.."
npm ls --depth=0 2>/dev/null || echo "  Run: npm install"

echo ""
echo "=== Check Complete ==="
