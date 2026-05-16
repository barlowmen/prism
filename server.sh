#!/usr/bin/env bash
# Start/stop the prism dev server.
# Usage: ./server.sh start|stop|restart|status|logs

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=3737
HOST=127.0.0.1
LOG="$SCRIPT_DIR/.server.log"
PID="$SCRIPT_DIR/.server.pid"

pids_on_port() {
  lsof -ti:"$PORT" 2>/dev/null || true
}

cmd_status() {
  local pids
  pids="$(pids_on_port)"
  if [[ -n "$pids" ]]; then
    echo "running on http://$HOST:$PORT (pid $(echo $pids | tr '\n' ' '))"
    return 0
  fi
  echo "stopped"
  return 1
}

cmd_start() {
  if [[ -n "$(pids_on_port)" ]]; then
    echo "already running on port $PORT (pid $(pids_on_port | tr '\n' ' '))"
    exit 0
  fi
  cd "$SCRIPT_DIR"
  : >"$LOG"
  nohup npm run dev >>"$LOG" 2>&1 &
  echo $! >"$PID"
  echo "starting on http://$HOST:$PORT (pid $!), logs: $LOG"
  # Wait briefly for readiness.
  for _ in $(seq 1 30); do
    if curl -sS -o /dev/null -w "%{http_code}" "http://$HOST:$PORT/" 2>/dev/null | grep -q "^200"; then
      echo "ready"
      return 0
    fi
    sleep 0.5
  done
  echo "did not become ready within 15s — tail $LOG"
  return 1
}

cmd_stop() {
  local pids
  pids="$(pids_on_port)"
  if [[ -z "$pids" ]]; then
    # Also clean up anything matching "next dev" started from this folder.
    pkill -f "next dev --hostname $HOST --port $PORT" 2>/dev/null || true
    rm -f "$PID"
    echo "not running"
    return 0
  fi
  echo "stopping pid $(echo $pids | tr '\n' ' ')"
  kill $pids 2>/dev/null || true
  for _ in $(seq 1 10); do
    if [[ -z "$(pids_on_port)" ]]; then
      rm -f "$PID"
      echo "stopped"
      return 0
    fi
    sleep 0.3
  done
  echo "SIGTERM did not stop it — sending SIGKILL"
  kill -9 $(pids_on_port) 2>/dev/null || true
  rm -f "$PID"
}

cmd_logs() {
  if [[ ! -f "$LOG" ]]; then
    echo "no log file yet at $LOG"
    exit 1
  fi
  tail -f "$LOG"
}

case "${1:-}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_stop; cmd_start ;;
  status) cmd_status ;;
  logs) cmd_logs ;;
  *)
    echo "usage: $0 {start|stop|restart|status|logs}" >&2
    exit 2
    ;;
esac
