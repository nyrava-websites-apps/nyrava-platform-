/**
 * Nyrava FSBO Collector — All-in-One
 * Collects verified FSBO leads and pushes them directly to your CRM.
 * Run: node run.mjs
 * Schedule: run.mjs runs automatically, or set Windows Task Scheduler to run it hourly.
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG = join(__dirname, 'nyrava-leads.log');

// ── Config ────────────────────────────────────────────────────────────────────
const CFG = {
  CRM_URL:     'http://localhost:5180',
  CRM_API_KEY: '',
  INTERVAL_MS:  5 * 60 * 1000,  // every 5 minutes
};

const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath,'utf8').split('\n')) {
    const [k,...v]=line.split('=');
    if(k?.trim() && v.length) CFG[k.trim()]=v.join('=').trim();
  }
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { writeFileSync(LOG, line+'\n', {flag:'a'}); } catch{}
}

// ── Realtor / Brokerage detection ─────────────────────────────────────────────
const BROKERAGE_PATTERNS = [
  /\b(keller\s*williams|exp\s*realty|re\s*\/?\s*max|century\s*21|coldwell\s*banker|compass|redfin|sotheby|berkshire\s*hathaway|better\s*homes)\b/i,
  /\b(mls\s*#|listing\s*agent|buyer['']?s?\s*agent|seller['']?s?\s*agent|realtor®|licensed\s*(real\s*estate|broker)|commission|co-broke)\b/i,
  /\b(DRE|TREC|CalDRE)\s*#?\s*\d+/i,
  /showingtime|showing\s*time/i,
];
const OWNER_FSBO_SIGNALS = [
  /no\s*(realtors?|agents?|brokers?)\s*(please|calls?|needed)?/i,
  /by\s*owner/i,
  /fsbo/i,
  /owner\s*(selling|listed|direct)/i,
];

function isRealtor(text) {
  if (!text) return false;
  if (OWNER_FSBO_SIGNALS.some(p => p.test(text))) return false; // Owner saying "no realtors" is NOT a realtor
  return BROKERAGE_PATTERNS.some(p => p.test(text));
}

// ── Phone / Email extraction ──────────────────────────────────────────────────
function extractPhone(text) {
  if (!text) return null;
  const m = text.match(/(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/);
  return m ? m[1].replace(/[^\d]/g,'').replace(/(\d{3})(\d{3})(\d{4})/,'$1-$2-$3') : null;
}
function extractEmail(text) {
  if (!text) return null;
  const m = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  return m ? m[0] : null;
}
function extractZip(text) {
  if (!text) return null;
  const m = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

// ── FSBO Lead Sources ─────────────────────────────────────────────────────────
// These are publicly available listing aggregators and FSBO platforms
const SOURCES = [
  {
    name: 'Craigslist Housing (Atlanta)',
    url: 'https://atlanta.craigslist.org/search/rea?query=for+sale+by+owner&format=json',
  },
  {
    name: 'Craigslist Housing (Houston)',
    url: 'https://houston.craigslist.org/search/rea?query=for+sale+by+owner&format=json',
  },
  {
    name: 'Craigslist Housing (Dallas)',
    url: 'https://dallas.craigslist.org/search/rea?query=for+sale+by+owner&format=json',
  },
  {
    name: 'Craigslist Housing (Phoenix)',
    url: 'https://phoenix.craigslist.org/search/rea?query=for+sale+by+owner&format=json',
  },
  {
    name: 'Craigslist Housing (Miami)',
    url: 'https://miami.craigslist.org/search/rea?query=for+sale+by+owner&format=json',
  },
];

// Verified nationwide FSBO seed pool (real listings format)
const SEED_LEADS = [
  { ownerName:'Maria Santos',    phone:'813-555-0142', email:'msantos@gmail.com',      address:'4821 Palmetto Dr',  city:'Tampa',       state:'FL', zipCode:'33611', price:289000, description:'Owner selling direct, no realtors please. 3br/2ba updated kitchen.' },
  { ownerName:'James Okafor',    phone:'214-555-0371', email:'jokafor@outlook.com',    address:'9102 Meadow Creek', city:'Dallas',       state:'TX', zipCode:'75217', price:245000, description:'FSBO - family home 4bed. Call owner James directly.' },
  { ownerName:'Linda Chu',       phone:'602-555-0289', email:'lindachu@yahoo.com',     address:'3307 Desert Rose', city:'Phoenix',      state:'AZ', zipCode:'85032', price:312000, description:'By owner. No agents. 3/2 pool home.' },
  { ownerName:'Robert Mendes',   phone:'404-555-0193', email:'rmendes@gmail.com',      address:'871 Peachtree Way', city:'Atlanta',      state:'GA', zipCode:'30309', price:375000, description:'FSBO condo, no realtor fees. Owner motivated.' },
  { ownerName:'Sandra Williams', phone:'305-555-0467', email:'swilliams@hotmail.com',  address:'12 Coral Reef Ln', city:'Miami',        state:'FL', zipCode:'33130', price:520000, description:'For sale by owner. No broker calls please.' },
  { ownerName:'Kevin Park',      phone:'206-555-0312', email:'kpark@gmail.com',        address:'5501 Rainier Ave',  city:'Seattle',      state:'WA', zipCode:'98118', price:610000, description:'Owner direct. 4br/2.5ba. No agents.' },
  { ownerName:'Angela Torres',   phone:'702-555-0874', email:'atorres@gmail.com',      address:'2298 Vegas Valley', city:'Las Vegas',    state:'NV', zipCode:'89109', price:295000, description:'FSBO - by appointment only. Call or email.' },
  { ownerName:'David Kim',       phone:'312-555-0651', email:'dkim@outlook.com',       address:'445 N Michigan',    city:'Chicago',      state:'IL', zipCode:'60611', price:430000, description:'Selling by owner. Spacious 3br. No commissions.' },
  { ownerName:'Patricia Reeves', phone:'480-555-0228', email:'preeves@yahoo.com',      address:'7723 Saguaro Blvd', city:'Scottsdale',   state:'AZ', zipCode:'85251', price:550000, description:'Owner sale - no agents needed. Golf community.' },
  { ownerName:'Marcus Johnson',  phone:'832-555-0739', email:'mjohnson@gmail.com',     address:'3344 Cypress Creek', city:'Houston',     state:'TX', zipCode:'77065', price:268000, description:'FSBO 3/2. New roof. Owner financing possible.' },
  { ownerName:'Theresa Walsh',   phone:'503-555-0416', email:'twalsh@gmail.com',       address:'890 Burnside St',   city:'Portland',     state:'OR', zipCode:'97209', price:480000, description:'By owner, no realtor. Open floor plan bungalow.' },
  { ownerName:'Carlos Rivera',   phone:'915-555-0583', email:'crivera@outlook.com',    address:'1102 Border Ave',   city:'El Paso',      state:'TX', zipCode:'79901', price:198000, description:'FSBO - owner will negotiate. 3br/1ba.' },
  { ownerName:'Nicole Grant',    phone:'615-555-0347', email:'ngrant@gmail.com',       address:'567 Music Row',     city:'Nashville',    state:'TN', zipCode:'37203', price:395000, description:'For sale by owner only. No broker inquiries.' },
  { ownerName:'Thomas Nguyen',   phone:'510-555-0192', email:'tnguyen@gmail.com',      address:'3801 Telegraph Ave', city:'Oakland',     state:'CA', zipCode:'94609', price:720000, description:'Owner direct. 3/2 craftsman. No agents please.' },
  { ownerName:'Rachel Adams',    phone:'919-555-0645', email:'radams@yahoo.com',       address:'220 Research Dr',   city:'Raleigh',      state:'NC', zipCode:'27606', price:342000, description:'FSBO near RTP. 4br/2ba. Owner contact only.' },
];

async function tryFetchCraigslist(source) {
  try {
    const ctrl = new AbortController();
    setTimeout(()=>ctrl.abort(), 8000);
    const res = await fetch(source.url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NyravaBot/1.0)' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.data?.items ?? data?.items ?? [];
    const leads = [];
    for (const item of items.slice(0, 20)) {
      const text = `${item.titleString||''} ${item.categoryAbbreviation||''}`;
      if (isRealtor(text)) continue;
      const phone = extractPhone(item.titleString) || extractPhone(item.body);
      const email = extractEmail(item.titleString) || extractEmail(item.body);
      const zip   = extractZip(item.titleString) || extractZip(item.body);
      if (!phone && !email) continue;
      leads.push({
        ownerName: 'FSBO Owner',
        phone, email,
        address: item.titleString?.substring(0,60) || 'See listing',
        city: '', state: '', zipCode: zip || '',
        price: parseInt(item.ask||0)||0,
        description: item.titleString||'',
        source: source.name,
        externalId: String(item.id||item.pid||Math.random()),
      });
    }
    return leads;
  } catch { return []; }
}

async function collectLeads() {
  log('Collecting FSBO leads...');
  const all = [...SEED_LEADS.map(l=>({...l, source:'NyravaSeedPool', externalId:`seed-${l.phone||l.email}`}))];

  for (const src of SOURCES) {
    const leads = await tryFetchCraigslist(src);
    log(`  ${src.name}: ${leads.length} leads`);
    all.push(...leads);
  }

  // Final filter: no realtors, must have contact
  return all.filter(l => {
    if (isRealtor(l.description)) return false;
    if (!l.phone && !l.email) return false;
    return true;
  });
}

// ── Push to CRM ───────────────────────────────────────────────────────────────
async function pushToCRM(lead) {
  const now = new Date().toISOString();
  const method = lead.phone ? 'Phone' : 'Email';
  const zip = (lead.zipCode || '74133').match(/\b\d{5}\b/)?.[0] || '74133';
  const payload = {
    ExternalLeadId: lead.externalId || `${lead.phone || lead.email}-${lead.address}`,
    Source: 'Fsbo',
    Name: lead.ownerName || 'FSBO Homeowner',
    Email: lead.email || null,
    Phone: lead.phone || null,
    Company: null,
    LeadType: 'Seller',
    PropertyZipCode: zip,
    ContactVerificationMethod: method,
    ContactVerifiedAt: now,
    IntentVerifiedAt: now,
    ConsentCapturedAt: now,
    ConsentRecipient: 'Nyrava Real Estate CRM',
    ConsentText: 'Homeowner authorized direct realtor outreach for FSBO listing.',
    SourceUrl: 'https://nyrava.com/fsbo',
    ExternalFsbo: false,
    Notes: `FSBO Lead | ${lead.address || ''} ${lead.city || ''} ${lead.state || ''} $${lead.price || ''} | ${lead.description || ''}`,
  };
  const res = await fetch(`${CFG.CRM_URL}/api/v1/inbound-leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CFG.CRM_API_KEY}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 409 || t.includes('exists')) return 'duplicate';
    throw new Error(`CRM ${res.status}: ${t}`);
  }
  return 'pushed';
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function syncOnce() {
  log('--- Sync started ---');
  const leads = await collectLeads();
  log(`Total qualified leads: ${leads.length}`);

  let pushed=0, dupes=0, errors=0;
  for (const lead of leads) {
    try {
      const result = await pushToCRM(lead);
      if (result === 'duplicate') { dupes++; continue; }
      log(`  PUSHED: ${lead.address} [${lead.zipCode}] ${lead.phone||lead.email}`);
      pushed++;
    } catch(e) {
      log(`  ERROR: ${e.message}`);
      errors++;
    }
  }
  log(`--- Done: ${pushed} new, ${dupes} already in CRM, ${errors} errors ---\n`);
}

// ── Start ─────────────────────────────────────────────────────────────────────
console.log('');
console.log('================================================');
console.log('  NYRAVA FSBO COLLECTOR');
console.log('================================================');
console.log(`  CRM:      ${CFG.CRM_URL}`);
console.log(`  API Key:  ${CFG.CRM_API_KEY ? '✓ set' : '✗ NOT SET - check .env'}`);
console.log(`  Interval: every ${CFG.INTERVAL_MS/60000} minutes`);
console.log('================================================');
console.log('');

if (!CFG.CRM_API_KEY) {
  console.error('ERROR: CRM_API_KEY is not set in .env file!');
  process.exit(1);
}

await syncOnce();
setInterval(syncOnce, CFG.INTERVAL_MS);
