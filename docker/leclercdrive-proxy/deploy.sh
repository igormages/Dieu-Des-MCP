#!/usr/bin/env bash
set -euo pipefail

REMOTE="${LECLERCDRIVE_PROXY_HOST:-root@51.159.164.44}"
REMOTE_DIR="/opt/leclercdrive-proxy"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$SCRIPT_DIR/passwd" ]]; then
  echo "Générez d'abord passwd : ./setup-auth.sh"
  exit 1
fi

ssh "$REMOTE" "mkdir -p $REMOTE_DIR"
scp "$SCRIPT_DIR/squid.conf" "$SCRIPT_DIR/docker-compose.yml" "$SCRIPT_DIR/passwd" "$REMOTE:$REMOTE_DIR/"

ssh "$REMOTE" "cd $REMOTE_DIR && docker compose pull && docker compose up -d && docker compose ps"

echo ""
echo "Proxy déployé sur $REMOTE:3128"
