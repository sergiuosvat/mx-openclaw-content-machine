#!/bin/bash
set -euo pipefail

# Usage: ./destroy.sh user@vps-ip
if [ -z "${1:-}" ]; then
  echo "❌ Usage: ./destroy.sh user@vps-ip"
  exit 1
fi

VPS="$1"
PROJECT_DIR="/home/$(echo $VPS | cut -d@ -f1)/mx-openclaw-template-solution"

echo "🗑️  Destroying deployment on $VPS..."
ssh "$VPS" << REMOTE
  cd $PROJECT_DIR/infra 2>/dev/null && docker compose down -v || true
  rm -rf $PROJECT_DIR
  echo "✅ Deployment destroyed."
REMOTE
