#!/bin/bash

# TickrProwl startup script
echo "Starting TickrProwl..."

# Load Homebrew
eval "$(/opt/homebrew/bin/brew shellenv)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Kill anything already on our ports so restarts always work cleanly
echo "Clearing ports 8000 and 3000..."
lsof -ti :8000 | xargs kill -9 2>/dev/null
lsof -ti :3000 | xargs kill -9 2>/dev/null
pkill -f "uvicorn app.main" 2>/dev/null
pkill -f "next dev" 2>/dev/null
sleep 1

# Start backend
echo "Starting backend..."
cd "$SCRIPT_DIR/backend"
python3 -m uvicorn app.main:app --reload > /tmp/tickrprowl-backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > /tmp/tickrprowl-backend.pid

# Wait for backend to be ready (up to 20s)
BACKEND_READY=0
for i in {1..20}; do
  if curl -s http://localhost:8000/ > /dev/null 2>&1; then
    echo "Backend ready at http://localhost:8000"
    BACKEND_READY=1
    break
  fi
  sleep 1
done
if [ $BACKEND_READY -eq 0 ]; then
  echo "Backend failed to start. Last log:"
  tail -20 /tmp/tickrprowl-backend.log
  exit 1
fi

# Start frontend
echo "Starting frontend..."
cd "$SCRIPT_DIR/frontend"
npm run dev > /tmp/tickrprowl-frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > /tmp/tickrprowl-frontend.pid

# Wait for frontend to be ready (up to 30s)
for i in {1..30}; do
  if curl -s http://localhost:3000/ > /dev/null 2>&1; then
    echo "Frontend ready at http://localhost:3000"
    break
  fi
  sleep 1
done

echo ""
echo "TickrProwl is running!"
echo "  App:     http://localhost:3000"
echo "  API:     http://localhost:8000"
echo "  API docs: http://localhost:8000/docs"
echo ""
echo "Run ./stop.sh to shut down."

# Open in browser
open http://localhost:3000
