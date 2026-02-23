#!/bin/bash
set -euo pipefail

# ============================================
# mx-openclaw-template-solution: Deploy to VPS
# ============================================
# Usage: ./deploy.sh user@vps-ip yourdomain.com
#
# This script:
# 1. Syncs project files to the VPS
# 2. Sets the domain in the Caddyfile
# 3. Builds and starts Docker containers
# ============================================

if [ -z "${1:-}" ] || [ -z "${2:-}" ]; then
  echo "❌ Usage: ./deploy.sh user@vps-ip yourdomain.com"
  echo "   Example: ./deploy.sh moltbot@123.45.67.89 research.mybot.com"
  exit 1
fi

VPS="$1"
DOMAIN="$2"
PROJECT_DIR="/home/$(echo $VPS | cut -d@ -f1)/mx-openclaw-template-solution"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "🚀 Deploying to $VPS with domain $DOMAIN..."

# 1. Sync files (excluding node_modules, .git, etc.)
echo "📦 Step 1/4: Syncing project files..."
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude 'wallet.pem' \
  --exclude 'coverage' \
  --exclude 'dist' \
  --exclude '.next' \
  --exclude 'uploads' \
  --exclude 'reports' \
  "$ROOT_DIR/" "$VPS:$PROJECT_DIR/"

# 2. Copy secrets separately
echo "🔑 Step 2/4: Copying secrets..."
if [ -f "$ROOT_DIR/.env" ]; then
  scp "$ROOT_DIR/.env" "$VPS:$PROJECT_DIR/.env"
  echo "   ✅ .env copied"
else
  echo "   ⚠️  No .env file found. Copy it manually."
fi

if [ -f "$ROOT_DIR/wallet.pem" ]; then
  scp "$ROOT_DIR/wallet.pem" "$VPS:$PROJECT_DIR/wallet.pem"
  echo "   ✅ wallet.pem copied"
else
  echo "   ⚠️  No wallet.pem found. Run 'npm run setup' first."
fi

# 3. Set domain in Caddyfile
echo "🌐 Step 3/4: Configuring domain ($DOMAIN)..."
ssh "$VPS" "cd $PROJECT_DIR/infra && sed -i 's/\\\$DOMAIN/$DOMAIN/g' Caddyfile"

# 4. Build and start
echo "🐳 Step 4/4: Building and starting containers..."
ssh "$VPS" << REMOTE
  cd $PROJECT_DIR/infra
  export DOMAIN=$DOMAIN
  docker compose build --no-cache
  docker compose up -d
  echo ""
  echo "============================================"
  echo "✅ Deployment complete!"
  echo "============================================"
  echo "🌐 Your bot is live at: https://$DOMAIN"
  echo "📊 Health check: https://$DOMAIN/api/health"
  echo "💬 Chat: https://$DOMAIN/chat"
  echo ""
  echo "📋 Useful commands:"
  echo "   Logs:    ssh $VPS 'cd $PROJECT_DIR/infra && docker compose logs -f'"
  echo "   Restart: ssh $VPS 'cd $PROJECT_DIR/infra && docker compose restart'"
  echo "   Stop:    ssh $VPS 'cd $PROJECT_DIR/infra && docker compose down'"
REMOTE

echo ""
echo "✅ Deploy complete! Visit https://$DOMAIN"
