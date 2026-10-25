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
  const company = config.branding?.companyName || 'Nyrava Technologies';
  const phone = config.branding?.supportPhone || '(800) 555-0199';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 20px; line-height: 1.5; }
    .wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: #064e3b; padding: 24px 30px; color: #ffffff; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
    .header p { margin: 4px 0 0; font-size: 13px; color: #a7f3d0; }
    .body { padding: 30px; }
    .property-title { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
    .property-sub { font-size: 13px; color: #64748b; margin-bottom: 20px; }
    .val-card { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 22px; text-align: center; margin-bottom: 24px; }
    .val-label { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #065f46; letter-spacing: 0.08em; }
    .val-amount { font-size: 38px; font-weight: 800; color: #064e3b; margin: 4px 0; }
    .val-range { font-size: 13px; color: #047857; font-weight: 600; }
    .section-title { font-size: 15px; font-weight: 700; color: #1e293b; margin: 20px 0 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
    th { text-align: left; padding: 8px; background: #f1f5f9; color: #475569; font-weight: 600; }
    td { padding: 8px; border-bottom: 1px solid #f1f5f9; }
    .equity-row { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; border-bottom: 1px solid #f8fafc; }
    .realtor-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-top: 20px; font-size: 13px; color: #334155; }
    .optout-bar { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
    .optout-btn { display: inline-block; margin-top: 10px; padding: 8px 16px; background: #fee2e2; color: #991b1b; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 12px; border: 1px solid #fca5a5; }
    .footer { background: #f8fafc; padding: 16px 30px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>🏡 Nyrava Home Evaluation</h1>
      <p>Official Comparative Property Valuation Report</p>
    </div>
    <div class="body">
      <p style="font-size: 14px; margin-top: 0;">Hello <strong>${leadName}</strong>,</p>
      <p style="font-size: 13px; color: #475569;">Here is the official automated home valuation report you requested for your property.</p>

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
            <strong>$${p.value.toLocaleString()}</strong>
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
              <td style="color: #059669; font-weight: 700;">$${c.salePrice.toLocaleString()}</td>
              <td>${c.sqft} sqft</td>
              <td>${c.saleDate}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="realtor-box">
        <strong>📍 Local Market Specialist Coverage:</strong><br>
        A verified local real estate specialist covering ZIP <strong>${property.zip}</strong> has been notified to assist you with a complimentary in-person walk-through and official Comparative Market Analysis (CMA) if you plan to sell.
      </div>

      <!-- 1-CLICK OPT OUT LINK -->
      <div class="optout-bar">
        <strong>Prefer not to be contacted by an area Realtor?</strong><br>
        If you only requested this report for research and do not wish to be contacted by a local Realtor to help sell your home, you can opt out at any time with one click below:
        <br>
        <a href="${optOutUrl}" class="optout-btn">Opt Out of Realtor Assistance</a>
      </div>
    </div>
    <div class="footer">
      ${company} · Support: ${phone}<br>
      This valuation is an automated comparative estimate and not a formal bank appraisal. You received this because you requested a valuation report for ${property.street}.
    </div>
  </div>
</body>
</html>`;
}

export async function sendValuationEmail(options) {
  const { leadName, email, leadId, config, property } = options;
  const htmlContent = generateValuationEmailHtml(options);

  // 1. Always save a copy in outbox for verification, inspection, and compliance logs
  const filename = `valuation-${Date.now()}-${leadId}.html`;
  const filePath = path.join(outboxDir, filename);
  fs.writeFileSync(filePath, htmlContent, 'utf-8');

  let sentViaSmtp = false;

  // 2. If SMTP is configured, send the real email via nodemailer
  if (config.smtp && config.smtp.host && config.smtp.user && config.smtp.pass) {
    try {
      const transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: Number(config.smtp.port) || 587,
        secure: Number(config.smtp.port) === 465,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass
        }
      });

      const fromAddress = config.smtp.from || `"${config.branding?.companyName || 'Nyrava Home'}" <${config.smtp.user}>`;

      await transporter.sendMail({
        from: fromAddress,
        to: email,
        subject: `Your Official Home Valuation Report: ${property.street}`,
        html: htmlContent
      });

      sentViaSmtp = true;
      console.log(`[SMTP DELIVERED] Email successfully sent to ${email} via ${config.smtp.host}`);
    } catch (smtpErr) {
      console.warn(`[SMTP NOTICE] Could not send via SMTP (${smtpErr.message}). Outbox copy preserved.`);
    }
  }

  const optOutUrl = `http://localhost:${config.port || 5190}/opt-out?leadId=${encodeURIComponent(leadId)}&email=${encodeURIComponent(email)}`;
  console.log(`\n=================================================================`);
  console.log(`[EMAIL DISPATCHED] To: ${leadName} <${email}>`);
  console.log(`Status: ${sentViaSmtp ? 'Delivered via Live SMTP' : 'Saved to Outbox (Awaiting SMTP config)'}`);
  console.log(`Outbox Copy: ${filePath}`);
  console.log(`1-Click Opt-Out Link: ${optOutUrl}`);
  console.log(`=================================================================\n`);

  return { success: true, sentViaSmtp, file: filePath };
}
