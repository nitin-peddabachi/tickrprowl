#!/bin/bash

echo "Stopping Stockr..."

# Stop backend
if [ -f /tmp/stockr-backend.pid ]; then
  BACKEND_PID=$(cat /tmp/stockr-backend.pid)
  if kill -0 $BACKEND_PID 2>/dev/null; then
    kill $BACKEND_PID
    echo "Backend stopped."
  fi
  rm /tmp/stockr-backend.pid
fi

# Stop frontend
if [ -f /tmp/stockr-frontend.pid ]; then
  FRONTEND_PID=$(cat /tmp/stockr-frontend.pid)
  if kill -0 $FRONTEND_PID 2>/dev/null; then
    kill $FRONTEND_PID
    echo "Frontend stopped."
  fi
  rm /tmp/stockr-frontend.pid
fi

# Catch any stragglers
pkill -f "uvicorn app.main" 2>/dev/null
pkill -f "next dev" 2>/dev/null

echo "Stockr stopped."
