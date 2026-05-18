#!/usr/bin/env bash
# Start/stop the prism server.
#
# Usage:
#   ./server.sh start            → production mode (npm run build + npm start)
#   ./server.sh start --dev      → dev mode (next dev w/ HMR + on-demand compile)
#   ./server.sh dev              → alias for `start --dev`
#   ./server.sh stop|restart|status|logs
#
# Production mode is the default because the dev server's HMR + per-route
# compile-on-demand can chew CPU and occasionally OOM after long editing
# sessions. Switch to --dev only while actively editing code; restart
# without --dev once you're done.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=3737
HOST=127.0.0.1
LOG="$SCRIPT_DIR/.server.log"
PID="$SCRIPT_DIR/.server.pid"
MODE_FILE="$SCRIPT_DIR/.server.mode"

pids_on_port() {
  lsof -ti:"$PORT" 2>/dev/null || true
}

cmd_status() {
  local pids
  pids="$(pids_on_port)"
  if [[ -n "$pids" ]]; then
    local mode="?"
    [[ -f "$MODE_FILE" ]] && mode="$(cat "$MODE_FILE")"
    echo "running on http://$HOST:$PORT (pid $(echo $pids | tr '\n' ' '), mode=$mode)"
    return 0
  fi
  echo "stopped"
  return 1
}

cmd_start() {
  local dev_mode=0
  for arg in "$@"; do
    case "$arg" in
      --dev) dev_mode=1 ;;
    esac
  done

  if [[ -n "$(pids_on_port)" ]]; then
    echo "already running on port $PORT (pid $(pids_on_port | tr '\n' ' '))"
    exit 0
  fi
  cd "$SCRIPT_DIR"

  if [[ "$dev_mode" -eq 1 ]]; then
    : >"$LOG"
    nohup npm run dev >>"$LOG" 2>&1 &
    echo $! >"$PID"
    echo "dev" >"$MODE_FILE"
    echo "starting in DEV on http://$HOST:$PORT (pid $!), logs: $LOG"
    # Dev needs a longer ready window because the first request compiles routes.
    # On a fresh install / is a 307 redirect to the profile interview, so we
    # accept any 2xx or 3xx, not just 200.
    for _ in $(seq 1 30); do
      if curl -sS -o /dev/null -w "%{http_code}" "http://$HOST:$PORT/" 2>/dev/null | grep -qE "^[23]"; then
        echo "ready"
        return 0
      fi
      sleep 0.5
    done
    echo "did not become ready within 15s — tail $LOG"
    return 1
  fi

  # Production mode — build first, then run `next start`. The build is
  # incremental thanks to .next/cache, so subsequent starts are quick.
  echo "building (production)…"
  if ! npm run build >>"$LOG" 2>&1; then
    echo "build failed — tail $LOG"
    return 1
  fi
  : >"$LOG"
  nohup npm start >>"$LOG" 2>&1 &
  echo $! >"$PID"
  echo "prod" >"$MODE_FILE"
  echo "starting in PROD on http://$HOST:$PORT (pid $!), logs: $LOG"
  for _ in $(seq 1 20); do
    if curl -sS -o /dev/null -w "%{http_code}" "http://$HOST:$PORT/" 2>/dev/null | grep -qE "^[23]"; then
      echo "ready"
      return 0
    fi
    sleep 0.5
  done
  echo "did not become ready within 10s — tail $LOG"
  return 1
}

cmd_stop() {
  local pids
  pids="$(pids_on_port)"
  if [[ -z "$pids" ]]; then
    # Also clean up anything matching "next dev"/"next start" started from this folder.
    pkill -f "next (dev|start) --hostname $HOST --port $PORT" 2>/dev/null || true
    rm -f "$PID" "$MODE_FILE"
    echo "not running"
    return 0
  fi
  echo "stopping pid $(echo $pids | tr '\n' ' ')"
  kill $pids 2>/dev/null || true
  for _ in $(seq 1 10); do
    if [[ -z "$(pids_on_port)" ]]; then
      rm -f "$PID" "$MODE_FILE"
      echo "stopped"
      return 0
    fi
    sleep 0.3
  done
  echo "SIGTERM did not stop it — sending SIGKILL"
  kill -9 $(pids_on_port) 2>/dev/null || true
  rm -f "$PID" "$MODE_FILE"
}

cmd_logs() {
  if [[ ! -f "$LOG" ]]; then
    echo "no log file yet at $LOG"
    exit 1
  fi
  tail -f "$LOG"
}

case "${1:-}" in
  start) shift; cmd_start "$@" ;;
  dev) cmd_start --dev ;;
  stop) cmd_stop ;;
  restart) shift; cmd_stop; cmd_start "$@" ;;
  status) cmd_status ;;
  logs) cmd_logs ;;
  *)
    echo "usage: $0 {start [--dev]|dev|stop|restart [--dev]|status|logs}" >&2
    exit 2
    ;;
esac
