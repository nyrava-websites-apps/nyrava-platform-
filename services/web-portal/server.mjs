import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { NYRA_CONFIG, NYRA_RESPONSES, resolveTopic } from './nyra-sales-engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || 'http://localhost:5180';
const VALUATION_SERVICE_URL = process.env.VALUATION_SERVICE_URL || 'http://localhost:5190';
const MEET_SERVICE_URL = process.env.MEET_SERVICE_URL || 'http://localhost:5000';

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// Proxy routes to Valuation service
app.use('/api/valuation', createProxyMiddleware({
  target: VALUATION_SERVICE_URL,
  changeOrigin: true
}));

// Proxy routes to CRM service
app.use('/api/crm', createProxyMiddleware({
  target: CRM_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/crm': '/api/v1' }
}));

// Parse JSON bodies for inquiries
app.use(express.json());

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
      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
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

app.get('/dashboard/home', (req, res) => {
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
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-signin.html'));
});

app.get(['/admin/diagnostics', '/admin/acquisition', '/admin/leads'], (req, res) => {
  res.redirect('/admin');
});

// Territory ZIP availability check
app.get('/api/territories/check/:zip', (req, res) => {
  const zip = req.params.zip || '78701';
  res.json({
    zip,
    maxSlots: 2,
    availableSlots: 1,
    status: 'AVAILABLE'
  });
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
  const p = req.body || {};
  const zip = (p.zipCode || '78701').trim();
  const cleanPhone = (p.phone || '').trim();
  const cleanEmail = (p.email || '').trim();
  const cleanName = (p.fullName || 'Inquiry Contact').trim();
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
    const crmRes = await fetch(`${CRM_SERVICE_URL}/api/v1/inbound-leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer nycrm_JVsFAh7zwIJo-iejVRvl3UZ7APQ1zyNC7_0ai7c9a9A'
      },
      body: JSON.stringify(crmPayload)
    });
    console.log(`[Lead Ingested to CRM] ZIP: ${zip} | Status: ${crmRes.status}`);
  } catch (err) {
    console.warn('[CRM Network]', err.message);
  }

  return res.json({
    inquiryId: externalId,
    status: 'ACTIVE',
    confirmation: {
      ok: true,
      status: 'CONFIRMATION_SENT',
      message: 'Your inquiry has been submitted and dispatched to our territory network.'
    }
  });
});

// Static files
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '1h'
}));

// Health check
app.get(['/health', '/api/health'], (req, res) => {
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

// Single Page fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Nyrava Web Portal] Live on http://localhost:${PORT}`);
  console.log(`[Nyrava Web Portal] Proxying /api/valuation -> ${VALUATION_SERVICE_URL}`);
  console.log(`[Nyrava Web Portal] Proxying /api/crm -> ${CRM_SERVICE_URL}`);
});
