# Nyrava Unified Platform (V2)

A production-ready, turn-key real estate intelligence ecosystem uniting public web presence, AI sales assistant, automated home valuations, Realtor territory CRM, and client video meeting rooms.

---

## Architecture & Decoupled Microservices

```
                           Internet / Custom Domain
                                      │
                         ┌────────────┴────────────┐
                         │   Caddy / Nginx Proxy   │
                         │ (Auto-SSL Let's Encrypt)│
                         └────────────┬────────────┘
         ┌─────────────────┬──────────┴────────┬─────────────────┐
         │                 │                   │                 │
         ▼                 ▼                   ▼                 ▼
┌──────────────────┐ ┌───────────┐ ┌───────────────────┐ ┌───────────────────┐
│   Web Portal     │ │Nyrava CRM │ │  Home Evaluation  │ │ Nyrava Team Meet  │
│(home.nyrava.com) │ │ & Leads   │ │ (value.nyrava.com)│ │ (meet.nyrava.com) │
│   Port 3000      │ │ Port 5180 │ │    Port 5190      │ │    Port 5000      │
│                  │ │           │ │                   │ │                   │
│ • Nyra AI Bot    │ │ • 60 ZIPs │ │ • 50-State AVM    │ │ • Multi-Party WebRTC
│ • Move Planner   │ │ • Master  │ │ • Verified Comps  │ │ • Screen Share    │
│ • Territory Check│ │   Bank    │ │ • 1-Click Opt-Out │ │ • Embed SDK API   │
└──────────────────┘ └───────────┘ └───────────────────┘ └───────────────────┘
         │                 ▲                   │
         │                 │                   │
         └─────────────────┴───────────────────┘
          Auto-dispatches verified leads by ZIP
```

---

## 1. Webhooks & API Integration Keys

All services in this repository are pre-configured to communicate seamlessly:

| Integration | Endpoint / URL | Method | Auth / Headers | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Nyrava CRM Ingest** | `http://localhost:5180/api/v1/inbound-leads` | `POST` | `Authorization: Bearer nycrm_JVsFAh7zwIJo-iejVRvl3UZ7APQ1zyNC7_0ai7c9a9A` | Dispatches inbound leads to Master Bank and routes to subscribed Realtors by ZIP. |
| **Nyra AI Sales Bot** | `http://localhost:3000/api/nyra/v1/respond` | `POST` | Public / None | Interactive site tour, topic guides, and voice answers. |
| **Nyra AI Conversation**| `http://localhost:3000/api/nyra/v1/conversation` | `POST` | Public (Optional OpenAI key) | Natural conversational AI real estate assistant. |
| **Move Planner Intake** | `http://localhost:3000/api/inquiries` | `POST` | Internal Portal Bridge | Receives Buyer/Seller move inquiries and delivers to CRM. |
| **Instant Valuation** | `http://localhost:5190/api/valuation/evaluate` | `POST` | Direct / Proxy | Calculates 50-state comps, price/sqft, and equity growth. |
| **Territory Check** | `http://localhost:3000/api/territories/check/:zip` | `GET` | Public | Real-time ZIP subscriber capacity check (2 slots per ZIP). |
| **1-Click Opt-Out** | `http://localhost:5190/opt-out?leadId=...&email=...` | `GET` | Public | CAN-SPAM compliant 1-click opt-out link in every report. |

---

## 2. Server Installation & Setup Instructions

### Prerequisites
- A Linux VPS (Ubuntu 22.04 / 24.04, Debian 12, or Contabo)
- Minimum: 2 vCPU, 4GB RAM, 40GB SSD
- Domain DNS pointing to your server IP (e.g. `home.nyrava.com`, `crm.nyrava.com`, etc.)

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/nyrava-websites-apps/nyrava-platform-.git /var/www/nyrava-platform
cd /var/www/nyrava-platform
```

---

### Step 2: Configure Environment (`.env`)
```bash
cp .env.example .env
nano .env
```
Update with your domain names and optional email credentials:
```env
# ===================================================================
# DOMAINS (Automatic HTTPS issued by Caddy via Let's Encrypt)
# ===================================================================
PORTAL_DOMAIN=home.nyrava.com
CRM_DOMAIN=crm.nyrava.com
VALUATION_DOMAIN=value.nyrava.com
MEET_DOMAIN=meet.nyrava.com

# ===================================================================
# EMAIL SMTP CONFIGURATION (For Automated Valuation Reports)
# ===================================================================
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-or-postmark-key
EMAIL_FROM=Nyrava Home <evaluations@nyrava.com>

# ===================================================================
# OPTIONAL AI BOT CONFIGURATION (OpenAI / OpenRouter)
# If omitted, Nyra uses built-in high-precision real estate models
# ===================================================================
OPENAI_API_KEY=sk-...
```

---

### Step 3: Run the 1-Click Server Deployer
```bash
chmod +x deploy.sh
./deploy.sh
```

**What the installer does automatically:**
1. Installs Docker & Docker Compose if not already present.
2. Builds and starts all 4 containerized microservices.
3. Configures Caddy reverse proxy on Ports 80 & 443 with automatic SSL certificates.
4. Verifies health checks across all services.

To check service status at any time:
```bash
docker compose ps
docker compose logs -f
```

---

## 3. Local Development (Windows)

To run all 4 services locally on your Windows computer:
1. Double-click `start-local.bat` (or run `./start-local.bat` in PowerShell).
2. Open your browser to:
   - **Frontend & AI Bot:** `http://localhost:3000`
   - **Realtor CRM:** `http://localhost:5180`
   - **Valuation Tool:** `http://localhost:5190`
   - **Video Meet:** `http://localhost:5000`

---

## 4. How the Automated Lead Routing Pipeline Works

1. **Consumer Inquiry:** A homeowner requests a valuation on `home.nyrava.com` or submits a move inquiry via *"Find a Realtor"*.
2. **Contact & Consent Verification:** Full Name, Email, Phone, and Consent are required.
3. **Territory Dispatch:** The inquiry is pushed to the CRM. If a subscribed Realtor covers that ZIP (e.g. `78701`), the CRM automatically assigns the contact to that Realtor's private workspace. If not yet claimed, it is stored in the Admin Master Bank.
4. **Automated Follow-up:** The homeowner receives an email with their property summary and a 1-click Realtor opt-out link.
