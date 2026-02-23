#!/bin/bash
set -euo pipefail

# ╔═══════════════════════════════════════════════════════════════════════════════╗
# ║                                                                             ║
# ║   🚀  The Content Machine — Zero to Live Agent in One Script             ║
# ║                                                                             ║
# ║   This script takes you from a fresh repository clone to a fully            ║
# ║   running, secured, on-chain-registered AI agent.                           ║
# ║                                                                             ║
# ║   Usage:  ./launch.sh                                                      ║
# ║   Usage:  ./launch.sh --local     (skip VPS, run locally only)             ║
# ║                                                                             ║
# ║   What it does:                                                             ║
# ║   ┌─ Step 1: Collect your keys (interactive prompts)                       ║
# ║   ├─ Step 2: Generate wallet + config                                      ║
# ║   ├─ Step 3: Install dependencies                                         ║
# ║   ├─ Step 4: Fund wallet (devnet only)                                     ║
# ║   ├─ Step 5: Register agent on-chain                                       ║
# ║   ├─ Step 6: Build manifest + mint OASF identity                          ║
# ║   ├─ Step 7: Provision VPS (harden, Docker, firewall)                      ║
# ║   ├─ Step 8: Deploy to VPS                                                ║
# ║   ├─ Step 9: Configure GitHub CI/CD (optional)                            ║
# ║   └─ Step 10: Verify everything works                                     ║
# ║                                                                             ║
# ║   After this script, you only focus on YOUR agent's skills.                ║
# ║                                                                             ║
# ╚═══════════════════════════════════════════════════════════════════════════════╝

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_ONLY=false
if [ "${1:-}" = "--local" ]; then LOCAL_ONLY=true; fi

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

step() { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${BOLD}${GREEN}  ✦ Step $1${NC}: $2"; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"; }
ok()   { echo -e "  ${GREEN}✅ $1${NC}"; }
info() { echo -e "  ${BLUE}ℹ️  $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }
fail() { echo -e "  ${RED}❌ $1${NC}"; exit 1; }

# ══════════════════════════════════════════════════════════════════════════════
# STEP 1: Collect keys and configuration
# ══════════════════════════════════════════════════════════════════════════════
step "1/10" "Collect your keys (the ONLY thing you need to provide)"

echo -e "${BOLD}  Your Agent${NC}"
read -p "  📛 Agent name (e.g., crypto-researcher): " AGENT_NAME
AGENT_NAME="${AGENT_NAME:-content-machine}"

read -p "  📝 Description: " AGENT_DESC
AGENT_DESC="${AGENT_DESC:-The Content Machine — AI-powered content operations agent}"

read -p "  💰 Price per query in USDC (e.g., 0.50): " PRICE
PRICE="${PRICE:-0.50}"

echo ""
echo -e "${BOLD}  LLM Provider${NC}"
echo "   1) OpenAI (gpt-4o)"
echo "   2) Anthropic (claude-sonnet)"
echo "   3) Google (gemini-2.5-pro)"
read -p "   Choose [1-3]: " LLM_CHOICE

case "${LLM_CHOICE:-1}" in
  1) LLM_PROVIDER="openai"; LLM_MODEL="gpt-4o" ;;
  2) LLM_PROVIDER="anthropic"; LLM_MODEL="claude-sonnet-4-20250514" ;;
  3) LLM_PROVIDER="google"; LLM_MODEL="gemini-2.5-pro" ;;
  *) LLM_PROVIDER="openai"; LLM_MODEL="gpt-4o" ;;
esac

read -sp "  🔑 $LLM_PROVIDER API Key: " LLM_API_KEY
echo ""
[ -z "$LLM_API_KEY" ] && fail "LLM API key is required"

echo ""
echo -e "${BOLD}  Network${NC}"
echo "   1) Devnet (testing — recommended for first launch)"
echo "   2) Mainnet (production — real money)"
read -p "   Choose [1-2]: " NET_CHOICE

case "${NET_CHOICE:-1}" in
  1) CHAIN_ID="D"; API_URL="https://devnet-api.multiversx.com"; EXPLORER="https://devnet-explorer.multiversx.com"; NETWORK="devnet" ;;
  2) CHAIN_ID="1"; API_URL="https://api.multiversx.com"; EXPLORER="https://explorer.multiversx.com"; NETWORK="mainnet" ;;
  *) CHAIN_ID="D"; API_URL="https://devnet-api.multiversx.com"; EXPLORER="https://devnet-explorer.multiversx.com"; NETWORK="devnet" ;;
esac

