#!/bin/bash
# Start the ghostty-web SSH terminal test app
# Usage: ./start.sh [fly-app-name]

APP="${1:-consoletm-sandboxes}"

cd "$(dirname "$0")"

# Kill any existing instance
pkill -f "bun run server.ts" 2>/dev/null
sleep 0.5

echo "Starting terminal for fly app: $APP"
echo "Open http://localhost:3000"

FLY_APP="$APP" bun run server.ts
