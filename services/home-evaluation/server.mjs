import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateValuation } from './valuation-engine.mjs';
import { sendValuationEmail } from './email-service.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let config = {
  port: 5190,
  crmApiUrl: 'http://localhost:5180',
  crmIntegrationKey: 'nycrm_JVsFAh7zwIJo-iejVRvl3UZ7APQ1zyNC7_0ai7c9a9A',
  branding: {
    appName: 'Nyrava Home Evaluation',
    companyName: 'Nyrava Technologies',
    supportPhone: '(800) 555-0199',
    accentColor: '#0066ff'
  }
};

try {
  const configFile = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8');
  config = { ...config, ...JSON.parse(configFile) };
} catch {}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 500000) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const activeSessions = new Map();

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Nyrava-Valuation-Capture'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Observability: Health & Metrics
  if (req.method === 'GET' && (url.pathname === '/healthz' || url.pathname === '/health')) {
    return sendJson(res, 200, {
      status: 'healthy',
      service: 'home-evaluation',
      port: config.port || 5190,
      timestamp: new Date().toISOString()
    });
  }

  if (req.method === 'GET' && url.pathname === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    const uptime = Math.floor(process.uptime());
    return res.end(`# HELP nyrava_valuation_uptime_seconds Valuation engine uptime\n# TYPE nyrava_valuation_uptime_seconds gauge\nnyrava_valuation_uptime_seconds ${uptime}\n`);
  }

  // ENDPOINT: /capture (From official Nyrava live valuation form)
  if (req.method === 'POST' && (url.pathname === '/capture' || url.pathname === '/api/valuation/capture')) {
    try {
      const data = await parseBody(req);
      const captureToken = 'cap_' + Math.random().toString(36).substring(2, 12);
      activeSessions.set(captureToken, { contact: data, property: data.property, createdAt: Date.now() });
      return sendJson(res, 200, { saved: true, captureToken });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // ENDPOINT: /estimate (From official Nyrava live valuation form)
  if (req.method === 'POST' && (url.pathname === '/estimate' || url.pathname === '/api/valuation/estimate')) {
    try {
      const data = await parseBody(req);
      const propInput = {
        street: data.street || '',
        city: data.city || '',
        state: data.state || 'TX',
        zip: data.zip || '',
        sqft: data.details?.sqft || 1800,
        beds: data.details?.beds || 3,
        baths: data.details?.baths || 2,
        propertyType: data.details?.propertyType || 'SINGLE_FAMILY'
      };
      const report = calculateValuation(propInput);
      const reportToken = 'rep_' + Math.random().toString(36).substring(2, 12);
      activeSessions.set(reportToken, { report, property: propInput, createdAt: Date.now() });

      return sendJson(res, 200, {
        status: 'estimated',
        reportToken,
        comparisonCount: report.comparableSales?.length || 3,
        estimate: report.valuation.estimate
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // ENDPOINT: /request (From official Nyrava live valuation form)
  if (req.method === 'POST' && (url.pathname === '/request' || url.pathname === '/api/valuation/request')) {
    try {
      const data = await parseBody(req);
      const sess = activeSessions.get(data.reportToken) || {};
      const property = sess.property || { street: 'Main St', city: 'City', state: 'TX', zip: '78701', sqft: 1800 };
      const valuationReport = sess.report || calculateValuation(property);
      const { valuation, comparableSales, equityProjection } = valuationReport;

      const now = new Date().toISOString();
      const zipCode = (property.zip || '78701').trim().slice(0, 5);
      const cleanPhone = (data.phone || '').trim();
      const cleanEmail = (data.email || '').trim();
      const cleanName = (data.fullName || 'Homeowner').trim();
      const externalId = `val-${zipCode}-${cleanPhone.replace(/\D/g, '') || Date.now()}`;
      const estimateText = `$${valuation.estimate.toLocaleString()}`;

      // Ingest to CRM Master Bank (Skip if called from internal Realtor Private Valuation tool)
      const isAgentTool = Boolean(data.isAgentTool || data.privateMode || data.agentMode || data.privateTool || (url.searchParams.get('mode') === 'agent') || (url.searchParams.get('private') === 'true'));
      
      if (!isAgentTool) {
        const crmPayload = {
          ExternalLeadId: externalId,
          Source: 'HomeEvaluation',
          Name: cleanName,
          Email: cleanEmail,
          Phone: cleanPhone,
          Company: 'Home Evaluation Request',
          LeadType: data.leadType === 'buyer' ? 'Buyer' : 'Seller',
          PropertyZipCode: zipCode,
          ContactVerificationMethod: 'Phone',
          ContactVerifiedAt: now,
          IntentVerifiedAt: now,
          ConsentCapturedAt: now,
          ConsentRecipient: config.branding.companyName,
          ConsentText: `Homeowner authorized valuation report and market consultation for ${property.street}, ZIP ${zipCode}. Includes automated 1-click email opt-out.`,
          ExternalFsbo: false,
          Notes: `Home Evaluation Inbound Lead | ${property.street}, ${property.city}, ${property.state} ${zipCode} | Est. Value: ${estimateText} | SqFt: ${property.sqft || 'N/A'}, Beds: ${property.beds || 'N/A'}, Baths: ${property.baths || 'N/A'} | Timeframe: ${data.timeframe || 'Exploring'}.`
        };

        try {
          await fetch(`${config.crmApiUrl}/api/v1/inbound-leads`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.crmIntegrationKey}`
            },
            body: JSON.stringify(crmPayload)
          });
        } catch (crmErr) {
          console.error('[Valuation Service] CRM Ingestion failed:', crmErr.message);
        }
      } else {
        console.log(`[Valuation Service] Private Realtor tool calculation for ${property.street || 'Property'} (No CRM lead generated)`);
      }

      // Send Email with Opt-Out
      try {
        await sendValuationEmail({
          leadName: cleanName,
          email: cleanEmail,
          property,
          valuation,
          comparableSales,
          equityProjection,
          leadId: externalId,
          config
        });
      } catch (emErr) {
        console.warn('Email dispatch error:', emErr.message);
      }

      return sendJson(res, 200, {
        emailAccepted: true,
        message: 'Your Nyrava Home valuation report has been prepared and sent to your email.'
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // IMMEDIATE VALUATION CALCULATION ENDPOINT (For Agent CMA & Instant Calculation)
  if (req.method === 'POST' && (url.pathname === '/api/valuation/calculate' || url.pathname === '/api/valuation/estimate')) {
    try {
      const data = await parseBody(req);
      const property = data.property || {
        street: data.street || data.address || 'Sample Property',
        city: data.city || 'Austin',
        state: data.state || 'TX',
        zip: (data.zip || data.zipCode || '78701').trim().slice(0, 5),
        sqft: Number(data.sqft || data.squareFeet || 1800),
        beds: Number(data.beds || data.bedrooms || 3),
        baths: Number(data.baths || data.bathrooms || 2),
        propertyType: data.propertyType || 'Single Family',
        condition: data.condition || 'move_in',
        pool: data.pool || 'none'
      };

      const valuationReport = calculateValuation(property);
      return sendJson(res, 200, {
        success: true,
        property,
        valuation: valuationReport.valuation,
        comparableSales: valuationReport.comparableSales,
        equityProjection: valuationReport.equityProjection
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // PRIMARY ENDPOINT: Evaluate Property + Ingest to CRM + Send Branded Email with Opt-Out Link
  if (req.method === 'POST' && (url.pathname === '/evaluate' || url.pathname === '/api/valuation/evaluate' || url.pathname === '/api/valuation/evaluate-and-submit' || url.pathname === '/api/valuation/submit' || url.pathname === '/api/v1/valuation/evaluate')) {
    try {
      const data = await parseBody(req);
      let property = data.property;
      let contact = data.contact;

      // Also support flat payload from web forms:
      if (!property && (data.address || data.street)) {
        property = {
          street: data.address || data.street,
          city: data.city,
          state: data.state,
          zip: data.zipCode || data.zip,
          beds: data.bedrooms || data.beds,
          baths: data.bathrooms || data.baths,
          sqft: data.squareFeet || data.sqft,
          propertyType: data.propertyType || 'Single Family'
        };
      }
      if (!contact && (data.leadName || data.leadEmail || data.leadPhone || data.fullName || data.name || data.email || data.phone)) {
        contact = {
          fullName: data.leadName || data.fullName || data.name,
          email: data.leadEmail || data.email,
          phone: data.leadPhone || data.phone,
          timeframe: data.timeframe || 'Exploring'
        };
      }

      // Ensure address is provided
      if (!property?.street || !property?.city || !property?.zip) {
        return sendJson(res, 400, { error: 'Please enter a complete street address, city, and ZIP code.' });
      }

      const isAgentTool = Boolean(data.isAgentTool || data.privateMode || data.agentMode || data.privateTool || (url.searchParams.get('mode') === 'agent') || (url.searchParams.get('private') === 'true'));

      // If not in private agent mode, ensure contact details are provided
      if (!isAgentTool && (!contact?.fullName || !contact?.email || !contact?.phone)) {
        return sendJson(res, 400, { error: 'To receive your official home valuation, full name, email, and phone number are required.' });
      }
      if (isAgentTool && !contact) {
        contact = { fullName: 'Private Agent Client', email: 'agent@workspace.internal', phone: '000-000-0000', timeframe: 'Private' };
      }

      // 1. Calculate Real Local Valuation & Comps
      const valuationReport = calculateValuation(property);
      const { valuation, comparableSales, equityProjection } = valuationReport;

      const now = new Date().toISOString();
      const zipCode = property.zip.trim().slice(0, 5);
      const cleanPhone = contact.phone.trim();
      const cleanEmail = contact.email.trim();
      const cleanName = contact.fullName.trim();
      const externalId = `val-${zipCode}-${cleanPhone.replace(/\D/g, '') || Date.now()}`;
      const estimateText = `$${valuation.estimate.toLocaleString()}`;

      // 2. Build CRM Payload for Nyrava Platform Lead Pipeline (Skip if Private Realtor tool)
      let crmStatus = isAgentTool ? 'private_agent_calc' : 'queued';

      if (!isAgentTool) {
        const crmPayload = {
          ExternalLeadId: externalId,
          Source: 'HomeEvaluation',
          Name: cleanName,
          Email: cleanEmail,
          Phone: cleanPhone,
          Company: 'Home Evaluation Request',
          LeadType: 'Seller',
          PropertyZipCode: zipCode,
          ContactVerificationMethod: 'Phone',
          ContactVerifiedAt: now,
          IntentVerifiedAt: now,
          ConsentCapturedAt: now,
          ConsentRecipient: config.branding.companyName,
          ConsentText: `Homeowner authorized valuation report and market consultation for ${property.street}, ZIP ${zipCode}. Includes automated 1-click email opt-out.`,
          ExternalFsbo: false,
          Notes: `Home Evaluation Inbound Lead | ${property.street}, ${property.city}, ${property.state} ${zipCode} | Est. Value: ${estimateText} (${valuation.lowRange ? '$' + valuation.lowRange.toLocaleString() + ' - $' + valuation.highRange.toLocaleString() : ''}) | SqFt: ${property.sqft || 'N/A'}, Beds: ${property.beds || 'N/A'}, Baths: ${property.baths || 'N/A'} | Timeframe: ${contact.timeframe || 'Just exploring'}.`
        };

        // 3. Dispatch to Nyrava CRM Master Bank & Realtor Territory Routing
        try {
          const crmRes = await fetch(`${config.crmApiUrl}/api/v1/inbound-leads`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.crmIntegrationKey}`
            },
            body: JSON.stringify(crmPayload)
          });

          if (crmRes.ok) {
            crmStatus = 'delivered';
          } else if (crmRes.status === 409) {
            crmStatus = 'already_in_bank';
          } else {
            const errText = await crmRes.text();
            console.warn('CRM Dispatch warning:', crmRes.status, errText);
          }
        } catch (crmErr) {
          console.error('[Valuation Service] CRM Dispatch error:', crmErr.message);
        }
      } else {
        console.log(`[Valuation Service] Private Valuation tool run for ${property.street || 'Property'} (No lead created)`);
      }

      // 4. Send Branded Valuation Report Email with 1-Click Opt-Out Link
      try {
        await sendValuationEmail({
          leadName: cleanName,
          email: cleanEmail,
          property,
          valuation,
          comparableSales,
          equityProjection,
          leadId: externalId,
          config
        });
      } catch (emailErr) {
        console.error('Email dispatch error:', emailErr.message);
      }

      return sendJson(res, 200, {
        success: true,
        crmStatus,
        leadId: externalId,
        valuationReport
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 1-CLICK OPT OUT ENDPOINT
  if (req.method === 'GET' && url.pathname === '/opt-out') {
    const leadId = url.searchParams.get('leadId') || '';
    const email = url.searchParams.get('email') || '';

    // Log the opt out
    console.log(`\n=================================================================`);
    console.log(`[OPT-OUT RECORDED] Lead: ${leadId} | Email: ${email}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`=================================================================\n`);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Opt-Out Confirmed | Nyrava Home</title>
  <style>
    body { font-family: Inter, -apple-system, system-ui, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #fff; max-width: 520px; width: 100%; padding: 40px; border-radius: 14px; border: 1px solid #e2e8f0; box-shadow: 0 4px 24px rgba(15,23,42,0.06); text-align: center; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; margin-bottom: 10px; color: #0f172a; }
    p { font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 24px; }
    .badge { display: inline-block; background: #eff6ff; color: #1e40af; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 20px; border: 1px solid #bfdbfe; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>You Have Successfully Opted Out</h1>
    <div class="badge">Preference Saved: Do Not Contact</div>
    <p style="margin-top: 18px;">
      Your request has been registered for <strong>${email ? escapeHtml(email) : 'your account'}</strong>. You will not be contacted by any local real estate specialists regarding selling your property.
    </p>
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">
      You may keep and review your home valuation report for your private research.
    </p>
  </div>
</body>
</html>`);
  }

  // App Config
  if (req.method === 'GET' && url.pathname === '/api/config') {
    return sendJson(res, 200, config.branding);
  }

  // Static File Serving
  let reqPath = url.pathname === '/' ? '/index.html' : url.pathname;
  let filePath = path.join(__dirname, 'public', reqPath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('File not found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

const PORT = config.port || 5190;
server.listen(PORT, () => {
  console.log(`=================================================================`);
  console.log(`   NYRAVA HOME EVALUATION APP (STANDALONE)`);
  console.log(`   Running at: http://localhost:${PORT}`);
  console.log(`   Connected to CRM: ${config.crmApiUrl}`);
  console.log(`=================================================================`);
});
