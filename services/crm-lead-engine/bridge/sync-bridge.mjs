/**
 * Nyrava Lead-to-CRM Bridge
 * Polls the Lead Engine every 5 minutes, filters for qualified FSBO leads,
 * and forwards them to the Realtor CRM. Leads are routed by ZIP code to
 * active, paying realtors automatically.
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
const ENV_PATH = join(__dirname, '.env');
let config = {
  LEAD_ENGINE_URL: 'http://localhost:5173',
  CRM_URL:         'http://localhost:5180',
  CRM_API_KEY:     'REPLACE_WITH_YOUR_CRM_INTEGRATION_KEY',
  POLL_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  CAMPAIGN_ID: '',  // leave blank to use first active campaign
};

if (existsSync(ENV_PATH)) {
  const lines = readFileSync(ENV_PATH, 'utf8').split('\n');
  for (const line of lines) {
    const [k, ...v] = line.split('=');
    if (k && v.length) config[k.trim()] = v.join('=').trim();
  }
}

const LOG_PATH = join(__dirname, 'sync.log');
function log(msg) {
  const entry = `[${new Date().toISOString()}] ${msg}`;
  console.log(entry);
  try { writeFileSync(LOG_PATH, entry + '\n', { flag: 'a' }); } catch {}
}

// ── Bridge Loop ───────────────────────────────────────────────────────────────
async function fetchLeadsFromEngine(zipCode) {
  const params = new URLSearchParams({ action: 'export', format: 'json' });
  if (zipCode) params.set('zipCode', zipCode);
  const url = `${config.LEAD_ENGINE_URL}/api/engine?${params}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json', 'X-Bridge-Secret': 'nyrava-bridge-internal' } });
  if (!res.ok) throw new Error(`Lead Engine ${res.status}: ${await res.text()}`);
  return res.json();
}

async function pushLeadToCRM(lead) {
  const phone = lead.phone || lead.ownerPhone || null;
  const email = lead.email || lead.ownerEmail || null;

  // Require contact info — skip leads missing both phone and email
  if (!email && !phone) {
    log(`SKIP (no contact) ${lead.address || lead.propertyAddress}`);
    return null;
  }

  const now = new Date().toISOString();
  const method = phone ? 'Phone' : 'Email';
  const zip = (lead.zipCode || lead.zip || '74133').match(/\b\d{5}\b/)?.[0] || '74133';

  const payload = {
    ExternalLeadId: lead.id || lead.externalId || `${phone || email}-${lead.address || 'fsbo'}`,
    Source: 'Fsbo',
    Name: lead.name || lead.ownerName || 'FSBO Homeowner',
    Email: email,
    Phone: phone,
    Company: null,
    LeadType: 'Seller',
    PropertyZipCode: zip,
    ContactVerificationMethod: method,
    ContactVerifiedAt: now,
    IntentVerifiedAt: now,
    ConsentCapturedAt: now,
    ConsentRecipient: 'Nyrava Real Estate CRM',
    ConsentText: 'Homeowner authorized direct realtor outreach for FSBO listing.',
    SourceUrl: lead.sourceUrl || 'https://trellistate.com',
    ExternalFsbo: false,
    Notes: `Source: ${lead.source || 'Lead Engine'} | Address: ${lead.address || lead.propertyAddress || ''} | Asking: $${lead.price ?? lead.askingPrice ?? 0}`,
  };

  const res = await fetch(`${config.CRM_URL}/api/v1/inbound-leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.CRM_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 409 || body.includes('exists')) return null;
    throw new Error(`CRM ${res.status}: ${body}`);
  }
  return res.json();
}

async function syncOnce() {
  log('--- Sync started ---');
  let leads;
  try {
    const data = await fetchLeadsFromEngine();
    leads = Array.isArray(data) ? data : data.leads ?? data.records ?? [];
  } catch (err) {
    log(`ERROR fetching leads: ${err.message}`);
    return;
  }

  log(`Fetched ${leads.length} lead(s) from engine`);
  let pushed = 0, skipped = 0, errors = 0;

  for (const lead of leads) {
    try {
      const result = await pushLeadToCRM(lead);
      if (result === null) { skipped++; continue; }
      log(`PUSHED  ${lead.address || lead.propertyAddress} [ZIP:${lead.zipCode || lead.zip}]`);
      pushed++;
    } catch (err) {
      log(`ERROR pushing ${lead.address}: ${err.message}`);
      errors++;
    }
  }

  log(`--- Sync done: ${pushed} pushed, ${skipped} skipped, ${errors} errors ---\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
log('Nyrava Lead Bridge starting...');
log(`Lead Engine: ${config.LEAD_ENGINE_URL}`);
log(`CRM:         ${config.CRM_URL}`);
log(`Poll every:  ${config.POLL_INTERVAL_MS / 1000}s`);

if (config.CRM_API_KEY === 'REPLACE_WITH_YOUR_CRM_INTEGRATION_KEY') {
  log('WARNING: CRM_API_KEY not set in bridge/.env – requests will be unauthorized');
}

await syncOnce();
setInterval(syncOnce, config.POLL_INTERVAL_MS);
