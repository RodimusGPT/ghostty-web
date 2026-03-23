#!/bin/bash
# Start the ghostty-web SSH terminal test app
# Usage: ./start.sh [fly-app-name] [machine-id]

APP="${1:-consoletm-sandboxes}"
MACHINE="${2:-}"

cd "$(dirname "$0")"

# Kill any existing instance
pkill -f "bun run server.ts" 2>/dev/null
sleep 0.5

echo "Starting terminal for fly app: $APP"
if [ -n "$MACHINE" ]; then
  echo "Target machine: $MACHINE"
fi
echo "Open http://localhost:3000"

FLY_APP="$APP" FLY_MACHINE="$MACHINE" bun run server.ts
