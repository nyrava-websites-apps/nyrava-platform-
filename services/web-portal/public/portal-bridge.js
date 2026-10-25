// Nyrava Unified Platform Portal Bridge
// Auto-connects Realtor and Team logins to CRM workspace
document.addEventListener('DOMContentLoaded', () => {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const crmBase = isLocal ? 'http://localhost:5180' : `${window.location.protocol}//crm.${host.replace('home.', '').replace('preview.', '')}`;

  // Point public login and account buttons to the CRM service
  document.querySelectorAll('a[href*="nyrava-signin.html"], a[href*="create-account.html"], a[href*="billing-checkout.html"], a.nw-join').forEach(a => {
    a.href = crmBase;
    a.target = '_blank';
  });
});
