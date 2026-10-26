# Nyrava Microservices Deployment & Subdomain Routing Manual

> **Production Guide for Codex & DevOps Teams**  
> Covers DNS configuration, reverse proxy setup, repository links, environment parameters, and process orchestration across all Nyrava subdomains.

---

## 1. Production Repositories & Mirrors

### Primary Monorepo (Production Source of Truth)
* **GitHub URL:** [`https://github.com/nyrava-websites-apps/nyrava-platform-.git`](https://github.com/nyrava-websites-apps/nyrava-platform-.git)
* **Default Branch:** `main`
* **Architecture:** Unified microservices repository containing all 4 platform services in `/services`.

### Auxiliary Micro-Repos (Mirrors)
* **CRM Service:** [`https://github.com/nyrava-websites-apps/nyrava-crm-app.git`](https://github.com/nyrava-websites-apps/nyrava-crm-app.git)
* **Valuation Engine:** [`https://github.com/nyrava-websites-apps/nyrava-home-evaluation.git`](https://github.com/nyrava-websites-apps/nyrava-home-evaluation.git)
* **Commerce / Billing:** [`https://github.com/nyrava-websites-apps/nyrava-commerce.git`](https://github.com/nyrava-websites-apps/nyrava-commerce.git)

---

## 2. Microservices Architecture & Port Allocations

```
                     [ Internet / Clients ]
                               |
                        HTTPS (Port 443)
                               v
                     [ Caddy / Nginx Proxy ]
       +-----------------------+-----------------------+
       |                       |                       |
       v                       v                       v
home.nyrava.com          crm.nyrava.com         value.nyrava.com        meet.nyrava.com
(Web Portal)             (CRM & Lead Engine)    (Home Evaluation)       (Video Meet)
Port 3000 (Node)         Port 5180 (.NET 8)     Port 5190 (Node)        Port 5000 (Node/WS)
```

| Subdomain | Service Folder | Tech Stack | Local Port | Role & Capabilities |
| :--- | :--- | :--- | :---: | :--- |
| **`home.nyrava.com`** | `services/web-portal` | Node.js (ESM) | `3000` | Main consumer website, buy/sell intake dialogs, pricing |
| **`crm.nyrava.com`** | `services/crm-lead-engine/crm-app` | .NET 8 (Kestrel) | `5180` | Realtor CRM, lead pipeline, team chat, Nyra AI concierge |
| **`crm.nyrava.com`** | `services/crm-lead-engine` | Node.js | Daemon | 30-minute continuous lead ingestion across 70 ZIP codes |
| **`value.nyrava.com`** | `services/home-evaluation` | Node.js (ESM) | `5190` | Automated valuation model, private agent CMA calculator |
| **`meet.nyrava.com`** | `services/meet-consultation` | Node.js / WS | `5000` | Instant HD video consultation rooms, screen sharing |

---

## 3. DNS Records to Create

At your domain registrar (Cloudflare, AWS Route 53, GoDaddy, Namecheap):

| Type | Name / Host | Target Value | Proxy Status (Cloudflare) | Notes |
| :---: | :--- | :--- | :---: | :--- |
| **A** | `home` | `<YOUR_SERVER_IP>` | Proxied (Orange) | Main public portal |
| **A** | `crm` | `<YOUR_SERVER_IP>` | Proxied (Orange) | Realtor workspace |
| **A** | `value` | `<YOUR_SERVER_IP>` | Proxied (Orange) | Evaluation & CMA tool |
| **A** | `meet` | `<YOUR_SERVER_IP>` | **DNS Only (Grey)** | Required for direct WebRTC/UDP media streams |
| **A** | `api` | `<YOUR_SERVER_IP>` | Proxied (Orange) | Optional API Gateway endpoint |

---

## 4. Server Firewall Configuration (Linux UFW)

```bash
# Web traffic
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Video meeting WebSocket and WebRTC media ports
sudo ufw allow 5000/tcp
sudo ufw allow 10000:20000/udp

sudo ufw enable
```

---

## 5. Reverse Proxy Configuration

### Option A: Caddyfile (`/etc/caddy/Caddyfile`) — *Recommended*
*Caddy provisions and renews SSL certificates from Let's Encrypt automatically.*

```caddy
# 1. Main Website & Web Portal
home.nyrava.com {
    reverse_proxy 127.0.0.1:3000
    encode zstd gzip
}

# 2. Realtor CRM & Workspace
crm.nyrava.com {
    reverse_proxy 127.0.0.1:5180
    encode zstd gzip
}

# 3. Property Valuation & CMA Tool
value.nyrava.com {
    reverse_proxy 127.0.0.1:5190
    encode zstd gzip
}

# 4. Instant Video Consultation Rooms
meet.nyrava.com {
    reverse_proxy 127.0.0.1:5000 {
        header_up Host {host}
        header_up X-Real-IP {remote}
    }
}
```

### Option B: Nginx (`/etc/nginx/sites-available/nyrava.conf`)

```nginx
# 1. home.nyrava.com
server {
    listen 80;
    server_name home.nyrava.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# 2. crm.nyrava.com
server {
    listen 80;
    server_name crm.nyrava.com;
    location / {
        proxy_pass http://127.0.0.1:5180;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# 3. value.nyrava.com
server {
    listen 80;
    server_name value.nyrava.com;
    location / {
        proxy_pass http://127.0.0.1:5190;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# 4. meet.nyrava.com (WebSocket Enabled)
server {
    listen 80;
    server_name meet.nyrava.com;
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
*(Run `sudo certbot --nginx` to attach HTTPS certificates).*

---

## 6. Service Installation & Execution Details

### 1. Web Portal (`services/web-portal`)
```bash
cd services/web-portal
npm install
```
Configure `services/web-portal/.env`:
```env
PORT=3000
CRM_URL=https://crm.nyrava.com
VALUATION_URL=https://value.nyrava.com
MEET_URL=https://meet.nyrava.com
NODE_ENV=production
```
Start command:
```bash
pm2 start server.mjs --name "nyrava-portal"
```

---

### 2. Nyra CRM App & Daemon (`services/crm-lead-engine`)
```bash
# 1. Build .NET 8 Backend
cd services/crm-lead-engine/crm-app
dotnet restore
dotnet build --configuration Release

# 2. Launch CRM on port 5180
pm2 start "dotnet run --configuration Release --no-build --urls http://127.0.0.1:5180" --name "nyrava-crm" --cwd "./services/crm-lead-engine/crm-app"

# 3. Launch 30-Minute Continuous Lead Engine Daemon
cd ..
pm2 start run.mjs --name "nyrava-lead-daemon"
```

---

### 3. Home Evaluation Engine (`services/home-evaluation`)
```bash
cd services/home-evaluation
npm install
```
Configure `services/home-evaluation/config.json`:
```json
{
  "port": 5190,
  "publicUrl": "https://value.nyrava.com",
  "crmApiUrl": "https://crm.nyrava.com",
  "crmIntegrationKey": "nycrm_JVsFAh7zwIJo-iejVRvl3UZ7APQ1zyNC7_0ai7c9a9A",
  "branding": {
    "appName": "Nyrava Home Valuation",
    "companyName": "Nyrava Home",
    "supportEmail": "support@home.nyrava.com",
    "accentColor": "#0066ff"
  }
}
```
Start command:
```bash
pm2 start server.mjs --name "nyrava-valuation"
```

> **Private Valuation Mode:** When realtors access `https://value.nyrava.com/?mode=agent&private=true` (or via the CRM sidebar), the service automatically activates private calculation mode (`isAgentTool = true`), calculating comps and 3-year equity without pushing a lead to the CRM.

---

### 4. Nyra Video Meet (`services/meet-consultation`)
```bash
cd services/meet-consultation
npm install
pm2 start server.mjs --name "nyrava-meet"
```

---

## 7. Persistence & Process Verification

```bash
# Save active process list for server reboot resilience
pm2 save
pm2 startup

# Check live health of all microservices
pm2 status
```

Expected PM2 status output:
```
┌────┬──────────────────────┬─────────────┬─────────┬─────────┬──────────┐
│ id │ name                 │ mode        │ status  │ cpu     │ memory   │
├────┼──────────────────────┼─────────────┼─────────┼─────────┼──────────┤
│ 0  │ nyrava-portal        │ fork        │ online  │ 0.1%    │ 42.0mb   │
│ 1  │ nyrava-crm           │ fork        │ online  │ 0.2%    │ 85.4mb   │
│ 2  │ nyrava-lead-daemon   │ fork        │ online  │ 0.0%    │ 38.1mb   │
│ 3  │ nyrava-valuation     │ fork        │ online  │ 0.1%    │ 40.2mb   │
│ 4  │ nyrava-meet          │ fork        │ online  │ 0.1%    │ 36.8mb   │
└────┴──────────────────────┴─────────────┴─────────┴─────────┴──────────┘
```

---

## 8. Verification Checklist

* [ ] `https://home.nyrava.com` loads the landing page and intake flow with TLS active.
* [ ] `https://crm.nyrava.com` opens the dark midnight navy Realtor Workspace with Chat Support and Nyra AI assistant.
* [ ] In CRM, clicking `Private Valuation ↗` opens the rebranded valuation engine without creating CRM leads.
* [ ] In CRM, clicking `Launch Video Meeting` opens `https://meet.nyrava.com` with microphone and camera signaling.
* [ ] `nyrava-lead-daemon` logs successful ingestion cycles every 30 minutes.
