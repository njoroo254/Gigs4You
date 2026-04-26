#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# Gigs4You — VPS first-time setup
#
# Run once on a fresh Ubuntu 22.04 server:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/gigs4you/main/scripts/server-setup.sh | sudo bash
#
# What it does:
#   1. Installs Docker, Docker Compose plugin, Nginx, Certbot
#   2. Clones the repo to /opt/gigs4you
#   3. Copies Nginx config
#   4. Obtains SSL certificates via Let's Encrypt
#   5. Creates the secrets/ directory structure (values filled in manually)
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Config — edit before running ──────────────────────────────────────────────
REPO_URL="git@github.com:YOUR_ORG/gigs4you.git"
DEPLOY_DIR="/opt/gigs4you"
DEPLOY_USER="deploy"
DOMAIN="gigs4you.co.ke"
EMAIL="peter@gigs4you.co.ke"   # Certbot renewal notifications

# ── 1. System packages ────────────────────────────────────────────────────────
echo "→ Installing system packages..."
apt-get update -qq
apt-get install -y -qq \
    curl git nginx certbot python3-certbot-nginx \
    ufw fail2ban unattended-upgrades

# ── 2. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    echo "→ Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker "$DEPLOY_USER" 2>/dev/null || true
fi
docker --version

# ── 3. Firewall ───────────────────────────────────────────────────────────────
echo "→ Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

# ── 4. fail2ban (brute-force protection) ─────────────────────────────────────
systemctl enable --now fail2ban

# ── 5. Clone repo ─────────────────────────────────────────────────────────────
if [ ! -d "$DEPLOY_DIR" ]; then
    echo "→ Cloning repository to $DEPLOY_DIR..."
    git clone "$REPO_URL" "$DEPLOY_DIR"
fi
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR" 2>/dev/null || true

# ── 6. Nginx config ───────────────────────────────────────────────────────────
echo "→ Installing Nginx config..."
cp "$DEPLOY_DIR/nginx/gigs4you.conf" /etc/nginx/sites-available/gigs4you
cp "$DEPLOY_DIR/nginx/proxy_params"  /etc/nginx/proxy_params
ln -sf /etc/nginx/sites-available/gigs4you /etc/nginx/sites-enabled/gigs4you
rm -f /etc/nginx/sites-enabled/default

# Temporarily serve HTTP only so certbot can validate
sed -i 's/listen 443 ssl http2;/listen 80;/g' /etc/nginx/sites-available/gigs4you
sed -i '/ssl_/d' /etc/nginx/sites-available/gigs4you
nginx -t && systemctl reload nginx

# ── 7. SSL certificates ───────────────────────────────────────────────────────
echo "→ Obtaining SSL certificates..."
certbot --nginx \
    -d "api.$DOMAIN" \
    -d "dashboard.$DOMAIN" \
    -d "storage.$DOMAIN" \
    -d "grafana.$DOMAIN" \
    -d "ai.$DOMAIN" \
    -d "$DOMAIN" \
    --non-interactive --agree-tos --email "$EMAIL"

# Restore the full SSL config
cp "$DEPLOY_DIR/nginx/gigs4you.conf" /etc/nginx/sites-available/gigs4you
nginx -t && systemctl reload nginx

# ── 8. Dashboard webroot ──────────────────────────────────────────────────────
mkdir -p "/var/www/dashboard.$DOMAIN/html"

# ── 9. Docker secrets directory (values filled manually) ─────────────────────
echo "→ Creating secrets directory..."
mkdir -p "$DEPLOY_DIR/secrets"
chmod 700 "$DEPLOY_DIR/secrets"

cat <<'EOF'

╔══════════════════════════════════════════════════════════════════════╗
║                    MANUAL STEPS REMAINING                          ║
╠══════════════════════════════════════════════════════════════════════╣
║  1. Copy .env.example → .env and fill in all values:               ║
║     cp /opt/gigs4you/.env.example /opt/gigs4you/.env               ║
║     nano /opt/gigs4you/.env                                         ║
║                                                                      ║
║  2. Create Docker secrets files in /opt/gigs4you/secrets/:          ║
║     echo "YOUR_DB_PASS"      > secrets/db_password.txt             ║
║     echo "YOUR_JWT_SECRET"   > secrets/jwt_secret.txt              ║
║     echo "YOUR_MPESA_KEY"    > secrets/mpesa_consumer_key.txt      ║
║     echo "YOUR_MPESA_SEC"    > secrets/mpesa_consumer_secret.txt   ║
║     echo "YOUR_STRIPE_KEY"   > secrets/stripe_secret_key.txt       ║
║     echo "YOUR_METRICS_TOK"  > secrets/metrics_token.txt           ║
║     cp service-account.json  secrets/fcm_service_account.json      ║
║     chmod 600 secrets/*                                             ║
║                                                                      ║
║  3. Start all services:                                              ║
║     cd /opt/gigs4you                                                 ║
║     docker compose -f docker-compose.prod.yml up -d                 ║
║                                                                      ║
║  4. Run migrations:                                                  ║
║     docker compose -f docker-compose.prod.yml exec api \            ║
║       npm run migration:run                                          ║
║                                                                      ║
║  5. Add GitHub Actions secrets (repo → Settings → Secrets):         ║
║     DEPLOY_HOST      = your VPS IP                                   ║
║     DEPLOY_USER      = deploy                                        ║
║     DEPLOY_SSH_KEY   = private key for deploy user                  ║
║     VITE_SENTRY_DSN  = dashboard Sentry DSN                         ║
║     SLACK_WEBHOOK_DEV = Slack webhook for CI failure alerts          ║
╚══════════════════════════════════════════════════════════════════════╝

EOF

echo "✓ Server setup complete"
