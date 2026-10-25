# Realtor CRM Integration Guide

This guide explains how to connect **Nyrava Lead Engine** directly to your **Realtor CRM website** so qualified FSBO homeowner leads are routed to your agents by ZIP code area.

---

## 1. What This System Guarantees
- **100% Realtor-Free:** Every listing is strictly screened to exclude real estate agents, brokerages (Keller Williams, eXp, RE/MAX, Century 21, Coldwell Banker, Compass, Redfin), MLS numbers, and agent licensing IDs.
- **Direct Owner Contacts:** Every qualified lead contains a direct homeowner phone number, email address, or both.
- **ZIP Code Routing:** Every lead includes standard 5-digit US ZIP codes and addresses so you can route them to local realtors based on territory.

---

## 2. Option A: Automatic Direct Webhook to Your CRM

If your Realtor CRM has a webhook endpoint (e.g. `https://your-realtor-crm.com/api/leads/fsbo`):

1. Open your Lead Engine Dashboard.
2. In **Campaigns**, click **Edit Rules**.
3. Enter your **CRM Webhook URL** and optional **API Key**.
4. Check **"Auto-forward leads to CRM on every pull"**.
5. Save.

Whenever you or an automated cron job pulls fresh leads, they will automatically be delivered in real time to your CRM endpoint as a JSON payload:

```json
{
  "event": "auto_fsbo_leads",
  "timestamp": "2026-10-24T20:00:00Z",
  "total": 4,
  "leads": [
    {
      "name": "Robert Miller",
      "phone": "+18134429182",
      "email": "tampahomeowner21@gmail.com",
      "address": "4218 W Barcelona St",
      "city": "Tampa",
      "state": "FL",
      "zipCode": "33629",
      "title": "FSBO: 3 Bed 2 Bath Single Family Home with Pool",
      "description": "Selling our family home directly as For Sale By Owner (FSBO)...",
      "isRealtorFree": true
    }
  ]
}
```

---

## 3. Option B: Your Realtor CRM Pulls Leads by ZIP Code Area

Your CRM website can query leads on-demand for any specific realtor's territory:

### Request:
```http
GET /api/engine?action=export&queue=prospect&format=json&zipCode=78701
```

### Response:
```json
{
  "schemaVersion": "1.1",
  "crmTarget": "realtor_fsbo_routing",
  "exportedAt": "2026-10-24T20:00:00.000Z",
  "total": 1,
  "records": [
    {
      "name": "David Sterling",
      "phone": "+15128832041",
      "email": "austin.fsbo.direct@outlook.com",
      "address": "812 Colorado St",
      "city": "Austin",
      "state": "TX",
      "zipCode": "78701",
      "listingClass": "CONFIRMED_FSBO",
      "isRealtorFree": true
    }
  ]
}
```

---

## 4. Option C: Receive Leads from Social Media Scrapers (Inbound Webhook)

To funnel leads from Facebook Marketplace scrapers, Apify actors, Craigslist feeds, or Zapier/Make into your site:

### Endpoint:
```http
POST /api/engine?action=webhook&campaign=YOUR_CAMPAIGN_ID
Content-Type: application/json
```

### Payload:
```json
{
  "title": "FSBO: 3 Bed 2 Bath in Austin",
  "description": "Selling our home by owner. No realtors. Call 512-883-2041",
  "phone": "512-883-2041",
  "email": "austin.fsbo.direct@outlook.com",
  "address": "812 Colorado St",
  "city": "Austin",
  "state": "TX",
  "zipCode": "78701",
  "country": "US"
}
```

---

## 5. Webhook Receiver Code Example for Your Realtor CRM

### Node.js / Express or Next.js API Route:
```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const leads = body.leads || [body];

  for (const lead of leads) {
    // 1. Check territory by ZIP Code
    const targetZip = lead.zipCode;

    // 2. Assign lead to local Realtor in your database
    console.log(`Assigning FSBO lead ${lead.name} (${lead.phone}) to Realtor covering ZIP ${targetZip}`);

    // await db.leads.create({
    //   data: {
    //     ownerName: lead.name,
    //     ownerPhone: lead.phone,
    //     ownerEmail: lead.email,
    //     propertyAddress: lead.address,
    //     zipCode: lead.zipCode,
    //     state: lead.state,
    //     source: lead.sourceUrl
    //   }
    // });
  }

  return NextResponse.json({ success: true, count: leads.length });
}
```
