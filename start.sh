#!/bin/bash

# Stockr startup script
echo "Starting Stockr..."

# Load Homebrew
eval "$(/opt/homebrew/bin/brew shellenv)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Start backend
echo "Starting backend..."
cd "$SCRIPT_DIR/backend"
python3 -m uvicorn app.main:app --reload > /tmp/stockr-backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > /tmp/stockr-backend.pid

# Wait for backend to be ready
for i in {1..10}; do
  if curl -s http://localhost:8000/ > /dev/null 2>&1; then
    echo "Backend ready at http://localhost:8000"
    break
  fi
  sleep 1
done

# Start frontend
echo "Starting frontend..."
cd "$SCRIPT_DIR/frontend"
npm run dev > /tmp/stockr-frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > /tmp/stockr-frontend.pid

# Wait for frontend to be ready
for i in {1..15}; do
  if curl -s http://localhost:3000/ > /dev/null 2>&1; then
    echo "Frontend ready at http://localhost:3000"
    break
  fi
  sleep 1
done

echo ""
echo "Stockr is running!"
echo "  App:     http://localhost:3000"
echo "  API:     http://localhost:8000"
echo "  API docs: http://localhost:8000/docs"
echo ""
echo "Run ./stop.sh to shut down."

# Open in browser
open http://localhost:3000
