#!/bin/bash
set -euo pipefail

# Usage: ./logs.sh user@vps-ip [service]
if [ -z "${1:-}" ]; then
  echo "❌ Usage: ./logs.sh user@vps-ip [service]"
  echo "   Example: ./logs.sh moltbot@123.45.67.89"
  echo "   Example: ./logs.sh moltbot@123.45.67.89 backend"
  exit 1
fi

VPS="$1"
SERVICE="${2:-}"
PROJECT_DIR="/home/$(echo $VPS | cut -d@ -f1)/mx-openclaw-template-solution"

echo "📋 Tailing logs on $VPS..."
ssh "$VPS" "cd $PROJECT_DIR/infra && docker compose logs -f $SERVICE"
