'use strict';
const $ = id => document.getElementById(id);
let busy = false;

$('register').onsubmit = async e => {
  e.preventDefault();
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach(b => b.disabled = true);
  $('status').textContent = 'Creating your account…';

  try {
    const payload = {
      fullName: $('fullName')?.value.trim() || '',
      email: $('email').value.trim(),
      password: $('password').value,
      country: 'US',
      postalCode: '78701',
      plan: 'monthly',
      acceptTerms: true
    };

    let r = await fetch('/api/register', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      r = await fetch('/api/account-registration/create', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw Error(d.error || 'Account could not be created. Please try again.');
    }

    $('password').value = '';
    $('register').hidden = true;
    document.querySelector('h1').textContent = 'Account created!';
    $('status').textContent = d.message || 'Your account is ready. Redirecting to workspace…';

    // Store user session in localStorage
    if (d.user || d.email) {
      localStorage.setItem('hsi_user', JSON.stringify(d.user || { email: d.email, role: 'Owner' }));
    }
    if (d.authToken) {
      localStorage.setItem('hsi_auth_token', d.authToken);
    }

    setTimeout(() => {
      location.assign(d.url || '/dashboard/home');
    }, 1200);

  } catch (err) {
    $('status').textContent = err.message || 'Unable to connect. Please try again.';
  } finally {
    busy = false;
    document.querySelectorAll('button').forEach(b => b.disabled = false);
  }
};
