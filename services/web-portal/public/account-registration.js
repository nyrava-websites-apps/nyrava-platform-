'use strict';
const $ = id => document.getElementById(id);
let busy = false;
const requestedPlan = new URLSearchParams(location.search).get('plan')?.toUpperCase();
const selectedPlan = ['BASIC', 'PRO'].includes(requestedPlan) ? requestedPlan : null;
if (selectedPlan) {
  const intro = document.querySelector('.auth-shell > p');
  if (intro) intro.textContent = `Create your account to continue with ${selectedPlan === 'PRO' ? 'Pro' : 'Basic'}. After signup, review the billing terms before secure checkout.`;
}

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
    $('status').textContent = selectedPlan
      ? `Account created. Redirecting to ${selectedPlan === 'PRO' ? 'Pro' : 'Basic'} checkout…`
      : (d.message || 'Your account is ready. Redirecting to workspace…');

    // Store user session in localStorage
    if (d.user || d.email) {
      localStorage.setItem('hsi_user', JSON.stringify(d.user || { email: d.email, role: 'Owner' }));
    }
    if (d.authToken) {
      localStorage.setItem('hsi_auth_token', d.authToken);
    }

    setTimeout(() => {
      const next = selectedPlan
        ? `/billing-checkout.html?plan=${selectedPlan}&start=1`
        : (d.url || '/dashboard/home');
      location.assign(next);
    }, 1200);

  } catch (err) {
    $('status').textContent = err.message || 'Unable to connect. Please try again.';
  } finally {
    busy = false;
    document.querySelectorAll('button').forEach(b => b.disabled = false);
  }
};
