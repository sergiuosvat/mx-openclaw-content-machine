#!/bin/bash
set -euo pipefail

# ============================================
# mx-openclaw-template-solution: Dev Mode
# ============================================
# Starts backend and frontend concurrently
# ============================================

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "🚀 Starting development servers..."
echo ""

# Check if .env exists
if [ ! -f "$ROOT_DIR/.env" ]; then
  echo "❌ .env not found. Run 'npm run setup' first."
  exit 1
fi

# Install dependencies if needed
if [ ! -d "$ROOT_DIR/backend/node_modules" ]; then
  echo "📦 Installing backend dependencies..."
  cd "$ROOT_DIR/backend" && npm install
fi

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
  echo "📦 Installing frontend dependencies..."
  cd "$ROOT_DIR/frontend" && npm install
fi

# Start both servers
echo "🔧 Starting backend on port ${BACKEND_PORT:-4000}..."
echo "🎨 Starting frontend on port ${FRONTEND_PORT:-3000}..."
echo ""

cd "$ROOT_DIR"

# Use npx concurrently if available, otherwise use background processes
if command -v npx &>/dev/null && npx concurrently --version &>/dev/null 2>&1; then
  npx concurrently \
    --names "backend,frontend" \
    --prefix-colors "blue,magenta" \
    "cd backend && npm run dev" \
    "cd frontend && npm run dev"
else
  cd "$ROOT_DIR/backend" && npm run dev &
  BACKEND_PID=$!
  cd "$ROOT_DIR/frontend" && npm run dev &
  FRONTEND_PID=$!

  trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
  wait
fi
