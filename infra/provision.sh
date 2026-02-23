#!/bin/bash
set -euo pipefail

# ============================================
# mx-openclaw-template-solution: VPS Provisioning
# ============================================
# Usage: ./provision.sh root@your-vps-ip
#
# This script hardens a fresh Ubuntu 24.04 VPS:
# 1. System updates
# 2. Non-root user creation
# 3. SSH hardening (key-only, no root login)
# 4. UFW firewall (ports 22, 80, 443 only)
# 5. Fail2Ban
# 6. Docker + Docker Compose
# ============================================

if [ -z "${1:-}" ]; then
  echo "❌ Usage: ./provision.sh root@your-vps-ip"
  echo "   Example: ./provision.sh root@123.45.67.89"
  exit 1
fi

VPS="$1"
echo "🔧 Provisioning VPS at $VPS..."

ssh -o StrictHostKeyChecking=accept-new "$VPS" << 'REMOTE'
  set -euo pipefail

  echo "📦 Step 1/6: System updates..."
  apt-get update -qq && apt-get upgrade -y -qq

  echo "👤 Step 2/6: Creating non-root user 'moltbot'..."
  if ! id -u moltbot &>/dev/null; then
    useradd -m -s /bin/bash moltbot
    usermod -aG sudo moltbot
    echo "moltbot ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/moltbot
    # Copy SSH keys
    mkdir -p /home/moltbot/.ssh
    cp /root/.ssh/authorized_keys /home/moltbot/.ssh/authorized_keys
    chown -R moltbot:moltbot /home/moltbot/.ssh
    chmod 700 /home/moltbot/.ssh
    chmod 600 /home/moltbot/.ssh/authorized_keys
    echo "   ✅ User 'moltbot' created"
  else
    echo "   ℹ️  User 'moltbot' already exists"
  fi

  echo "🔒 Step 3/6: SSH hardening..."
  sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
  sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
  systemctl restart sshd
  echo "   ✅ Root login disabled, password auth disabled"

  echo "🛡️  Step 4/6: Configuring UFW firewall..."
  apt-get install -y -qq ufw
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp comment 'SSH'
  ufw allow 80/tcp comment 'HTTP'
  ufw allow 443/tcp comment 'HTTPS'
  ufw --force enable
  echo "   ✅ UFW enabled (ports 22, 80, 443)"

  echo "🚫 Step 5/6: Installing Fail2Ban..."
  apt-get install -y -qq fail2ban
  systemctl enable fail2ban
  systemctl start fail2ban
  echo "   ✅ Fail2Ban active"

  echo "🐳 Step 6/6: Installing Docker..."
  if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker moltbot
    echo "   ✅ Docker installed"
  else
    echo "   ℹ️  Docker already installed"
  fi

  # Docker Compose plugin
  if ! docker compose version &>/dev/null; then
    apt-get install -y -qq docker-compose-plugin
    echo "   ✅ Docker Compose plugin installed"
  else
    echo "   ℹ️  Docker Compose already installed"
  fi

  # Enable automatic security updates
  apt-get install -y -qq unattended-upgrades
  dpkg-reconfigure -plow unattended-upgrades

  echo ""
  echo "============================================"
  echo "✅ VPS provisioned successfully!"
  echo "============================================"
  echo "Next: npm run deploy -- moltbot@YOUR_VPS_IP yourdomain.com"
REMOTE

echo ""
echo "✅ Provisioning complete!"
echo "   Deploy with: npm run deploy -- moltbot@${VPS#root@} yourdomain.com"
