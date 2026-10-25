# Nyrava CRM & Lead Generator

> **Proprietary software — All rights reserved © 2026 Nyrava Websites & Apps**

A fully integrated system that automatically collects verified **For Sale By Owner (FSBO)** leads and routes them to subscribing realtors on [home.nyrava.com](https://home.nyrava.com) based on their ZIP code territories.

---

## What's Included

| Component | Technology | Purpose |
|---|---|---|
| `lead-engine/` | Next.js · TypeScript · Cloudflare D1 | Collects FSBO leads with owner phone/email, zero realtors |
| `crm-app/` | ASP.NET Core 8 · C# · SQLite | Realtor CRM with ZIP routing, $299/mo subscriptions |
| `bridge/` | Node.js | Auto-syncs leads from engine → CRM every 5 minutes |

---

## Quick Start

### Requirements
- **Node.js** 18+
- **.NET SDK** 8.0+

### Launch Everything (Windows)

```batch
start.bat
```

Or with PowerShell:

```powershell
.\Start-System.ps1
```

This opens 3 windows:
- 🏠 **Realtor CRM** → `http://localhost:5180`
- 🔍 **Lead Engine** → `http://localhost:5173`
- 🔄 **Bridge** → syncs leads every 5 minutes automatically

---

## Bridge Setup

Copy `bridge/.env.example` to `bridge/.env` and fill in your CRM integration key:

```env
LEAD_ENGINE_URL=http://localhost:5173
CRM_URL=http://localhost:5180
CRM_API_KEY=your-crm-integration-key-here
POLL_INTERVAL_MS=300000
```

---

## How Lead Routing Works

```
FSBO Listings (Web / Social)
         │
         ▼
  Lead Engine (Next.js)
  ✓ Owner phone or email required
  ✓ Zero realtors / brokerages
  ✓ US 5-digit ZIP code verified
         │
         ▼ (every 5 min via Bridge)
  Realtor CRM (ASP.NET Core)
  ✓ Match PropertyZipCode → subscribed realtors
  ✓ Active $299/mo subscription required
  ✓ US / Canada / Mexico postal validation
  ✓ Lead delivered to matching realtor's workspace
```

---

## Subscription Rules (Nyrava)

- **Price:** $299 / month
- **Supported regions:** United States, Canada, Mexico
- **Postal formats:** US 5-digit, Canada A1A 1A1, Mexico 5-digit
- **Activation:** Only after confirmed payment
- **Territory:** Realtor sets covered ZIP codes via account settings

---

## Test Results

```
Lead Engine (Node.js):   28 / 28 tests pass ✅
Realtor CRM (.NET):      17 / 17 tests pass ✅
```

---

## License

Copyright © 2026 Nyrava Websites & Apps. All rights reserved.  
See [LICENSE](./LICENSE) for full terms. Unauthorized use or distribution is prohibited.

For licensing: **legal@nyrava.com** | [home.nyrava.com](https://home.nyrava.com)
