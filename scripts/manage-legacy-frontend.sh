#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
PM2_HOME_DIR="$ROOT_DIR/.pm2-legacy-frontend"
APP_NAME="${LEGACY_FRONTEND_PM2_APP_NAME:-legacy-frontend}"
PORT="${LEGACY_FRONTEND_PORT:-3003}"
ACTION="${1:-start}"

export PM2_HOME="$PM2_HOME_DIR"

ensure_pm2() {
  if ! command -v pm2 >/dev/null 2>&1; then
    echo "pm2 is not installed. Install it globally first: npm i -g pm2"
    exit 1
  fi
}

ensure_serve() {
  if ! command -v serve >/dev/null 2>&1; then
    echo "serve is not installed. Install it globally first: npm i -g serve"
    exit 1
  fi
}

build_frontend() {
  npm --prefix "$FRONTEND_DIR" run build
}

start_frontend() {
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  pm2 start "serve -s dist -l $PORT" --name "$APP_NAME" --cwd "$FRONTEND_DIR"
  pm2 save --force
  echo "Legacy frontend is running on port $PORT via PM2 app '$APP_NAME'."
  echo "PM2 state saved to: $PM2_HOME/dump.pm2"
}

case "$ACTION" in
  start)
    ensure_pm2
    ensure_serve
    build_frontend
    start_frontend
    ;;
  restart)
    ensure_pm2
    ensure_serve
    build_frontend
    start_frontend
    ;;
  save)
    ensure_pm2
    pm2 save --force
    echo "PM2 state saved to: $PM2_HOME/dump.pm2"
    ;;
  resurrect)
    ensure_pm2
    pm2 resurrect
    pm2 ls
    ;;
  stop)
    ensure_pm2
    pm2 delete "$APP_NAME" || true
    pm2 save --force
    ;;
  status)
    ensure_pm2
    pm2 ls
    ;;
  *)
    echo "Usage: $0 {start|restart|save|resurrect|stop|status}"
    exit 1
    ;;
esac
