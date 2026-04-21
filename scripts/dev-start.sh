#!/usr/bin/env bash
# scripts/dev-start.sh — Idempotent dev server launcher.
# - If a healthy Python http.server is already on port 5500..5510, REUSE it (no restart).
# - Otherwise start a fully detached Python (subshell + nohup + redirect) so it
#   survives after this script exits — avoids Git Bash on Windows reaping the child
#   when the launcher completes under Claude Code's background-task runner.

set -euo pipefail
cd "$(dirname "$0")/.."

BASE_PORT=5500
MAX_PORT=5510

get_listening_pid() {
  local port=$1
  netstat -ano 2>/dev/null | grep ":${port} " | grep LISTENING | awk '{print $5}' | sort -u | head -1 || true
}

is_python_process() {
  local pid=$1
  tasklist //FI "PID eq $pid" 2>/dev/null | grep -iq "python" && return 0
  return 1
}

kill_pid() {
  local pid=$1
  if [ -n "$pid" ] && [ "$pid" != "0" ]; then
    taskkill //F //PID "$pid" >/dev/null 2>&1 || true
  fi
}

# ── IDEMPOTENT: if a healthy Python server already serves localhost, reuse it ──
# Prevents the "re-run dev-start.sh → kills own server → breaks browser session" loop.
for port in $(seq $BASE_PORT $MAX_PORT); do
  pid=$(get_listening_pid "$port")
  [ -z "$pid" ] && continue
  is_python_process "$pid" || continue
  if curl -s -o /dev/null --max-time 2 "http://localhost:${port}/" 2>/dev/null; then
    echo "[dev-start] Existing Python server on port ${port} (PID $pid) is healthy — reusing."
    echo ""
    echo "=== Dev server running ==="
    echo "URL: http://localhost:${port}"
    echo "Background PID: $pid"
    exit 0
  fi
done

# ── Find an available port, reclaiming any stale Python on our range ──
find_port() {
  local port=$BASE_PORT
  while [ $port -le $MAX_PORT ]; do
    local pid
    pid=$(get_listening_pid $port)
    if [ -z "$pid" ]; then
      echo $port
      return 0
    fi
    if is_python_process "$pid"; then
      echo "[dev-start] Killing stale Python server (PID $pid) on port $port..." >&2
      kill_pid "$pid"
      sleep 1
      echo $port
      return 0
    fi
    echo "[dev-start] Port $port occupied by another program (PID $pid), trying next..." >&2
    port=$((port + 1))
  done
  echo "[dev-start] ERROR: No available port in range $BASE_PORT-$MAX_PORT" >&2
  return 1
}

PORT=$(find_port)
LOG_FILE="/tmp/tomatofarm-dev-${PORT}.log"

echo "[dev-start] Starting detached Python HTTP server on port $PORT (log: $LOG_FILE)..."
# Full detach: subshell + nohup + redirect. Python becomes an orphan owned by init,
# so it survives when this launcher script exits (important under Claude Code's
# background-task runner which can reap the bash process tree on task completion).
( nohup python -m http.server "$PORT" > "$LOG_FILE" 2>&1 & ) >/dev/null 2>&1

# ── Wait for server to be ready, then capture its PID via netstat ──
attempts=0
max=15
SERVER_PID=""
while [ $attempts -lt $max ]; do
  if curl -s -o /dev/null --max-time 2 "http://localhost:${PORT}/" 2>/dev/null; then
    SERVER_PID=$(get_listening_pid "$PORT")
    [ -n "$SERVER_PID" ] && break
  fi
  attempts=$((attempts + 1))
  sleep 1
done

if [ -z "$SERVER_PID" ]; then
  echo "[dev-start] ERROR: Server on port ${PORT} did not start within ${max}s. Log tail:"
  tail -20 "$LOG_FILE" 2>/dev/null || true
  exit 1
fi

echo ""
echo "=== Dev server running ==="
echo "URL: http://localhost:${PORT}"
echo "Background PID: $SERVER_PID"
