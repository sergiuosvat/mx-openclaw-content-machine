#!/bin/bash
set -e

# ============================================
# mx-openclaw-template-solution: Test Setup
# ============================================
# Prepares chain simulator tests by ensuring:
# 1. WASM artifacts are available
# 2. PEM wallet files exist
# 3. Cargo test crate compiles
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TESTS_DIR="$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

echo "============================================"
echo " mx-openclaw-template-solution — Test Setup"
echo "============================================"
echo ""

# ── 1. Check chain simulator binary ──
echo "▶ Checking chain simulator..."
AGENTIC_TESTS_DIR="$ROOT_DIR/../mx-agentic-commerce-tests"
if [ -x "$AGENTIC_TESTS_DIR/mx-chain-simulator-go" ]; then
    # Symlink from existing tests
    ln -sf "$AGENTIC_TESTS_DIR/mx-chain-simulator-go" "$TESTS_DIR/mx-chain-simulator-go" 2>/dev/null || true
    ok "Chain simulator linked from mx-agentic-commerce-tests"
elif command -v sc-meta >/dev/null 2>&1; then
    warn "No local chain simulator binary. Use: sc-meta cs start"
else
    warn "Install chain simulator: build from mx-chain-simulator-go or use sc-meta cs"
fi

# ── 2. WASM artifacts ──
echo ""
echo "▶ Checking WASM artifacts..."
mkdir -p "$TESTS_DIR/artifacts"

MX8004_DIR="$ROOT_DIR/../mx-8004"
for contract in identity-registry validation-registry reputation-registry; do
    WASM_DST="$TESTS_DIR/artifacts/$contract.wasm"
    if [ -f "$WASM_DST" ]; then
        ok "$contract.wasm present"
    elif [ -f "$AGENTIC_TESTS_DIR/artifacts/$contract.wasm" ]; then
        cp "$AGENTIC_TESTS_DIR/artifacts/$contract.wasm" "$WASM_DST"
        ok "$contract.wasm copied from mx-agentic-commerce-tests"
    elif [ -f "$MX8004_DIR/$contract/output/$contract.wasm" ]; then
        cp "$MX8004_DIR/$contract/output/$contract.wasm" "$WASM_DST"
        ok "$contract.wasm copied from mx-8004"
    else
        warn "$contract.wasm not found — build with: cd $MX8004_DIR && sc-meta all build"
    fi
done

# ── 3. PEM files ──
echo ""
echo "▶ Checking PEM wallet files..."
if [ -f "$AGENTIC_TESTS_DIR/alice.pem" ]; then
    cp "$AGENTIC_TESTS_DIR/alice.pem" "$TESTS_DIR/alice.pem" 2>/dev/null || true
    cp "$AGENTIC_TESTS_DIR/bob.pem" "$TESTS_DIR/bob.pem" 2>/dev/null || true
    ok "PEM files copied from mx-agentic-commerce-tests"
elif [ -f "$TESTS_DIR/alice.pem" ]; then
    ok "PEM files already present"
else
    warn "No PEM files found. Generate with: npm run generate-wallet"
fi

# ── 4. Build test crate ──
echo ""
echo "▶ Building Rust test crate..."
(cd "$TESTS_DIR" && cargo check --tests 2>&1 | tail -3) && ok "Test crate compiles" || warn "Test crate has compilation issues"

echo ""
echo "============================================"
echo "  Test Setup Complete!"
echo "============================================"
echo ""
echo "Run chain simulator tests:"
echo "  1. Start simulator: sc-meta cs start"
echo "  2. Start backend:   npm run dev (in another terminal)"
echo "  3. Run tests:       cd tests && cargo test -- --nocapture"
echo ""
echo "Run a specific test:"
echo "  cargo test --test e2e_agent_lifecycle -- --nocapture"
echo ""
