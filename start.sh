#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

RUN_DIR="$ROOT_DIR/.run"
PID_FILE="$RUN_DIR/dev_all.pid"
LOG_FILE="$RUN_DIR/dev_all.log"

mkdir -p "$RUN_DIR"

usage() {
  cat <<'EOF'
Clawdbot the Endgame Dev Runner

Usage:
  ./start.sh                 Start in foreground (Ctrl+C to stop)
  ./start.sh --detach        Start in background (recommended)
  ./start.sh --detach --open Start in background and open /setup
  ./start.sh stop            Stop background stack
  ./start.sh status          Show status + health checks
  ./start.sh logs            Tail background logs
EOF
}

is_running() {
  if [[ ! -f "$PID_FILE" ]]; then
    return 1
  fi
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ -n "${pid:-}" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

wait_for() {
  local url="$1"
  local label="$2"
  local seconds="${3:-30}"
  local start
  start="$(date +%s)"
  while true; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "✅ $label up: $url"
      return 0
    fi
    if (( "$(date +%s)" - start >= seconds )); then
      echo "❌ Timed out waiting for $label: $url"
      return 1
    fi
    sleep 1
  done
}

ensure_deps() {
  if [[ ! -d "node_modules" ]]; then
    echo "📦 Installing dependencies..."
    npm install
  fi
}

cmd="${1:-}"
case "$cmd" in
  "" )
    ensure_deps
    echo "🚀 Launching Clawdbot the Endgame stack (foreground)..."
    echo "   - App:   http://localhost:3000"
    echo "   - Convex http://127.0.0.1:3210  (dashboard http://127.0.0.1:6790)"
    echo "   - Logs:  (foreground)"
    exec npm run dev:all
    ;;

  "--detach"|"-d"|"detach"|"start" )
    ensure_deps
    if is_running; then
      echo "✅ Already running (pid $(cat "$PID_FILE"))."
    else
      echo "🚀 Launching Clawdbot the Endgame stack (background)..."
      node scripts/relaunch_dev.js
    fi
    echo "⏳ Waiting for services..."
    wait_for "http://localhost:3000/" "Next.js" 60 || { echo "See logs: $LOG_FILE"; exit 1; }
    wait_for "http://127.0.0.1:3210/" "Convex" 60 || { echo "See logs: $LOG_FILE"; exit 1; }
    if wait_for "http://127.0.0.1:6790/" "Convex dashboard" 10; then
      dashboard_hint="http://127.0.0.1:6790/?d=anonymous-mission-control"
    else
      dashboard_hint="(not reachable - optional in local runs)"
      echo "⚠️ Convex dashboard is optional and currently unavailable."
    fi
    echo "✅ Ready."
    echo "   - App:    http://localhost:3000"
    echo "   - Scout:  http://localhost:3000/scout"
    echo "   - Setup:  http://localhost:3000/setup"
    echo "   - Convex: $dashboard_hint"
    echo "   - Logs:   $LOG_FILE"
    if [[ "${2:-}" == "--open" ]]; then
      if command -v open >/dev/null 2>&1; then
        open "http://localhost:3000/setup" >/dev/null 2>&1 || true
      fi
    fi
    ;;

  "stop" )
    if ! is_running; then
      echo "✅ Not running."
      exit 0
    fi
    pid="$(cat "$PID_FILE")"
    echo "🛑 Stopping dev stack (pid $pid)..."
    # Kill the whole process group (relaunch_dev.js uses detached spawn)
    kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    for _ in {1..30}; do
      if ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$PID_FILE"
        echo "✅ Stopped."
        exit 0
      fi
      sleep 1
    done
    echo "⚠️ Force killing..."
    kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "✅ Stopped."
    ;;

  "status" )
    if is_running; then
      echo "✅ Running (pid $(cat "$PID_FILE"))"
      echo "Logs: $LOG_FILE"
    else
      echo "❌ Not running"
      echo "Tip: ./start.sh --detach"
    fi
    echo
    echo "Health:"
    curl -fsS -o /dev/null -w "Next.js:  %{http_code}\n" http://localhost:3000/ 2>/dev/null || echo "Next.js:  down"
    curl -fsS -o /dev/null -w "Convex:   %{http_code}\n" http://127.0.0.1:3210/ 2>/dev/null || echo "Convex:   down"
    dashboard_code="$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:6790/ 2>/dev/null || true)"
    if [[ "$dashboard_code" == "000" || -z "$dashboard_code" ]]; then
      echo "Dashboard:optional/offline"
    else
      echo "Dashboard:$dashboard_code"
    fi
    ;;

  "logs" )
    if [[ ! -f "$LOG_FILE" ]]; then
      echo "No log file yet: $LOG_FILE"
      exit 1
    fi
    exec tail -n 200 -f "$LOG_FILE"
    ;;

  "-h"|"--help"|"help" )
    usage
    ;;

  * )
    echo "Unknown command: $cmd"
    echo
    usage
    exit 1
    ;;
esac
