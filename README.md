# Nyrava Unified Platform (V2)

A modular, production-ready real estate technology ecosystem orchestrating public web presence, automated home valuations, Realtor territory CRM, and encrypted client video consultations.

---

## Architecture Overview

```
                      Internet / Domain DNS
                                │
                   ┌────────────┴────────────┐
                   │   Caddy / Nginx Proxy   │
                   │ (Auto-SSL Let's Encrypt)│
                   └────────────┬────────────┘
         ┌───────────────┬──────┴────────┬───────────────┐
         │               │               │               │
         ▼               ▼               ▼               ▼
┌─────────────────┐ ┌─────────┐ ┌─────────────────┐ ┌─────────┐
│   Web Portal    │ │Nyrava   │ │ Home Evaluation │ │ Nyrava  │
│(home.nyrava.com)│ │CRM &    │ │(value.nyrava.com│ │  Meet   │
│   Port 3000     │ │Leads    │ │   Port 5190     │ │Port 5000│
│                 │ │Port 5180│ │                 │ │         │
└─────────────────┘ └─────────┘ └─────────────────┘ └─────────┘
         │               ▲               │
         │               │               │
         └───────────────┴───────────────┘
          Auto-dispatches verified leads
```

### The 4 Core Decoupled Services

| Service | Port | Directory | Description |
| :--- | :--- | :--- | :--- |
| **Web Portal** | `3000` | `services/web-portal` | Modern public landing page, interactive valuation calculator, lead capture modal, navigation. |
| **CRM & Lead Engine** | `5180` | `services/crm-lead-engine` | Master Bank scanning 60 US metro ZIPs, Realtor territory dispatching, pipeline triage, calendar. |
| **Home Evaluation** | `5190` | `services/home-evaluation` | Standalone AVM calculation engine across 50 states, verified lead gating, automated email & 1-click opt-out. |
| **Meet Consultation** | `5000` | `services/meet-consultation` | Encrypted WebRTC private video & voice consultations, screen sharing, and Nyra AI real estate assistant. |

---

## 1-Command Server Deployment (Contabo / Ubuntu / Debian VPS)

### Step 1: Clone onto your Server
```bash
git clone https://github.com/nyrava-websites-apps/nyrava-platform.git
cd nyrava-platform
```

### Step 2: Set your Domains & SMTP (Optional)
```bash
cp .env.example .env
nano .env
```
*(You can leave default localhost values for previewing on a new IP/domain without touching `home.nyrava.com`.)*

### Step 3: Run the 1-Click Installer
```bash
chmod +x deploy.sh
./deploy.sh
```
Or with Docker Compose directly:
```bash
docker compose up -d --build
```

**That's it!** Caddy will automatically issue and manage SSL certificates from Let's Encrypt for all configured domains.

---

## Zero Impact on Live Site Guarantee

This package is completely isolated in its own repository and container environment:
- The existing `home.nyrava` repository and current live server remain **100% untouched**.
- You can test this entire package on a new server, staging domain (e.g. `preview.nyrava.com`, `app.nyrava.com`), or test IP before switching production DNS.
- When you are ready to point `home.nyrava.com` to the new server, you simply update your domain's DNS A-Record.

---

## Running Locally on Windows (Without Docker)

Double-click `start-local.bat` or run:
```powershell
./start-local.bat
```
This automatically boots all 4 services concurrently in separate console windows.

---

## API & Health Endpoints

- Web Portal Health: `GET http://localhost:3000/health`
- CRM API: `GET http://localhost:5180/api/v1/master-bank`
- Valuation Engine: `POST http://localhost:5190/api/v1/valuation/evaluate`
- Meet Consultation Health: `GET http://localhost:5000/health`
