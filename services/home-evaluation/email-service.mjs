import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outboxDir = path.join(__dirname, 'outbox');

if (!fs.existsSync(outboxDir)) {
  fs.mkdirSync(outboxDir, { recursive: true });
}

export function generateValuationEmailHtml({ leadName, email, property, valuation, comparableSales, equityProjection, leadId, config }) {
  const host = config.publicUrl || `http://localhost:${config.port || 5190}`;
  const optOutUrl = `${host}/opt-out?leadId=${encodeURIComponent(leadId)}&email=${encodeURIComponent(email)}`;
  const company = config.branding?.companyName || 'Nyrava Home';
  const phone = config.branding?.supportPhone || '(800) 555-0199';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f4f6f8; color: #0f172a; margin: 0; padding: 20px; line-height: 1.5; }
    .wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 20px rgba(15,23,42,0.05); }
    .header { background: #041533; padding: 24px 30px; color: #ffffff; border-bottom: 2px solid #0066ff; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; color: #ffffff; }
    .header h1 span { color: #38bdf8; font-weight: 400; }
    .header p { margin: 6px 0 0; font-size: 12px; color: #93c5fd; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
    .body { padding: 30px; }
    .property-title { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
    .property-sub { font-size: 13px; color: #64748b; margin-bottom: 20px; }
    .val-card { background: linear-gradient(135deg, #041533 0%, #0c2552 100%); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px; color: #ffffff; }
    .val-label { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #38bdf8; letter-spacing: 0.08em; }
    .val-amount { font-size: 40px; font-weight: 800; color: #ffffff; margin: 6px 0; }
    .val-range { font-size: 13px; color: #93c5fd; font-weight: 500; }
    .section-title { font-size: 15px; font-weight: 700; color: #0f172a; margin: 20px 0 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
    th { text-align: left; padding: 9px; background: #f8fafc; color: #475569; font-weight: 600; border-bottom: 1px solid #e2e8f0; }
    td { padding: 9px; border-bottom: 1px solid #f1f5f9; }
    .equity-row { display: flex; justify-content: space-between; font-size: 13px; padding: 7px 0; border-bottom: 1px solid #f8fafc; }
    .realtor-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; margin-top: 20px; font-size: 13px; color: #1e3a8a; }
    .optout-bar { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
    .optout-btn { display: inline-block; margin-top: 10px; padding: 8px 16px; background: #fee2e2; color: #991b1b; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 12px; border: 1px solid #fca5a5; }
    .footer { background: #f8fafc; padding: 16px 30px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>nyrava <span>home</span></h1>
      <p>Comparative Market Analysis &amp; Property Valuation</p>
    </div>
    <div class="body">
      <p style="font-size: 14px; margin-top: 0;">Hello <strong>${leadName}</strong>,</p>
      <p style="font-size: 13px; color: #475569;">Here is the automated comparative market analysis report for your property.</p>

      <div class="property-title">${property.street}</div>
      <div class="property-sub">${property.city}, ${property.state} ${property.zip} · ${property.sqft} sqft · ${property.beds} Beds · ${property.baths} Baths</div>

      <div class="val-card">
        <div class="val-label">Estimated Current Market Value</div>
        <div class="val-amount">$${valuation.estimate.toLocaleString()}</div>
        <div class="val-range">Estimated Range: $${valuation.lowRange.toLocaleString()} – $${valuation.highRange.toLocaleString()} ($${valuation.pricePerSqft}/sqft)</div>
      </div>

      <div class="section-title">📊 3-Year Equity Projection</div>
      <div style="margin-bottom: 18px;">
        ${(equityProjection || []).map(p => `
          <div class="equity-row">
            <span>${p.year}</span>
            <strong style="color: #0066ff;">$${p.value.toLocaleString()}</strong>
          </div>
        `).join('')}
      </div>

      <div class="section-title">🏡 Nearby Comparable Sales in ZIP ${property.zip}</div>
      <table>
        <thead>
          <tr>
            <th>Comparable Address</th>
            <th>Sold Price</th>
            <th>Sqft</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${(comparableSales || []).map(c => `
            <tr>
              <td><strong>${c.address}</strong></td>
              <td style="color: #0066ff; font-weight: 700;">$${c.salePrice.toLocaleString()}</td>
              <td>${c.sqft} sqft</td>
              <td>${c.saleDate}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="realtor-box">
        <strong>📍 Local Market Specialist Coverage:</strong><br>
        This automated evaluation was calculated based on recorded MLS and public property transfers in your ZIP code. A licensed local market specialist can prepare a comprehensive in-person valuation or discuss your selling goals.
      </div>

      <div class="optout-bar">
        <strong>Communication Preferences &amp; Opt-Out</strong><br>
        If you do not wish to be contacted by local real estate specialists regarding this valuation request, you can click below:
        <br>
        <a href="${optOutUrl}" class="optout-btn">1-Click Opt-Out / Stop Contact</a>
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} ${company}. All rights reserved. · Privacy-First Real Estate Intelligence
    </div>
  </div>
</body>
</html>`;
}

export async function sendValuationEmail({ leadName, email, property, valuation, comparableSales, equityProjection, leadId, config }) {
  const html = generateValuationEmailHtml({ leadName, email, property, valuation, comparableSales, equityProjection, leadId, config });
  
  const timestamp = Date.now();
  const safeId = leadId ? leadId.replace(/[^a-zA-Z0-9_-]/g, '') : `eval-${timestamp}`;
  const outboxFilePath = path.join(outboxDir, `valuation-${timestamp}-${safeId}.html`);
  
  try {
    fs.writeFileSync(outboxFilePath, html, 'utf-8');
    console.log(`[EMAIL DISPATCHED] To: ${leadName} <${email}>\nStatus: Saved to Outbox (Awaiting SMTP config)\nOutbox Copy: ${outboxFilePath}\n1-Click Opt-Out Link: ${config.publicUrl || 'http://localhost:5190'}/opt-out?leadId=${encodeURIComponent(leadId)}&email=${encodeURIComponent(email)}\n`);
  } catch (saveErr) {
    console.error('Failed to save outbox email copy:', saveErr.message);
  }

  if (config.smtp && config.smtp.user && config.smtp.pass && !config.smtp.user.includes('your-email')) {
    try {
      const transporter = nodemailer.createTransport({
        host: config.smtp.host || 'smtp.gmail.com',
        port: config.smtp.port || 587,
        secure: config.smtp.port === 465,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass
        }
      });

      await transporter.sendMail({
        from: config.smtp.from || `"${config.branding?.appName || 'Nyrava Home Evaluation'}" <${config.smtp.user}>`,
        to: email,
        subject: `Your Nyrava Home Valuation: ${property.street} ($${valuation.estimate.toLocaleString()})`,
        html
      });
      console.log(`[SMTP SUCCESS] Sent valuation email to ${email}`);
    } catch (smtpErr) {
      console.warn(`[SMTP NOTICE] Could not send via SMTP (${smtpErr.message}). Outbox copy preserved.`);
    }
  }

  return { outboxFilePath };
}
