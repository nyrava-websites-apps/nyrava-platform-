import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

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

// Proxy routes to other Nyrava services
app.use('/api/valuation', createProxyMiddleware({
  target: VALUATION_SERVICE_URL,
  changeOrigin: true
}));

app.use('/api/crm', createProxyMiddleware({
  target: CRM_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/crm': '/api/v1' }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '1h'
}));

// Health check
app.get('/health', (req, res) => {
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
