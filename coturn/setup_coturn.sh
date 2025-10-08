#!/usr/bin/env bash
# setup_coturn.sh
# Usage: sudo bash setup_coturn.sh <YOUR_REALM> <EXTERNAL_IP> <SHARED_SECRET>
# Example: sudo bash setup_coturn.sh example.com 1.2.3.4 mysharedsecret
set -euo pipefail

REALM="${1:-example.com}"
EXTERNAL_IP="${2:-127.0.0.1}"
SHARED_SECRET="${3:-changeme}"

echo "Installing coturn..."
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y coturn

# Enable coturn to start as a daemon by default (on systemd)
sed -i 's/^#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn || true
echo "TURNSERVER_ENABLED=1" >> /etc/default/coturn

CONFIG="/etc/turnserver.conf"
cat > "$CONFIG" <<EOF
# Minimal coturn configuration
listening-port=3478
listening-ip=0.0.0.0
external-ip=${EXTERNAL_IP}
realm=${REALM}
server-name=${REALM}
lt-cred-mech
use-auth-secret
static-auth-secret=${SHARED_SECRET}
fingerprint
no-stdout-log
log-file=/var/log/turnserver.log
simple-log
# Optional TLS (recommended) - configure cert and key files if you have them:
# cert=/etc/ssl/certs/turnserver-cert.pem
# pkey=/etc/ssl/private/turnserver-key.pem
# tls-listening-port=5349
EOF

systemctl enable coturn
systemctl restart coturn

echo "Coturn installed and started."
echo "Config: $CONFIG"
echo "Make sure UDP/TCP 3478 is open, and if you use TLS, open 5349 and set cert/pkey."
echo "Shared secret set to: ${SHARED_SECRET}"
