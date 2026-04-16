#!/usr/bin/env bash
# scripts/dev-start.sh — Kill stale Python servers, find available port, start fresh.
# Git Bash on Windows. Codex calls this after code changes.

set -euo pipefail
cd "$(dirname "$0")/.."

BASE_PORT=5500
MAX_PORT=5510

# --- Check if a port is in use and return the PID ---
get_listening_pid() {
  local port=$1
  netstat -ano 2>/dev/null | grep ":${port} " | grep LISTENING | awk '{print $5}' | sort -u | head -1 || true
}

# --- Check if a PID is a python process (our old server) ---
is_python_process() {
  local pid=$1
  tasklist //FI "PID eq $pid" 2>/dev/null | grep -iq "python" && return 0
  return 1
}

# --- Kill a specific PID ---
kill_pid() {
  local pid=$1
  if [ -n "$pid" ] && [ "$pid" != "0" ]; then
    taskkill //F //PID "$pid" >/dev/null 2>&1 || true
  fi
}

# --- Find available port, killing our own old python servers ---
find_port() {
  local port=$BASE_PORT
  while [ $port -le $MAX_PORT ]; do
    local pid
    pid=$(get_listening_pid $port)
    if [ -z "$pid" ]; then
      # Port is free
      echo $port
      return 0
    fi
    if is_python_process "$pid"; then
      # Our old python server — kill it and take the port
      echo "[dev-start] Killing old Python server (PID $pid) on port $port..." >&2
      kill_pid "$pid"
      sleep 1
      echo $port
      return 0
    fi
    # Port occupied by another program — try next port
    echo "[dev-start] Port $port occupied by another program (PID $pid), trying next..." >&2
    port=$((port + 1))
  done
  echo "[dev-start] ERROR: No available port in range $BASE_PORT-$MAX_PORT" >&2
  return 1
}

PORT=$(find_port)

echo "[dev-start] Starting Python HTTP server on port $PORT..."
python -m http.server "$PORT" &
SERVER_PID=$!

# --- Wait for server to be ready ---
attempts=0
max=15
while ! curl -s -o /dev/null -w '' "http://localhost:${PORT}" 2>/dev/null; do
  attempts=$((attempts + 1))
  if [ $attempts -ge $max ]; then
    echo "[dev-start] ERROR: Server on port ${PORT} did not start within ${max}s"
    exit 1
  fi
  sleep 1
done

echo ""
echo "=== Dev server running ==="
echo "URL: http://localhost:${PORT}"
echo "Background PID: $SERVER_PID"
