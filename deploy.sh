#!/bin/bash
# ===================================================================
# Nyrava Unified Platform - 1-Click Server Deployment Script
# Supports: Ubuntu, Debian, CentOS, AlmaLinux, Contabo VPS
# ===================================================================

set -e

echo "=========================================================="
echo "    NYRAVA UNIFIED PLATFORM - 1-CLICK SERVER DEPLOYMENT   "
echo "=========================================================="

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "[!] Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    systemctl enable --now docker
    rm -f get-docker.sh
    echo "[+] Docker installed successfully."
fi

# Check for Docker Compose plugin
if ! docker compose version &> /dev/null; then
    echo "[!] Docker Compose plugin not found. Installing..."
    apt-get update && apt-get install -y docker-compose-plugin || yum install -y docker-compose-plugin
fi

# Ensure .env exists
if [ ! -f .env ]; then
    echo "[*] Creating .env from .env.example..."
    cp .env.example .env
    echo "[!] Please review .env if you wish to customize domain names or SMTP."
fi

echo "[*] Building and launching all Nyrava platform services..."
docker compose up -d --build

echo ""
echo "=========================================================="
echo "    SUCCESS: ALL NYRAVA SERVICES ARE LIVE!               "
echo "=========================================================="
echo "Services status:"
docker compose ps
echo ""
echo "Access points:"
echo " - Web Portal:         http://localhost:3000"
echo " - Nyrava CRM:          http://localhost:5180"
echo " - Home Evaluation:    http://localhost:5190"
echo " - Meet Consultation:  http://localhost:5000"
echo " - Caddy Reverse Proxy: Port 80 / 443"
echo "=========================================================="
