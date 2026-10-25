# 🏡 Nyrava Home Evaluation — Commercial Standalone App

> **Turnkey Real Estate Automated Valuation Model (AVM) & High-Intent Lead Generation Software**  
> Built for Realtors, Brokerages, and Real Estate Marketing Agencies.  
> Official GitHub Repository: **[https://github.com/nyrava-websites-apps/nyrava-home-evaluation](https://github.com/nyrava-websites-apps/nyrava-home-evaluation)**

---

## 🌟 What This Software Does

**Nyrava Home Evaluation** is a standalone, white-labelable web application that acts as a 24/7 client magnet for real estate professionals.

1. **Mandatory Lead Gate:** Homeowners input their property address and living specs alongside their **Full Name, Verified Mobile Phone, and Email** to request an official evaluation report.
2. **Real Local Comparative Valuation Engine (AVM):** Generates accurate property valuations based on real localized price-per-square-foot baseline data, bedroom/bathroom ratios, condition adjustments, and 3 localized sold comps in their exact ZIP code.
3. **Automated CRM Pipeline Ingestion:** The moment a valuation is generated, the lead is pushed directly into **Nyrava CRM** with verified provenance, seller timeframe, and TCPA consent records. If an area Realtor covers that ZIP, the CRM dispatches it to them automatically.
4. **Branded Email Report with 1-Click Realtor Opt-Out:** An automated HTML valuation report is delivered to the homeowner's inbox with your custom logo and branding. It features a compliant **1-Click Opt-Out Button**, giving the consumer full control over whether an area Realtor contacts them to help sell their home.

---

## 🔌 1. Platform & CRM Connection Instructions

Connecting Nyrava Home Evaluation to your Nyrava CRM takes under 2 minutes:

### Step 1: Locate or Create Your CRM Integration Key
1. Log into your **Nyrava CRM Platform** (e.g. `http://localhost:5180`).
2. Navigate to **Lead integrations** in the left navigation sidebar.
3. Under **Create integration key**, enter `Nyrava Home Evaluation` and click **Create integration key**.
4. Copy the generated secret token (e.g. `nycrm_JVsFAh7zwIJo-iejVRvl3UZ7APQ1zyNC7_0ai7c9a9A`).

### Step 2: Configure `config.json`
Open `config.json` in the root of the app and set:
```json
{
  "port": 5190,
  "publicUrl": "http://localhost:5190",
  "crmApiUrl": "http://localhost:5180",
  "crmIntegrationKey": "nycrm_JVsFAh7zwIJo-iejVRvl3UZ7APQ1zyNC7_0ai7c9a9A"
}
```

### Step 3: How Leads Flow into Nyrava CRM
* Every submitted valuation makes an authenticated HTTP `POST` to `/api/v1/inbound-leads`.
* The lead enters the **Platform Owner Master Bank** with `Source: HomeEvaluation`.
* **Territory Dispatching:** If a subscribed Realtor covers that lead's ZIP code (e.g. `78701`, `77084`, etc.), the CRM automatically transfers the lead to that Realtor's workspace (up to the daily quota of 2 leads/zip/day).

---

## 📧 2. Email SMTP Setup Instructions

The application automatically delivers a branded HTML valuation report to the homeowner with a direct 1-click Realtor Opt-Out link.

### Option A: Free Gmail Setup (Recommended for 1–500 emails/day)
1. Go to your **Google Account** > **Security** > **2-Step Verification**.
2. Scroll to the bottom and click **App passwords**.
3. Create a new app password named `Nyrava Valuation` and copy the 16-character code.
4. Update `config.json`:
```json
"smtp": {
  "host": "smtp.gmail.com",
  "port": 587,
  "user": "youraccount@gmail.com",
  "pass": "your-16-character-app-password",
  "from": "\"Nyrava Home Evaluation\" <youraccount@gmail.com>"
}
```

### Option B: Professional Provider (SendGrid / Postmark / Amazon SES)
```json
"smtp": {
  "host": "smtp.sendgrid.net",
  "port": 587,
  "user": "apikey",
  "pass": "YOUR_SENDGRID_API_KEY",
  "from": "\"Premier Realty Group\" <valuations@yourdomain.com>"
}
```

### Option C: Development / Local Testing Mode (Zero Config)
If SMTP credentials are not configured, the app **automatically saves every email to the `outbox/` folder** in HTML format with instant clickable opt-out preview links logged in the server console.

---

## ⚖️ 3. The 1-Click Realtor Opt-Out & Legal Compliance

To comply with federal **TCPA regulations**, the **National Do-Not-Call Registry**, and the **CAN-SPAM Act**, every report email includes:

```
Prefer not to be contacted by an area Realtor?
If you only requested this report for research and do not wish to be contacted
by a local Realtor to help sell your home, click below to opt out:
[Opt Out of Realtor Assistance]
```

### How the Opt-Out Works
1. Homeowner clicks the **Opt Out** button in their email.
2. The server processes `GET /opt-out?leadId=...&email=...`.
3. The consumer receives a reassurance confirmation page:  
   *`"✅ You have successfully opted out. Your preference has been registered and no area specialists will contact you regarding this property."`*
4. The system logs the opt-out preference, protecting you and your realtors from unsolicited contact complaints.

---

## 💻 4. 1-Line Website Embedding (For Selling to Realtors)

Any Realtor, team, or brokerage who purchases this software can embed it on their website in under 60 seconds:

```html
<!-- 1. Add this placeholder where the valuation widget should display -->
<div id="nyrava-evaluation-widget"></div>

<!-- 2. Add this script before </body> -->
<script src="http://localhost:5190/embed.js" data-container="nyrava-evaluation-widget"></script>
```

Compatible with:
* **WordPress** (via Custom HTML Block or Elementor)
* **Squarespace** (Code Block)
* **Wix** (Custom Embed iFrame)
* **Webflow** (HTML Embed Component)
* **Custom Landing Pages / Lead Funnels**

---

## 💰 5. How to Package & Sell This Software

You can commercialize this application under three proven real estate software pricing models:

1. **Monthly Subscription per Agent ($49–$99/month):** Provide agents their own branded embed link with direct lead routing into their CRM workspace.
2. **Team / Brokerage Tier ($299–$499/month):** Multi-ZIP coverage where incoming leads are round-robined to team members.
3. **Turnkey Setup Fee ($500–$1,500 one-time):** Full white-label branding, custom domain deployment, and integration into their existing site.

---

## 🛠️ Quick Installation & Startup

```bash
# 1. Clone repository
git clone https://github.com/nyrava-websites-apps/nyrava-home-evaluation.git
cd nyrava-home-evaluation

# 2. Install dependencies
npm install

# 3. Start server
node server.mjs
```
The app runs on **`http://localhost:5190`**.

---

## 📄 License
Commercial Software License. Copyright © 2026 Nyrava Websites & Apps. All rights reserved.  
See [LICENSE](LICENSE) for commercial terms and embedding rights.
