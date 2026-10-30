/**
 * Nyrava FSBO Collector — All-in-One Live Multi-City Engine
 * Collects verified FSBO leads live and pushes them directly to your CRM.
 * Run: node run.mjs
 * Interval: every 5 minutes (continuous background daemon)
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { prospectFromListing, reviewedPayload, ingestionResult, upfrontContact } from './collector-policy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROSPECTS = join(__dirname, 'prospects.jsonl');
const REVIEWED = join(__dirname, 'reviewed-leads.jsonl');
const known = new Set();
if (existsSync(PROSPECTS)) for (const line of readFileSync(PROSPECTS,'utf8').split('\n')) { try { known.add(JSON.parse(line).externalId); } catch {} }
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
    if(k?.trim() && v.length) CFG[k.trim()]=v.join('=').trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}

for (const key of ['CRM_URL','CRM_API_KEY','INTERVAL_MS']) if (process.env[key]) CFG[key]=process.env[key];
CFG.INTERVAL_MS=Math.max(60000, Number(CFG.INTERVAL_MS)||300000);

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

// ── Live FSBO Multi-Metro Sources ─────────────────────────────────────────────

// ── Dynamic Subscriber Territory Detection ───────────────────────────────────
const CITY_METRO_MAP = {
  '77084': { city: 'Houston', state: 'TX', craig: 'houston' },
  '78701': { city: 'Austin', state: 'TX', craig: 'austin' },
  '78702': { city: 'Austin', state: 'TX', craig: 'austin' },
  '78703': { city: 'Austin', state: 'TX', craig: 'austin' },
  '78704': { city: 'Austin', state: 'TX', craig: 'austin' },
  '78705': { city: 'Austin', state: 'TX', craig: 'austin' },
  '75034': { city: 'Frisco', state: 'TX', craig: 'dallas' },
  '75217': { city: 'Dallas', state: 'TX', craig: 'dallas' },
  '30309': { city: 'Atlanta', state: 'GA', craig: 'atlanta' },
  '80206': { city: 'Denver', state: 'CO', craig: 'denver' },
  '33611': { city: 'Tampa', state: 'FL', craig: 'tampa' },
  '90210': { city: 'Los Angeles', state: 'CA', craig: 'losangeles' },
  '94107': { city: 'San Francisco', state: 'CA', craig: 'sfbay' },
  '85032': { city: 'Phoenix', state: 'AZ', craig: 'phoenix' },
  '33130': { city: 'Miami', state: 'FL', craig: 'miami' },
  '60601': { city: 'Chicago', state: 'IL', craig: 'chicago' },
  '98101': { city: 'Seattle', state: 'WA', craig: 'seattle' },
};

async function getActiveSources() {
  const dynamicSources = [];
  const coveredZips = new Set();

  try {
    const res = await fetch(`${CFG.CRM_URL}/api/v1/active-territories`, {signal:AbortSignal.timeout(10000)});
    if (res.ok) {
      const data = await res.json();
      const zips = data.activeZips || [];
      for (const zip of zips) {
        coveredZips.add(zip);
        const meta = CITY_METRO_MAP[zip];
        if (!meta) { log(`Territory ${zip}: source mapping required; no substitute city used.`); continue; }
        dynamicSources.push({
          name: `Craigslist FSBO (${meta.city} ${zip})`,
          city: meta.city,
          state: meta.state,
          zip: zip,
          url: `https://${meta.craig}.craigslist.org/jsonsearch/reo?query=for+sale+by+owner&postal=${encodeURIComponent(zip)}&search_distance=0`
        });
      }
    }
  } catch (e) {
    log(`  Notice: Using fallback territory feeds (${e.message})`);
  }

  // Always keep baseline multi-metro fallback sources
  for (const src of SOURCES) {
    if (!coveredZips.has(src.zip)) {
      dynamicSources.push(src);
    }
  }
  return dynamicSources;
}

const SOURCES = [
  { name: 'Craigslist FSBO (Atlanta)', city: 'Atlanta', state: 'GA', zip: '30309', url: 'https://atlanta.craigslist.org/jsonsearch/rea?query=for+sale+by+owner' },
  { name: 'Craigslist FSBO (Houston)', city: 'Houston', state: 'TX', zip: '77084', url: 'https://houston.craigslist.org/jsonsearch/rea?query=for+sale+by+owner' },
  { name: 'Craigslist FSBO (Dallas)', city: 'Dallas', state: 'TX', zip: '75217', url: 'https://dallas.craigslist.org/jsonsearch/rea?query=for+sale+by+owner' },
  { name: 'Craigslist FSBO (Austin)', city: 'Austin', state: 'TX', zip: '78701', url: 'https://austin.craigslist.org/jsonsearch/rea?query=for+sale+by+owner' },
  { name: 'Craigslist FSBO (Denver)', city: 'Denver', state: 'CO', zip: '80206', url: 'https://denver.craigslist.org/jsonsearch/rea?query=for+sale+by+owner' },
  { name: 'Craigslist FSBO (Tampa)', city: 'Tampa', state: 'FL', zip: '33611', url: 'https://tampa.craigslist.org/jsonsearch/rea?query=for+sale+by+owner' }
];

async function tryFetchCraigslist(source) {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(source.url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    clearTimeout(timeout);
    if (!res.ok) { log(`Source ${source.name}: HTTP ${res.status}`); return []; }
    const data = await res.json();
    const items = Array.isArray(data[0]) ? data[0] : Array.isArray(data) ? data : [];
    const leads = [];
    for (const item of items) {
      if (!item.PostingTitle || item.PostingTitle === 'undefined') continue;
      if (isRealtor(item.PostingTitle)) continue;

      const prospect = prospectFromListing(item, source);
      if (prospect) leads.push(prospect);
      if (leads.length >= 6) break; // Take top 6 per metro cycle to pace safely
    }
    return leads;
  } catch (err) {
    log(`Source fetch failed for ${source.name}: ${err.name}`);
    return [];
  }
}

async function collectLeads() {
  log('Collecting live FSBO leads across metro territories...');
  const all = [];
  const activeSources = await getActiveSources();
  for (const src of activeSources) {
    const leads = await tryFetchCraigslist(src);
    log(`  ${src.name}: ${leads.length} live FSBO listings found`);
    all.push(...leads);
  }
  return all; // Missing contact or ZIP stays in review; never fabricate it.
}

// ── Push to CRM ───────────────────────────────────────────────────────────────
async function post(path, payload) {
  const response = await fetch(`${CFG.CRM_URL}${path}`, {
    method:'POST', signal:AbortSignal.timeout(15000),
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${CFG.CRM_API_KEY}`},
    body:JSON.stringify(payload)
  });
  return ingestionResult(response.status);
}

let runCycle=0;
async function syncOnce() {
  runCycle++;
  const leads=await collectLeads();
  let discoveries=0,banked=0,created=0,existing=0,errors=0;
  for(const prospect of leads) {
    // Save before any network request, so CRM outages cannot discard discoveries.
    if(!known.has(prospect.externalId)) {
      writeFileSync(PROSPECTS,JSON.stringify(prospect)+'\n',{flag:'a',mode:0o600});
      known.add(prospect.externalId); discoveries++;
    }
  }
  // Retry locally saved prospects as well as this cycle's results.
  if(existsSync(PROSPECTS)) for(const line of readFileSync(PROSPECTS,'utf8').split('\n')) {
    if(!line.trim()) continue;
    try {
      const prospect=JSON.parse(line);
      if (!upfrontContact(prospect.title).eligible) continue; // Reject old saved contactless records too.
      const result=await post('/api/v1/prospects',prospect); if(result==='created') banked++;
    }
    catch { errors++; }
  }
  if(existsSync(REVIEWED)) for(const line of readFileSync(REVIEWED,'utf8').split('\n')) {
    if(!line.trim()) continue;
    try {
      const reviewed=JSON.parse(line);
      if (!upfrontContact(reviewed.title).eligible) continue;
      const payload=reviewedPayload(reviewed);
      if(!payload) { errors++; continue; }
      const result=await post('/api/v1/inbound-leads',payload);
      if(result==='created') created++; else existing++;
    } catch { errors++; }
  }
  log(`Cycle ${runCycle}: ${discoveries} new prospects saved, ${banked} added to admin review bank, ${created} reviewed leads created, ${existing} existing reviewed leads, ${errors} pending/errors`);
}

// ── Start Continuous Daemon ───────────────────────────────────────────────────
console.log('');
console.log('===============================================================');
console.log('  NYRAVA REAL-TIME FSBO LEAD GENERATOR (ACTIVE DAEMON)');
console.log('===============================================================');
console.log(`  CRM Endpoint: ${CFG.CRM_URL}`);
console.log(`  API Key:      ${CFG.CRM_API_KEY ? '✓ Authenticated' : '✗ MISSING'}`);
console.log(`  Interval:     Every ${CFG.INTERVAL_MS / 60000} minutes`);
console.log(`  Metros:       Atlanta, Houston, Dallas, Austin, Denver, Tampa`);
console.log(`  Active Log:   ${LOG}`);
console.log('===============================================================\n');

if (!CFG.CRM_API_KEY) {
  console.error('ERROR: CRM_API_KEY is not set in .env file!');
  process.exit(1);
}

async function tick() {
  try { await syncOnce(); } catch (error) { log(`Cycle failed: ${error.name}; saved prospects retained.`); }
  setTimeout(tick, CFG.INTERVAL_MS); // No overlapping cycles.
}
await tick();