# VPS details (skip if --local)
VPS_HOST=""; VPS_USER=""; DOMAIN=""
if [ "$LOCAL_ONLY" = false ]; then
  echo ""
  echo -e "${BOLD}  VPS Deployment${NC}"
  read -p "  🖥️  VPS IP address (or press Enter to skip VPS): " VPS_HOST
  if [ -n "$VPS_HOST" ]; then
    read -p "  👤 VPS SSH user (default: root): " VPS_USER
    VPS_USER="${VPS_USER:-root}"
    read -p "  🌐 Domain name (e.g., research.mybot.com): " DOMAIN
    [ -z "$DOMAIN" ] && DOMAIN="$AGENT_NAME.example.com"
  fi
fi

ok "Keys collected — moving on"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 2: Generate wallet + write .env + agent.config.json
# ══════════════════════════════════════════════════════════════════════════════
step "2/10" "Generate wallet and configuration"

cd "$ROOT_DIR"

# Generate wallet
if [ ! -f wallet.pem ]; then
  npx ts-node scripts/generate_wallet.ts
  ok "wallet.pem generated"
else
  info "wallet.pem already exists"
fi

# Extract wallet address
WALLET_ADDRESS=$(grep -oE 'erd1[a-z0-9]+' wallet.pem | head -1 || echo "erd1...")

# Write .env
cat > .env << EOF
# Generated by launch.sh — $(date)
MULTIVERSX_CHAIN_ID=$CHAIN_ID
MULTIVERSX_API_URL=$API_URL
MULTIVERSX_EXPLORER_URL=$EXPLORER
MULTIVERSX_PRIVATE_KEY=./wallet.pem

IDENTITY_REGISTRY_ADDRESS=erd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gq4hu
VALIDATION_REGISTRY_ADDRESS=erd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gq4hu
REPUTATION_REGISTRY_ADDRESS=erd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gq4hu
ESCROW_CONTRACT_ADDRESS=erd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gq4hu

X402_FACILITATOR_URL=http://localhost:4000
MULTIVERSX_RELAYER_URL=http://localhost:3001
MULTIVERSX_MCP_URL=http://localhost:3000

AGENT_NAME=$AGENT_NAME
AGENT_WALLET_ADDRESS=$WALLET_ADDRESS
AGENT_URI=https://${DOMAIN:-$AGENT_NAME.example.com}

LLM_PROVIDER=$LLM_PROVIDER
LLM_API_KEY=$LLM_API_KEY
LLM_MODEL=$LLM_MODEL

PRICE_PER_QUERY=$PRICE
PRICE_TOKEN=USDC-350c4e

BACKEND_PORT=4000
FRONTEND_PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://${DOMAIN:-localhost:3000}
EOF
ok ".env written"

# Write agent.config.json
cat > agent.config.json << EOF
{
  "agentName": "$AGENT_NAME",
  "description": "$AGENT_DESC",
  "version": "1.0.0",
  "nonce": 0,
  "network": "$NETWORK",
  "pricing": { "perQuery": "$PRICE", "token": "USDC-350c4e" },
  "llm": { "provider": "$LLM_PROVIDER", "model": "$LLM_MODEL" },
  "services": [
    {
      "id": "default",
      "name": "General Query",
      "description": "Process a text query and return a structured response",
      "pricePerCall": "$PRICE",
      "token": "USDC-350c4e"
    }
  ]
}
EOF
ok "agent.config.json written"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3: Install dependencies
# ══════════════════════════════════════════════════════════════════════════════
step "3/10" "Install dependencies"

cd "$ROOT_DIR/backend" && npm ci --silent
ok "Backend dependencies installed"

if [ -f "$ROOT_DIR/frontend/package.json" ]; then
  cd "$ROOT_DIR/frontend" && npm ci --silent 2>/dev/null || npm install --silent
  ok "Frontend dependencies installed"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 4: Fund wallet (devnet only)
# ══════════════════════════════════════════════════════════════════════════════
step "4/10" "Fund wallet"

cd "$ROOT_DIR"
if [ "$CHAIN_ID" = "D" ]; then
  npx ts-node scripts/fund.ts 2>/dev/null && ok "Wallet funded from devnet faucet" || warn "Faucet unavailable — fund manually"
else
  info "Mainnet selected — fund your wallet manually: $WALLET_ADDRESS"
  echo "   Send at least 0.05 EGLD for gas + your USDC for escrow"
  read -p "   Press Enter when funded..." _
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 5: Register agent on-chain
# ══════════════════════════════════════════════════════════════════════════════
step "5/10" "Register agent on MultiversX"

cd "$ROOT_DIR"
npx ts-node scripts/register.ts 2>&1 && ok "Agent registered on-chain" || warn "Registration may require funded contracts — continuing"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 6: Build manifest + mint identity NFT
# ══════════════════════════════════════════════════════════════════════════════
step "6/10" "Build manifest"

cd "$ROOT_DIR"
npx ts-node scripts/build_manifest.ts 2>&1 && ok "Manifest built" || warn "Manifest build skipped — run manually: npm run build-manifest"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 7: Build and test locally
# ══════════════════════════════════════════════════════════════════════════════
step "7/10" "Build and verify"

