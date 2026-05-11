#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYSTEMD_DIR="/etc/systemd/system"
SERVICE_NAME="shower-booking"

if [[ "$(whoami)" != "root" ]]; then
  printf 'This script must be run as root.\n' >&2
  printf 'Use: sudo bash scripts/install-systemd.sh\n' >&2
  exit 1
fi

cp "$ROOT_DIR/scripts/$SERVICE_NAME.service" "$SYSTEMD_DIR/$SERVICE_NAME.service"
cp "$ROOT_DIR/scripts/$SERVICE_NAME.timer" "$SYSTEMD_DIR/$SERVICE_NAME.timer"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME.timer"
systemctl start "$SERVICE_NAME.timer"

printf 'Installed and started:\n'
systemctl status "$SERVICE_NAME.timer" --no-pager
printf '\nNext trigger:\n'
systemctl list-timers "$SERVICE_NAME.timer" --no-pager
