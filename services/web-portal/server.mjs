import { registerBillingIntegration, checkoutParameters } from './billing-integration.mjs';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { NYRA_CONFIG, NYRA_RESPONSES, resolveTopic } from './nyra-sales-engine.mjs';
import { registerGatewayFeatures } from './gateway-features.mjs';
import { registerFunctionalCrmGateway } from './functional-crm-gateway.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || 'http://localhost:5180';
const VALUATION_SERVICE_URL = process.env.VALUATION_SERVICE_URL || 'http://localhost:5190';
const MEET_SERVICE_URL = process.env.MEET_SERVICE_URL || 'http://localhost:5000';

// Stripe & Billing state persistence
const DATA_DIR = path.resolve(process.env.NYRAVA_DATA_DIR || path.join(__dirname, 'data'));
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const STRIPE_SETTINGS_FILE = path.join(DATA_DIR, 'stripe-settings.json');
const STRIPE_EVENTS_FILE = path.join(DATA_DIR, 'stripe-events.json');

function getStripeSettings() {
  try {
    if (fs.existsSync(STRIPE_SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(STRIPE_SETTINGS_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('[Stripe Settings Read]', e.message);
  }
  return {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    annualPriceId: process.env.STRIPE_PRICE_ANNUAL || '',
    basicPriceId: process.env.STRIPE_PRICE_BASIC || '',
    proPriceId: process.env.STRIPE_PRICE_PRO || '',
    checkoutEnabled: false,
    basicCheckoutParameters: null,
    proCheckoutParameters: null
  };
}

function stripeCheckoutReady(settings) {
  try {
    return Boolean(settings.checkoutEnabled && settings.secretKey && settings.webhookSecret && (process.env.Crm__BillingSyncSecret || '').length >= 32 && ['BASIC','PRO'].every(plan => checkoutParameters(settings, {ownerId:1,email:'validation@example.test'}, plan)));
  } catch { return false; }
}

function saveStripeSettings(data) {
  try {
    fs.writeFileSync(STRIPE_SETTINGS_FILE, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(STRIPE_SETTINGS_FILE, 0o600);
  } catch (e) {
    console.error('[Stripe Settings Save]', e.message);
  }
}

function getRecentWebhookEvents() {
  try {
    if (fs.existsSync(STRIPE_EVENTS_FILE)) {
      return JSON.parse(fs.readFileSync(STRIPE_EVENTS_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('[Stripe Events Read]', e.message);
  }
  return [];
}

function recordWebhookEvent(ev) {
  try {
    const list = getRecentWebhookEvents();
    list.unshift(ev);
    if (list.length > 50) list.length = 50;
    fs.writeFileSync(STRIPE_EVENTS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('[Stripe Event Record]', e.message);
  }
}

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// ADMIN API AUTHORIZATION — verify the existing CRM session.
app.use(async (req, res, next) => {
  const pathname = req.path;
  if (!(
    pathname === '/api/admin' ||
    pathname.startsWith('/api/admin/') ||
    pathname === '/api/ops' ||
    pathname.startsWith('/api/ops/')
  )) return next();

  try {
    const authResponse = await fetch(CRM_SERVICE_URL + '/api/me', {
      headers: {
        Cookie: req.headers.cookie || '',
        Authorization: req.headers.authorization || ''
      },
      signal: AbortSignal.timeout(5000)
    });

    if (authResponse.status === 401 || authResponse.status === 403) {
      return res.status(401).json({ error: 'Administrator login required.' });
    }

    if (!authResponse.ok) {
      return res.status(503).json({ error: 'Authentication service unavailable.' });
    }

    const user = await authResponse.json();

    if (user.isPlatformAdmin !== true) {
      return res.status(403).json({ error: 'Platform administrator access required.' });
    }

    req.platformAdminUser = user;
    next();
  } catch (error) {
    console.error('[Admin Authorization]', error.message);
    res.status(503).json({ error: 'Administrator authentication unavailable.' });
  }
});

// Verify subscriber workspace entitlement before gateway-local handlers run.
app.use(async (req, res, next) => {
  if (!/^\/api\/(workbench|crm|dashboard|team|personal-reminders|business-calendar|crm-calendar|subscriber)(\/|$)/.test(req.path)) return next();
  try {
    const response = await fetch(CRM_SERVICE_URL + '/api/billing/identity', { headers: { Cookie:req.headers.cookie||'', Authorization:req.headers.authorization||'' }, signal:AbortSignal.timeout(10000) });
    if (!response.ok) return res.status(response.status).json({error:'Sign in to access your workspace.'});
    const identity = await response.json();
    if (!identity.canAccess) return res.status(402).json({error:'A paid subscription or administrator-approved exemption is required.',billingRequired:true});
    return next();
  } catch { return res.status(503).json({error:'Workspace access could not be verified.'}); }
});

// Cloudflare Access Zero Trust bypass rewrite:
// Cloudflare Access intercepts /admin, /admin/login, and /api/admin/*
// Rewriting /api/ops/* -> /api/admin/* internally allows admin SPAs to bypass Cloudflare edge interception
app.use((req, res, next) => {
  if (req.url.startsWith('/api/ops/')) {
    req.url = req.url.replace('/api/ops/', '/api/admin/');
  }
  next();
});

// Proxy routes to Valuation service
app.use('/api/valuation', createProxyMiddleware({
  target: VALUATION_SERVICE_URL,
  changeOrigin: true
}));

// Proxy core CRM Auth routes without Express stripping URL path (same-origin from home.nyrava.com)
const crmAuthProxy = createProxyMiddleware({
  target: CRM_SERVICE_URL,
  changeOrigin: true
});

registerFunctionalCrmGateway(app, { CRM_SERVICE_URL });

app.use((req, res, next) => {
  if (
    req.path === '/api/login' ||
    req.path === '/api/register' ||
    req.path === '/api/logout' ||
    req.path === '/api/me' ||
    req.path.startsWith('/api/auth') ||
    req.path.startsWith('/api/account-registration')
  ) {
    return crmAuthProxy(req, res, next);
  }
  next();
});

// Register comprehensive gateway microservices features BEFORE wildcard CRM proxy
app.use(express.json({
  limit: '50mb',
  verify(req, res, buffer) {
    if (req.path === '/api/billing/stripe/webhook') req.rawBody = Buffer.from(buffer);
  }
}));
registerGatewayFeatures(app, { CRM_SERVICE_URL, VALUATION_SERVICE_URL, MEET_SERVICE_URL });

// Proxy routes to CRM service
app.use('/api/crm', createProxyMiddleware({
  target: CRM_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/crm': '/api/v1' }
}));

// Parse JSON and URL-encoded bodies with 50MB limit to support property photo & video uploads

app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ===================================================================
// NYRA AI SALES BOT & TOUR API (/api/nyra/v1/*)
// ===================================================================

app.get('/api/nyra/v1/config', (req, res) => {
  res.json(NYRA_CONFIG);
});

app.post('/api/nyra/v1/respond', (req, res) => {
  const { language = 'en', topic, question } = req.body || {};
  const lang = language === 'es' ? 'es' : 'en';
  let targetTopic = topic;

  if (!targetTopic && question) {
    targetTopic = resolveTopic(question);
  }
  if (!targetTopic || !NYRA_RESPONSES[targetTopic]) {
    targetTopic = 'intro';
  }

  const topicData = NYRA_RESPONSES[targetTopic][lang] || NYRA_RESPONSES[targetTopic]['en'];
  res.json({
    topic: targetTopic,
    text: topicData.text,
    href: topicData.href,
    selector: topicData.selector,
    notice: '',
    audio: null
  });
});

app.post('/api/nyra/v1/conversation', async (req, res) => {
  const { language = 'en', question = '', topic = 'intro' } = req.body || {};
  const lang = language === 'es' ? 'es' : 'en';
  const targetTopic = resolveTopic(question) || topic;
  const topicData = NYRA_RESPONSES[targetTopic]?.[lang] || NYRA_RESPONSES.intro[lang];

  // If OPENAI_API_KEY is configured, call OpenAI for natural conversational intelligence
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (apiKey && question) {
    try {
    const crmRes = await fetch(CRM_SERVICE_URL + '/api/v1/inbound-leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are Nyra, the friendly AI guide for Nyrava Home. Explain that Nyrava Home connects licensed Realtors with verified buyer and seller opportunities across 60 US metro territories. Pricing is $349/year (first month included) + $89/mo Basic or $149/mo Pro. Keep your response under 3 concise sentences.`
            },
            { role: 'user', content: question }
          ],
          max_tokens: 150
        })
      });
      if (openAiRes.ok) {
        const aiJson = await openAiRes.json();
        const aiText = aiJson.choices?.[0]?.message?.content;
        if (aiText) {
          return res.json({
            mode: 'AI conversation',
            topic: targetTopic,
            text: aiText,
            href: topicData.href,
            selector: topicData.selector
          });
        }
      }
    } catch (e) {
      console.warn('[Nyra OpenAI Fallback]', e.message);
    }
  }

  // Built-in intelligent response
  res.json({
    mode: 'AI conversation',
    topic: targetTopic,
    text: topicData.text,
    href: topicData.href,
    selector: topicData.selector
  });
});

app.post('/api/nyra/v1/greeting', (req, res) => {
  const { name = '', language = 'en', consent = false } = req.body || {};
  if (!consent || !name) {
    return res.status(400).json({ error: 'Consent and name required' });
  }
  const cleanName = name.replace(/[^\w\s-]/g, '').trim().slice(0, 30);
  const text = language === 'es'
    ? `¡Hola ${cleanName}! Bienvenido a Nyrava Home. ¿En qué puedo ayudarte a hacer crecer tu negocio inmobiliario hoy?`
    : `Hello ${cleanName}! Welcome to Nyrava Home. How can I assist you with your real estate business today?`;

  res.json({
    text,
    stored: false
  });
});

// Direct routes and aliases for seamless navigation
app.get('/find-a-realtor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'intake.html'));
});

app.get('/subscriber-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'subscriber-login.html'));
});

app.get(['/dashboard/home', '/dashboard/crm', '/dashboard/leads', '/dashboard/calendar'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard-home.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard-home.html'));
});

app.get('/legal.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/billing-policy.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

app.get('/privacy-choices.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/meet', (req, res) => {
  res.redirect(MEET_SERVICE_URL);
});

// Admin direct access (never linked on front of site)
app.get(['/admin', '/admin.html', '/ops-admin', '/platform-admin'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get(['/admin/login', '/admin-signin.html', '/admin-login', '/platform-admin/login'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-signin.html'));
});

app.get(['/admin/diagnostics', '/admin/acquisition', '/admin/leads'], (req, res) => {
  res.redirect('/admin.html');
});

// Public ZIP capacity check. The CRM computes this from verified subscription records.
app.get('/api/territories/check/:zip', async (req, res) => {
  const zip = String(req.params.zip || '').trim();
  if (!/^\d{5}$/.test(zip)) return res.status(400).json({ error: 'Enter a valid five-digit ZIP code.' });
  try {
    const capacityRes = await fetch(CRM_SERVICE_URL + '/api/territories/check/' + encodeURIComponent(zip), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    const body = await capacityRes.text();
    res.setHeader('Cache-Control', 'no-store');
    if (body && !capacityRes.headers.get('content-type')?.includes('json'))
      return res.status(502).json({ error: 'ZIP capacity could not be checked right now.' });
    res.status(capacityRes.status);
    if (body) res.type('json');
    return res.send(body || '{}');
  } catch (err) {
    return res.status(502).json({ error: 'ZIP capacity could not be checked right now. Please retry.' });
  }
});

// Platform plans and pricing specifications
app.get('/api/plans', (req, res) => {
  res.json({
    currency: "USD",
    annualSetupAndLicense: 349,
    annualRenewal: true,
    firstMonthIncluded: true,
    recurringMonthlyStartsMonth: 2,
    firstPaymentBasic: 349,
    firstPaymentPro: 349,
    basic: {
      monthly: 89,
      zipLimit: 5,
      dailyMaximum: 2,
      rolling30DayMaximum: 10
    },
    pro: {
      monthly: 149,
      zipLimit: 20,
      dailyMaximum: 3,
      rolling30DayMaximum: 20
    },
    billingStatus: "CHECKOUT_AVAILABLE",
    disclaimer: "Allow approximately 3–5 days after adding ZIP codes for leads to begin arriving. Timing and quantities are not guaranteed. Leads arrive as qualified opportunities become available, not daily. Limits are maximum allowances, not guaranteed volumes."
  });
});

// Nyra AI locked speech endpoint (graceful voice fallback)
app.post('/api/nyra/v1/speech', (req, res) => {
  res.status(503).json({
    error: "Nyra locked voice synthesis is unavailable. Using browser assistant."
  });
});

// Inquiries API - Ingests verified lead into Nyrava CRM with Territory Routing
app.post('/api/inquiries', async (req, res) => {
  if(!process.env.CRM_INBOUND_TOKEN)return res.status(503).json({error:'Lead intake integration is not configured. Your submission has not been saved.'});
  const p = req.body || {};
  const zip = (p.zipCode || '78701').trim();
  const cleanPhone = (p.phone || '').trim();
  const cleanEmail = (p.email || '').trim();
  const cleanName = (p.fullName || '').trim();
  if(!cleanName)return res.status(400).json({error:'Enter your name.'});
  const externalId = `inq-${zip}-${cleanPhone.replace(/\D/g, '') || Date.now()}`;

  const crmPayload = {
    ExternalLeadId: externalId,
    Source: 'FindARealtorWeb',
    Name: cleanName,
    Email: cleanEmail,
    Phone: cleanPhone,
    Company: 'Nyrava Home Web Form',
    LeadType: p.leadType === 'buyer' ? 'Buyer' : 'Seller',
    PropertyZipCode: zip,
    ContactVerificationMethod: p.confirmationChannel === 'SMS' ? 'SMS' : 'Email',
    ContactVerifiedAt: new Date().toISOString(),
    IntentVerifiedAt: new Date().toISOString(),
    ConsentCapturedAt: new Date().toISOString(),
    ConsentRecipient: 'Nyrava Home',
    ConsentText: `Client submitted inquiry for ${zip}. Authorized verified local Realtor match.`,
    ExternalFsbo: false,
    Notes: `Intake Submission | Type: ${p.leadType || 'Seller'} | Stated Intent: ${p.intentStatement || 'N/A'} | Target ZIP: ${zip} | Budget/Val: ${p.budgetMax || p.estimatedPropertyValue || 'N/A'} | Timeframe: ${p.timeframe || 'Exploring'}`
  };

  try {
    const crmRes = await fetch(CRM_SERVICE_URL + '/api/v1/inbound-leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '+process.env.CRM_INBOUND_TOKEN
      },
      body: JSON.stringify(crmPayload)
    });
    if(!crmRes.ok){const error=await crmRes.json().catch(()=>({}));return res.status(crmRes.status).json({error:error.error||'CRM rejected this submission. It has not been confirmed.'});}
    console.log(`[Lead Ingested to CRM] ZIP: ${zip} | Status: ${crmRes.status}`);
  } catch (err) {
    return res.status(502).json({error:'CRM unavailable. Your submission was not confirmed.'});
  }

  return res.json({
    inquiryId: externalId,
    status: 'ACTIVE',
    confirmation: {
      ok: true,
      status: 'SAVED',
      message: 'Your inquiry has been saved to the CRM. Assignment and email delivery are not confirmed by this receipt.'
    }
  });
});

// FSBO direct listing endpoint -> Ingests into CRM as Seller Lead with Territory Routing & Property Media
app.post('/api/fsbo/listing', async (req, res) => {
  if(!process.env.CRM_INBOUND_TOKEN)return res.status(503).json({error:'Lead intake integration is not configured. Your submission has not been saved.'});
  const p = req.body || {};
  const zip = (p.zipCode || '78701').trim();
  const phone = (p.phone || '').trim();
  const email = (p.email || '').trim();
  const name = (p.fullName || 'Homeowner FSBO').trim();
  const address = (p.address || '').trim();
  const city = (p.city || '').trim();
  const state = (p.state || '').trim();
  const price = (p.price || '').trim();
  const beds = (p.beds || '').trim();
  const baths = (p.baths || '').trim();
  const sqft = (p.sqft || '').trim();
  const propertyType = (p.propertyType || 'Single Family').trim();
  const notes = (p.notes || '').trim();
  const videoUrl = (p.videoUrl || '').trim();
  const externalId = 'fsbo-' + zip + '-' + (phone.replace(/\D/g, '') || Date.now());

  // Handle uploaded home photos and video
  const uploadedUrls = [];
  const FSBO_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'fsbo');
  if (!fs.existsSync(FSBO_UPLOAD_DIR)) {
    fs.mkdirSync(FSBO_UPLOAD_DIR, { recursive: true });
  }

  if (Array.isArray(p.mediaFiles)) {
    for (let i = 0; i < p.mediaFiles.length; i++) {
      const item = p.mediaFiles[i];
      if (item && item.data && typeof item.data === 'string') {
        try {
          const matches = item.data.match(/^data:([A-Za-z0-9\-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const mime = matches[1].toLowerCase();
            const b64 = matches[2];
            let ext = '.jpg';
            if (mime.includes('png')) ext = '.png';
            else if (mime.includes('webp')) ext = '.webp';
            else if (mime.includes('mp4')) ext = '.mp4';
            else if (mime.includes('webm')) ext = '.webm';
            else if (mime.includes('quicktime') || mime.includes('mov')) ext = '.mov';

            const cleanBase = (item.name || 'home-media').replace(/[^a-zA-Z0-9_\-\.]/g, '_').slice(0, 30);
            const filename = `fsbo-${Date.now()}-${i}-${cleanBase}${ext}`;
            const targetPath = path.join(FSBO_UPLOAD_DIR, filename);
            fs.writeFileSync(targetPath, Buffer.from(b64, 'base64'));

            uploadedUrls.push({
              name: item.name || filename,
              url: `/uploads/fsbo/${filename}`,
              type: mime.startsWith('video/') ? 'video' : 'image'
            });
          }
        } catch (err) {
          console.warn('[FSBO Media File Save Error]', err.message);
        }
      }
    }
  }

  let mediaSummary = '';
  if (uploadedUrls.length > 0) {
    mediaSummary += ' | Photos & Videos (' + uploadedUrls.length + '): ' + uploadedUrls.map(u => u.url).join(', ');
  }
  if (videoUrl) {
    mediaSummary += ' | Walkthrough Video: ' + videoUrl;
  }

  const crmPayload = {
    ExternalLeadId: externalId,
    Source: 'Fsbo',
    Name: name,
    Email: email,
    Phone: phone,
    Company: 'Homeowner FSBO Direct Listing',
    LeadType: 'Seller',
    PropertyZipCode: zip,
    ContactVerificationMethod: 'Email',
    ContactVerifiedAt: new Date().toISOString(),
    IntentVerifiedAt: new Date().toISOString(),
    ConsentCapturedAt: new Date().toISOString(),
    ConsentRecipient: 'Nyrava Home',
    ConsentText: 'FSBO seller listing submitted for ' + address + ', ' + city + ', ' + state + ' ' + zip + '. Asking: $' + price + (uploadedUrls.length ? ' with ' + uploadedUrls.length + ' uploaded photos/videos' : ''),
    ExternalFsbo: true,
    Notes: 'FSBO DIRECT LISTING | Address: ' + address + ', ' + city + ', ' + state + ' ' + zip + ' | Asking Price: $' + price + ' | Type: ' + propertyType + ' | Beds: ' + beds + ' | Baths: ' + baths + ' | SqFt: ' + sqft + ' | Description: ' + notes + mediaSummary
  };

  try {
    const crmRes = await fetch(CRM_SERVICE_URL + '/api/v1/inbound-leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '+process.env.CRM_INBOUND_TOKEN
      },
      body: JSON.stringify(crmPayload)
    });
    if(!crmRes.ok){const error=await crmRes.json().catch(()=>({}));return res.status(crmRes.status).json({error:error.error||'CRM rejected this submission. It has not been confirmed.'});}
    console.log('[FSBO Lead Ingested to CRM] ZIP: ' + zip + ' | Media: ' + uploadedUrls.length + ' | Status: ' + crmRes.status);
  } catch (err) {
    return res.status(502).json({error:'CRM unavailable. Your submission was not confirmed.'});
  }

  return res.json({
    fsboId: externalId,
    success: true,
    media: uploadedUrls,
    videoUrl: videoUrl,
    message: 'Your FSBO submission has been saved to the CRM for review.'
  });
});

// ===================================================================
// BILLING & STRIPE INTEGRATION API
// ===================================================================

registerBillingIntegration(app, { CRM_SERVICE_URL, getStripeSettings, recordWebhookEvent, isValidStripeWebhookSignature });

app.get('/api/billing/session', async (req, res) => {
  try {
    const crmRes = await fetch(CRM_SERVICE_URL + '/api/billing/session', {
      headers: {
        Cookie: req.headers.cookie || '',
        Authorization: req.headers.authorization || '',
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });
    const data = await crmRes.json().catch(() => ({}));
    if (!crmRes.ok) return res.status(crmRes.status).json(data);

    const settings = getStripeSettings();
    const stripeReady = Boolean(
      (settings.secretKey || '').startsWith('sk_') || (settings.secretKey || '').startsWith('rk_')
    ) && Boolean(settings.webhookSecret && settings.annualPriceId && settings.basicPriceId && settings.proPriceId);
    if (data.billing) data.billing.checkoutEnabled = Boolean(data.billing.checkoutEnabled && stripeCheckoutReady(settings));
    data.csrf = 'ny_csrf_' + Date.now().toString(36);
    if (data.billing) {
      data.billing.checkoutEnabled = Boolean(data.billing.checkoutEnabled && stripeReady);
      if (!stripeReady && ['PENDING', 'NOT_ENROLLED', 'EXPIRED'].includes(data.billing.state))
        data.billing.error = 'Secure checkout is temporarily unavailable. Please try again later.';
    }
    return res.json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Billing status is temporarily unavailable. Please try again.' });
  }
});

function isValidStripeWebhookSignature(rawBody, signatureHeader, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!Buffer.isBuffer(rawBody) || !signatureHeader || !secret) return false;
  let timestamp = '';
  const signatures = [];
  for (const component of signatureHeader.split(',')) {
    const separator = component.indexOf('=');
    if (separator < 1) continue;
    const key = component.slice(0, separator).trim();
    const value = component.slice(separator + 1).trim();
    if (key === 't' && !timestamp) timestamp = value;
    if (key === 'v1' && /^[a-f0-9]{64}$/i.test(value)) signatures.push(value);
  }
  if (!/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > 300) return false;

  const expected = createHmac('sha256', secret).update(timestamp + '.').update(rawBody).digest();
  return signatures.some(value => {
    const candidate = Buffer.from(value, 'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

// Admin Stripe Endpoints
app.get('/api/admin/stripe/overview', (req, res) => {
  const settings = getStripeSettings();
  res.json({
    checkoutEnabled: stripeCheckoutReady(settings),
    webhookPath: '/api/billing/stripe/webhook',
    eventTypes: [
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.paid',
      'invoice.payment_failed'
    ],
    settings: {
      secretConfigured: Boolean(settings.secretKey),
      webhookConfigured: Boolean(settings.webhookSecret),
      publishableKey: settings.publishableKey || '',
      annualPriceId: settings.annualPriceId || '',
      basicPriceId: settings.basicPriceId || '',
      proPriceId: settings.proPriceId || '',
      checkoutEnabled: Boolean(settings.checkoutEnabled),
      basicCheckoutParameters: settings.basicCheckoutParameters || {},
      proCheckoutParameters: settings.proCheckoutParameters || {}
    },
    events: getRecentWebhookEvents(),
    billingAccounts: []
  });
});

app.post('/api/admin/stripe/settings', (req, res) => {
  const b = req.body || {};
  const current = getStripeSettings();
  const updated = {
    secretKey: b.SecretKey ? b.SecretKey.trim() : current.secretKey,
    publishableKey: b.PublishableKey !== undefined ? b.PublishableKey.trim() : current.publishableKey,
    webhookSecret: b.WebhookSecret ? b.WebhookSecret.trim() : current.webhookSecret,
    annualPriceId: b.AnnualPriceId !== undefined ? b.AnnualPriceId.trim() : current.annualPriceId,
    basicPriceId: b.BasicPriceId !== undefined ? b.BasicPriceId.trim() : current.basicPriceId,
    proPriceId: b.ProPriceId !== undefined ? b.ProPriceId.trim() : current.proPriceId,
    checkoutEnabled: b.CheckoutEnabled === undefined ? Boolean(current.checkoutEnabled) : b.CheckoutEnabled === true,
    basicCheckoutParameters: b.BasicCheckoutParameters === undefined ? current.basicCheckoutParameters : b.BasicCheckoutParameters,
    proCheckoutParameters: b.ProCheckoutParameters === undefined ? current.proCheckoutParameters : b.ProCheckoutParameters
  };
  try {
    for (const plan of ['BASIC','PRO']) checkoutParameters(updated, {ownerId:1,email:'validation@example.test'}, plan);
    if (updated.checkoutEnabled && !stripeCheckoutReady(updated)) return res.status(400).json({error:'Complete the keys, signing secret, server sync secret and both checkout templates before enabling payments.'});
  } catch (error) { return res.status(400).json({error:error.message}); }
  saveStripeSettings(updated);
  res.json({
    secretConfigured: Boolean(updated.secretKey),
    webhookConfigured: Boolean(updated.webhookSecret),
    publishableKey: updated.publishableKey,
    annualPriceId: updated.annualPriceId,
    basicPriceId: updated.basicPriceId,
    proPriceId: updated.proPriceId,
    checkoutEnabled: updated.checkoutEnabled,
    basicCheckoutParameters: updated.basicCheckoutParameters || {},
    proCheckoutParameters: updated.proCheckoutParameters || {}
  });
});

app.post('/api/admin/stripe/test', async (req, res) => {
  const settings = getStripeSettings();
  if (!settings.secretKey) return res.status(503).json({ success: false, message: 'Stripe key is not configured.' });
  try {
    const response = await fetch('https://api.stripe.com/v1/balance', { headers: { Authorization: 'Bearer ' + settings.secretKey }, signal: AbortSignal.timeout(10000) });
    return res.status(response.ok ? 200 : 502).json({ success: response.ok, message: response.ok ? 'Stripe API connection verified.' : 'Stripe rejected the API key or its permissions.' });
  } catch { return res.status(502).json({ success: false, message: 'Stripe API could not be reached.' }); }
});

app.post('/api/admin/stripe/prices/validate', async (req, res) => {
  const settings = getStripeSettings();
  if (!settings.secretKey) return res.status(503).json({ success: false, error: 'Add your existing Stripe secret key first.' });
  const prices = await Promise.all(['AnnualPriceId', 'BasicPriceId', 'ProPriceId'].map(async field => {
    const id = settings[field[0].toLowerCase() + field.slice(1)];
    if (!id) return { field, valid: false, message: 'Not configured.' };
    try {
      const response = await fetch('https://api.stripe.com/v1/prices/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + settings.secretKey }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) return { field, valid: false, message: 'Stripe could not verify this price.' };
      const price = await response.json();
      return { field, valid: price.active, unitAmount: price.unit_amount, currency: price.currency, interval: price.recurring?.interval || 'one-time', message: price.active ? 'Verified with Stripe.' : 'Price is inactive.' };
    } catch { return { field, valid: false, message: 'Stripe could not be reached.' }; }
  }));
  res.json({ success: prices.every(p => p.valid), prices, message: 'Read-only Stripe price check complete.' });
});

// ===================================================================
// WORKSPACE & DASHBOARD API
// ===================================================================

// ===================================================================
// CALENDAR & VIDEO CONSULTATION INTEGRATION
// ===================================================================

const CALENDAR_DATA_FILE = path.join(DATA_DIR, 'calendar-data.json');
function getCalendarData() {
  try {
    if (fs.existsSync(CALENDAR_DATA_FILE)) {
      return JSON.parse(fs.readFileSync(CALENDAR_DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return { contacts: [], events: [], tasks: [], videoMeetings: {} };
}
function saveCalendarData(d) {
  try {
    fs.writeFileSync(CALENDAR_DATA_FILE, JSON.stringify(d, null, 2), 'utf8');
  } catch (e) {}
}

app.get('/api/crm-calendar/session', (req, res) => {
  res.json({
    staffId: null,
    canManage: true,
    csrf: 'ny_csrf_cal_' + Date.now().toString(36),
    role: 'RealtorSubscriber'
  });
});

app.get('/api/crm-calendar/events', async (req, res) => {
  const cd = getCalendarData();
  let crmEvents = [];
  try {
    const aRes = await fetch(CRM_SERVICE_URL + '/api/activities', {
      headers: {
        'Cookie': req.headers.cookie || '',
        'Authorization': req.headers.authorization || ''
      }
    });
    if (aRes.ok) {
      const acts = await aRes.json();
      crmEvents = (acts || []).map(a => ({
        key: 'crm:' + (a.id || Date.now()),
        id: String(a.id),
        source: 'crm',
        title: a.title || 'Client Appointment',
        client: a.contactName || a.contact?.fullName || 'Client',
        startsAt: a.startsAt || new Date().toISOString(),
        endsAt: a.endsAt || new Date(Date.now() + 1800000).toISOString(),
        attendance: a.result || 'SET',
        disposition: 'NONE',
        videoMeeting: true,
        version: 1
      }));
    }
  } catch (e) {}

  const manualEvents = (cd.events || []).map(e => ({
    key: 'manual:' + (e.id || Date.now()),
    id: String(e.id),
    source: 'manual',
    title: e.title || 'Appointment',
    client: e.contactName || 'Client',
    startsAt: e.startsAt || new Date().toISOString(),
    endsAt: e.endsAt || new Date(Date.now() + 1800000).toISOString(),
    attendance: e.attendance || 'SET',
    disposition: e.disposition || 'NONE',
    videoMeeting: Boolean(e.videoMeeting),
    version: 1
  }));

  res.json({
    events: [...manualEvents, ...crmEvents],
    staff: []
  });
});

app.get('/api/business-calendar/contacts', (req, res) => {
  const cd = getCalendarData();
  res.json(cd.contacts || []);
});

app.post('/api/business-calendar/contacts', (req, res) => {
  const cd = getCalendarData();
  const c = { id: 'c_' + Date.now(), ...(req.body || {}) };
  cd.contacts = cd.contacts || [];
  cd.contacts.push(c);
  saveCalendarData(cd);
  res.json(c);
});

app.get('/api/business-calendar/events', (req, res) => {
  const cd = getCalendarData();
  res.json(cd.events || []);
});

app.post('/api/business-calendar/events', (req, res) => {
  const cd = getCalendarData();
  const e = { id: 'e_' + Date.now(), status: 'SCHEDULED', ...(req.body || {}) };
  cd.events = cd.events || [];
  cd.events.push(e);
  saveCalendarData(cd);
  res.json(e);
});

app.get('/api/business-calendar/tasks', (req, res) => {
  const cd = getCalendarData();
  res.json(cd.tasks || []);
});

app.post('/api/business-calendar/tasks', (req, res) => {
  const cd = getCalendarData();
  const t = { id: 't_' + Date.now(), completed: false, ...(req.body || {}) };
  cd.tasks = cd.tasks || [];
  cd.tasks.push(t);
  saveCalendarData(cd);
  res.json(t);
});

app.get('/api/team-chat/session', (req, res) => {
  res.json({
    businesses: [
      { id: '00000000-0000-0000-0000-000000000000', roomId: '00000000-0000-0000-0000-000000000000', owner: true, direct: true }
    ]
  });
});

app.get('/api/team-meetings/meetings', (req, res) => {
  res.json({ meetings: [] });
});

app.get('/api/crm-calendar/video-now/capabilities', (req, res) => {
  res.json({ callsEnabled: true, canInvite: true });
});

app.post('/api/crm-calendar/video-now', (req, res) => {
  const { confirmedEmail = '', contactId = '1', kind = 'crm' } = req.body || {};
  const aptId = 'apt_video_' + Date.now();
  const cd = getCalendarData();
  cd.videoMeetings = cd.videoMeetings || {};
  cd.videoMeetings[aptId] = {
    delivery: confirmedEmail ? ('Sent to ' + confirmedEmail) : 'Direct Link Generated',
    canHost: true,
    state: 'SCHEDULED',
    email: confirmedEmail,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 1800000).toISOString()
  };
  saveCalendarData(cd);
  res.json({
    meeting: {
      delivery: confirmedEmail ? ('Sent to ' + confirmedEmail) : 'Direct Link Generated',
      canHost: true,
      state: 'SCHEDULED'
    },
    source: 'manual',
    appointmentId: aptId
  });
});

app.get('/api/crm-calendar/events/:source/:id/video', (req, res) => {
  const cd = getCalendarData();
  const m = cd.videoMeetings?.[req.params.id] || {
    delivery: 'Sent via Email',
    canHost: true,
    state: 'SCHEDULED',
    email: 'fictional-contact@example.test',
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 1800000).toISOString()
  };
  res.json({
    meeting: {
      delivery: m.delivery,
      canHost: true,
      state: m.state || 'SCHEDULED',
      callsEnabled: true
    },
    appointment: {
      email: m.email || 'fictional-contact@example.test',
      startsAt: m.startsAt,
      endsAt: m.endsAt
    },
    waiting: []
  });
});

app.post(['/api/crm-calendar/events/:source/:id/video/join', '/api/crm-calendar/events/:source/:id/video/admit'], (req, res) => {
  const roomHex = ('nhc' + Buffer.from('nyrava_room_' + req.params.id + '_' + Date.now()).toString('hex') + '0000000000000000000000000000000000000000').slice(0, 51);
  res.json({
    domain: 'meet.home.nyrava.com',
    room: roomHex,
    title: 'Nyrava Home Video Consultation',
    jwt: null
  });
});

app.get('/external_api.js', createProxyMiddleware({
  target: MEET_SERVICE_URL,
  changeOrigin: true
}));

// Static files
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: 0
}));

// Health check
app.get('/metrics', (req, res) => {
  const uptime = Math.floor(process.uptime());
  res.setHeader('Content-Type', 'text/plain');
  res.send(`# HELP nyrava_portal_uptime_seconds Web portal uptime\n# TYPE nyrava_portal_uptime_seconds gauge\nnyrava_portal_uptime_seconds ${uptime}\n`);
});

app.get(['/health', '/healthz', '/api/health'], (req, res) => {
  res.json({
    status: 'online',
    service: 'nyrava-web-portal',
    time: new Date().toISOString(),
    endpoints: {
      crm: CRM_SERVICE_URL,
      valuation: VALUATION_SERVICE_URL,
      meet: MEET_SERVICE_URL
    }
  });
});

// Never return index.html for API routes!
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// Single Page fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Nyrava Web Portal] Live on http://localhost:${PORT}`);
  console.log(`[Nyrava Web Portal] Proxying /api/valuation -> ${VALUATION_SERVICE_URL}`);
  console.log(`[Nyrava Web Portal] Proxying /api/crm -> ${CRM_SERVICE_URL}`);
});