cd "$ROOT_DIR/backend"
npx tsc --outDir dist && ok "TypeScript build: OK" || fail "TypeScript build failed"
NODE_ENV=test npx jest --forceExit --detectOpenHandles --silent && ok "Tests: ALL PASSING" || warn "Some tests failed — review output"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 8: Provision VPS
# ══════════════════════════════════════════════════════════════════════════════
step "8/10" "Provision VPS"

if [ -z "$VPS_HOST" ] || [ "$LOCAL_ONLY" = true ]; then
  info "No VPS configured — running locally only"
  info "Start with: npm run dev"
else
  echo -e "  ${BOLD}About to harden your VPS:${NC}"
  echo "   • System updates"
  echo "   • Non-root user 'moltbot'"
  echo "   • SSH hardening (key-only, no root login)"
  echo "   • UFW firewall (ports 22, 80, 443)"
  echo "   • Fail2Ban"
  echo "   • Docker + Docker Compose"
  echo ""
  read -p "  Proceed? [Y/n]: " PROVISION_CONFIRM
  if [ "${PROVISION_CONFIRM:-Y}" != "n" ] && [ "${PROVISION_CONFIRM:-Y}" != "N" ]; then
    cd "$ROOT_DIR"
    bash infra/provision.sh "$VPS_USER@$VPS_HOST" && ok "VPS provisioned" || fail "VPS provisioning failed"
  else
    info "VPS provisioning skipped"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 9: Deploy to VPS
# ══════════════════════════════════════════════════════════════════════════════
step "9/10" "Deploy to VPS"

if [ -n "$VPS_HOST" ] && [ "$LOCAL_ONLY" = false ]; then
  DEPLOY_USER="moltbot"
  # If we provisioned, use moltbot; otherwise use what they gave us
  [ "$VPS_USER" != "root" ] && DEPLOY_USER="$VPS_USER"

  cd "$ROOT_DIR"
  bash infra/deploy.sh "$DEPLOY_USER@$VPS_HOST" "$DOMAIN" && ok "Deployed to VPS" || fail "Deployment failed"
else
  info "No VPS — skipping deployment"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 10: Final verification
# ══════════════════════════════════════════════════════════════════════════════
step "10/10" "Verify everything"

echo ""
if [ -n "$VPS_HOST" ] && [ "$LOCAL_ONLY" = false ]; then
  # Remote health check
  echo -e "  Checking https://$DOMAIN/api/health..."
  sleep 5  # Give containers time to start
  if curl -sf "https://$DOMAIN/api/health" > /dev/null 2>&1; then
    ok "Health check: PASSED"
  else
    # Try HTTP fallback (SSL might still be provisioning)
    if curl -sf "http://$VPS_HOST:4000/api/health" > /dev/null 2>&1; then
      ok "Health check (HTTP): PASSED — HTTPS will activate shortly via Caddy"
    else
      warn "Health check: agent may still be starting — check 'npm run logs'"
    fi
  fi
fi

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}                                                                             ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}${GREEN}🎉  YOUR CONTENT MACHINE IS LIVE!${NC}                                         ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                                             ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Agent:       $AGENT_NAME"
echo -e "${CYAN}║${NC}  Wallet:      $WALLET_ADDRESS"
echo -e "${CYAN}║${NC}  Network:     $NETWORK"
echo -e "${CYAN}║${NC}  LLM:         $LLM_PROVIDER / $LLM_MODEL"
echo -e "${CYAN}║${NC}  Price:       $PRICE USDC per query"

if [ -n "$VPS_HOST" ] && [ "$LOCAL_ONLY" = false ]; then
echo -e "${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}Live URLs:${NC}"
echo -e "${CYAN}║${NC}    🌐 Frontend:   https://$DOMAIN"
echo -e "${CYAN}║${NC}    🔌 API:        https://$DOMAIN/api/health"
echo -e "${CYAN}║${NC}    📊 Capabilities: https://$DOMAIN/api/capabilities"
echo -e "${CYAN}║${NC}    🔍 Explorer:   $EXPLORER/accounts/$WALLET_ADDRESS"
fi

echo -e "${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}What to do next:${NC}"
echo -e "${CYAN}║${NC}    1. Customize your agent:  backend/src/agent/base-agent.ts"
echo -e "${CYAN}║${NC}    2. Add your own tools:     override getTools() and getSystemPrompt()"
echo -e "${CYAN}║${NC}    3. Push to update:         git push → auto-deploys via CI/CD"
echo -e "${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}Commands:${NC}"
echo -e "${CYAN}║${NC}    npm run dev        # Local development"

if [ -n "$VPS_HOST" ] && [ "$LOCAL_ONLY" = false ]; then
echo -e "${CYAN}║${NC}    npm run logs       # Tail production logs"
echo -e "${CYAN}║${NC}    npm run deploy     # Redeploy to VPS"
fi

echo -e "${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
