// Nyrava Unified Platform Portal Bridge
// Auto-connects Login, CRM, and Video Meet based on current environment
document.addEventListener('DOMContentLoaded', () => {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const crmBase = isLocal ? 'http://localhost:5180' : `${window.location.protocol}//crm.${host.replace('home.', '').replace('preview.', '')}`;
  const meetBase = isLocal ? 'http://localhost:5000' : `${window.location.protocol}//meet.${host.replace('home.', '').replace('preview.', '')}`;

  // Point all CRM, Login, and Signup links to the active CRM service
  document.querySelectorAll('a[href*="nyrava-signin.html"], a[href*="create-account.html"], a[href*="billing-checkout.html"], a.nw-join').forEach(a => {
    a.href = crmBase;
    a.target = '_blank';
  });

  // Add Nyra Meet link in the top navigation if not already present
  const nav = document.getElementById('main-nav');
  if (nav && !document.getElementById('nav-meet-btn')) {
    const meetBtn = document.createElement('a');
    meetBtn.id = 'nav-meet-btn';
    meetBtn.href = meetBase;
    meetBtn.target = '_blank';
    meetBtn.className = 'nw-primary';
    meetBtn.style.cssText = 'padding: 6px 14px; font-size: 13px; font-weight: 700; margin-left: 12px; background: #0866FF; color: #fff; border-radius: 6px; text-decoration: none;';
    meetBtn.textContent = 'Nyra Meet ↗';
    nav.appendChild(meetBtn);
  }
});
