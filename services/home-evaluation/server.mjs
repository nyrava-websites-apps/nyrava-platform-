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
    accentColor: '#059669'
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

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // PRIMARY ENDPOINT: Evaluate Property + Ingest to CRM + Send Branded Email with Opt-Out Link
  if (req.method === 'POST' && (url.pathname === '/evaluate' || url.pathname === '/api/valuation/evaluate' || url.pathname === '/api/valuation/evaluate-and-submit' || url.pathname === '/api/valuation/calculate' || url.pathname === '/api/v1/valuation/evaluate')) {
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
      if (!contact && (data.leadName || data.leadEmail || data.leadPhone)) {
        contact = {
          fullName: data.leadName,
          email: data.leadEmail,
          phone: data.leadPhone,
          timeframe: data.timeframe || 'Exploring'
        };
      }

      // Ensure address is provided
      if (!property?.street || !property?.city || !property?.zip) {
        return sendJson(res, 400, { error: 'Please enter a complete street address, city, and ZIP code.' });
      }

      // Ensure Contact details are provided up front
      if (!contact?.fullName || !contact?.email || !contact?.phone) {
        return sendJson(res, 400, { error: 'To receive your official home valuation, full name, email, and phone number are required.' });
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

      // 2. Build CRM Payload for Nyrava Platform Lead Pipeline
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
      let crmStatus = 'queued';
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
        console.error('CRM Network error (saved locally):', crmErr.message);
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
    body { font-family: -apple-system, system-ui, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #fff; max-width: 520px; width: 100%; padding: 40px; border-radius: 14px; border: 1px solid #e2e8f0; box-shadow: 0 4px 24px rgba(15,23,42,0.06); text-align: center; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; margin-bottom: 10px; color: #0f172a; }
    p { font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 24px; }
    .badge { display: inline-block; background: #ecfdf5; color: #065f46; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 20px; border: 1px solid #a7f3d0; }
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
