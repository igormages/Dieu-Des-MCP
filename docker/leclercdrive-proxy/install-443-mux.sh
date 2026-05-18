#!/usr/bin/env bash
# Multiplexe le port 443 : HTTPS (Traefik/Dokploy) + proxy HTTP (Squid).
# À lancer sur le VPS (root). Dokploy Traefik repasse en 127.0.0.1:8443.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Exécutez en root sur le VPS."
  exit 1
fi

echo "=== 1. Squid (3128) ==="
docker compose up -d

echo "=== 2. Traefik Dokploy → localhost:8443 ==="
if docker ps -a --format '{{.Names}}' | grep -qx dokploy-traefik; then
  docker stop dokploy-traefik
  docker rm dokploy-traefik
fi

docker run -d \
  --name dokploy-traefik \
  --restart unless-stopped \
  -p 127.0.0.1:8443:443/tcp \
  -p 127.0.0.1:8443:443/udp \
  -p 0.0.0.0:80:80/tcp \
  -v /etc/dokploy/traefik/traefik.yml:/etc/traefik/traefik.yml:ro \
  -v /etc/dokploy/traefik/dynamic:/etc/dokploy/traefik/dynamic \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  --network dokploy-network \
  traefik:v3.6.7

echo "=== 3. HAProxy multiplexeur 443 ==="
docker compose -f docker-compose.haproxy.yml up -d

sleep 2
echo ""
echo "Ports :"
ss -tlnp | grep -E ':443|:3128|:8443' || true
echo ""
echo "Proxy MCP : http://leclercdrive:MOT_DE_PASSE@51.159.164.44:443"
echo "Sites HTTPS : toujours via 51.159.164.44:443 (TLS → Traefik)"
