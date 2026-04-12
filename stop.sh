#!/bin/bash

echo "Stopping TickrProwl..."

# Stop backend
if [ -f /tmp/tickrprowl-backend.pid ]; then
  BACKEND_PID=$(cat /tmp/tickrprowl-backend.pid)
  if kill -0 $BACKEND_PID 2>/dev/null; then
    kill $BACKEND_PID
    echo "Backend stopped."
  fi
  rm /tmp/tickrprowl-backend.pid
fi

# Stop frontend
if [ -f /tmp/tickrprowl-frontend.pid ]; then
  FRONTEND_PID=$(cat /tmp/tickrprowl-frontend.pid)
  if kill -0 $FRONTEND_PID 2>/dev/null; then
    kill $FRONTEND_PID
    echo "Frontend stopped."
  fi
  rm /tmp/tickrprowl-frontend.pid
fi

# Catch any stragglers
pkill -f "uvicorn app.main" 2>/dev/null
pkill -f "next dev" 2>/dev/null

echo "TickrProwl stopped."
