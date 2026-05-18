#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER="${LECLERCDRIVE_PROXY_USER:-leclercdrive}"

if [[ -z "${LECLERCDRIVE_PROXY_PASSWORD:-}" ]]; then
  LECLERCDRIVE_PROXY_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
  echo "Mot de passe généré (sauvegardez-le) : $LECLERCDRIVE_PROXY_PASSWORD"
fi

docker run --rm httpd:alpine htpasswd -nbB "$USER" "$LECLERCDRIVE_PROXY_PASSWORD" > "$SCRIPT_DIR/passwd"

echo ""
echo "Ajoutez sur Vercel (.env local) :"
echo "LECLERCDRIVE_HTTP_PROXY=http://${USER}:${LECLERCDRIVE_PROXY_PASSWORD}@51.159.164.44:3128"
