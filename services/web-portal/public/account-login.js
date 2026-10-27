'use strict';
const $ = id => document.getElementById(id);
const employee = new URLSearchParams(location.search).get('role') === 'employee';
if (employee) {
  $('heading').textContent = 'Team member login.';
  $('subtitle').textContent = 'Sign in to your assigned workspace.';
  if ($('createLink')) $('createLink').hidden = true;
}
if (new URLSearchParams(location.search).get('verified') === '1') {
  $('status').textContent = 'Email verified. Sign in to choose your plan.';
}

$('login').onsubmit = async e => {
  e.preventDefault();
  $('submit').disabled = true;
  $('status').textContent = 'Signing in…';

  try {
    const payload = {
      email: $('email').value.trim(),
      password: $('password').value
    };

    let r = await fetch('/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      r = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    if (!r.ok) {
      const errData = await r.json().catch(() => ({}));
      $('status').textContent = errData.error || 'Invalid email or password. Please verify your credentials.';
      return;
    }

    const d = await r.json();
    const userRole = d.user?.role || d.role || 'Owner';
    const subStatus = d.user?.subscriptionStatus || d.subscriptionStatus || 'Active';

    localStorage.removeItem('hsi_token');
    localStorage.setItem('hsi_user', JSON.stringify(d.user || { email: d.email, role: userRole, subscriptionStatus: subStatus }));
    if (d.authToken) {
      localStorage.setItem('hsi_auth_token', d.authToken);
    }

    if (userRole === 'SuperAdmin' || userRole === 'Admin') {
      location.assign('/admin');
      return;
    }
    if (userRole === 'BusinessEmployee' || userRole === 'Employee') {
      const next = new URLSearchParams(location.search).get('next');
      location.assign(next?.startsWith('/team-meetings.html?') ? next : '/employee.html');
      return;
    }

    const next = new URLSearchParams(location.search).get('next');
    if (subStatus !== 'BILLING_PENDING' && next?.startsWith('/team-meetings.html?')) {
      location.assign(next);
      return;
    }

    location.assign(subStatus === 'BILLING_PENDING' ? '/billing-checkout.html' : '/dashboard/home');
  } catch (err) {
    $('status').textContent = 'Unable to connect. Please try again.';
  } finally {
    $('submit').disabled = false;
  }
};
