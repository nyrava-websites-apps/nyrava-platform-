(()=>{
  'use strict';
  const form = document.getElementById('login');
  const button = document.getElementById('submit');
  const status = document.getElementById('status');
  let busy = false;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    busy = true;
    button.disabled = true;
    status.textContent = 'Verifying administrator access…';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      let response = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        response = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
      }

      if (!response.ok) {
        status.textContent = 'Invalid administrator credentials. Please try again.';
        return;
      }

      const data = await response.json();
      const userRole = data.role || data.user?.role;
      const userEmail = (data.email || data.user?.email || '').toLowerCase();
      const isMasterAdmin = userEmail === 'admin@home.nyrava.com' || userRole === 'Admin' || userRole === 'SuperAdmin';

      if (!isMasterAdmin) {
        status.textContent = 'Administrator privileges required for this portal.';
        return;
      }

      localStorage.removeItem('hsi_token');
      localStorage.setItem('hsi_user', JSON.stringify({ email: userEmail, role: 'SuperAdmin', fullName: 'Platform Administrator' }));
      status.style.color = '#059669';
      status.textContent = 'Administrator verified. Loading platform operations…';
      setTimeout(() => {
        location.assign('/admin.html');
      }, 300);
    } catch {
      status.textContent = 'Unable to complete sign-in. Please try again.';
    } finally {
      busy = false;
      button.disabled = false;
    }
  });
})();
