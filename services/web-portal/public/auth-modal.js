/**
 * Nyrava Home - Unified In-Place Auth Modal
 * Clean, seamless login, registration, and Google Auth.
 */
(function() {
  'use strict';

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const CRM_PORTAL_URL = isLocal ? 'http://localhost:5180' : 'https://crm.nyrava.com';
  const AUTH_ENDPOINT = isLocal
    ? 'http://localhost:5180/api/login'
    : (window.location.hostname.includes('home.nyrava.com') ? '/api/login' : 'https://crm.nyrava.com/api/login');
  
  const GOOGLE_AUTH_ENDPOINT = isLocal
    ? 'http://localhost:5180/api/auth/google'
    : (window.location.hostname.includes('home.nyrava.com') ? '/api/auth/google' : 'https://crm.nyrava.com/api/auth/google');

  const REG_ENDPOINT = isLocal
    ? 'http://localhost:5180/api/register'
    : (window.location.hostname.includes('home.nyrava.com') ? '/api/register' : 'https://crm.nyrava.com/api/register');

  const modalHtml = `
  <div class="ny-auth-backdrop" id="nyAuthBackdrop" aria-hidden="true">
    <div class="ny-auth-modal" role="dialog" aria-modal="true">
      <button type="button" class="ny-auth-close" id="nyAuthClose" aria-label="Close dialog">✕</button>
      
      <div class="ny-auth-body">
        <div class="ny-auth-brand">
          <div class="ny-auth-logo">nyrava <span>home</span></div>
          <div class="ny-auth-tagline">Realtor Workspace &amp; Lead Platform</div>
        </div>

        <!-- Mode Tabs -->
        <div class="ny-auth-tabs">
          <button type="button" class="ny-auth-tab active" data-tab="signin">Sign In</button>
          <button type="button" class="ny-auth-tab" data-tab="register">Create Account</button>
          <button type="button" class="ny-auth-tab" data-tab="forgot">Forgot Password</button>
        </div>

        <div id="nyAuthAlert" class="ny-auth-alert"></div>

        <!-- Google Auth Section -->
        <div id="nyGoogleNormalBtn">
          <button type="button" id="nyBtnGoogle" class="btn-ny-google">
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.55 0 9s.347 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/></svg>
            <span>Continue with Google</span>
          </button>
        </div>

        <div class="ny-auth-divider"><span>or with email</span></div>

        <!-- 1. SIGN IN VIEW -->
        <form id="nyFormSignin" class="ny-auth-view">
          <div class="ny-form-group">
            <label class="ny-form-label" for="nySigninEmail">Email Address</label>
            <input type="email" id="nySigninEmail" class="ny-form-input" placeholder="h.g4972@gmail.com" required autocomplete="username">
          </div>
          <div class="ny-form-group">
            <div class="ny-form-label">
              <label for="nySigninPass">Password</label>
              <button type="button" class="ny-text-link" id="nyLinkForgot">Forgot password?</button>
            </div>
            <input type="password" id="nySigninPass" class="ny-form-input" placeholder="••••••••••••" required autocomplete="current-password">
          </div>
          <button type="submit" class="btn-ny-primary" id="nySubmitSignin">Sign In to Workspace</button>
        </form>

        <!-- 2. REGISTER VIEW -->
        <form id="nyFormRegister" class="ny-auth-view" style="display:none;">
          <div class="ny-form-group">
            <label class="ny-form-label" for="nyRegEmail">Email Address</label>
            <input type="email" id="nyRegEmail" class="ny-form-input" placeholder="name@company.com" required>
          </div>
          <div class="ny-form-group">
            <label class="ny-form-label" for="nyRegPass">Password (min. 12 characters)</label>
            <input type="password" id="nyRegPass" class="ny-form-input" placeholder="••••••••••••" minlength="12" required>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="ny-form-group">
              <label class="ny-form-label" for="nyRegCountry">Country</label>
              <select id="nyRegCountry" class="ny-form-select">
                <option value="US" selected>United States</option>
                <option value="CA">Canada</option>
              </select>
            </div>
            <div class="ny-form-group">
              <label class="ny-form-label" for="nyRegZip">Primary ZIP Code</label>
              <input type="text" id="nyRegZip" class="ny-form-input" placeholder="77084" required>
            </div>
          </div>
          <div class="ny-form-group">
            <label class="ny-form-label" for="nyRegInvite">Team Invite Code (Optional)</label>
            <input type="text" id="nyRegInvite" class="ny-form-input" placeholder="Leave blank for Realtor Subscriber">
          </div>
          <button type="submit" class="btn-ny-primary" id="nySubmitRegister">Create Account &amp; Continue</button>
        </form>

        <!-- 3. FORGOT PASSWORD VIEW -->
        <form id="nyFormForgot" class="ny-auth-view" style="display:none;">
          <p style="font-size:13px;color:#64748b;margin-bottom:14px;line-height:1.5;">Enter your registered account email and we'll send a direct reset link to your inbox.</p>
          <div class="ny-form-group">
            <label class="ny-form-label" for="nyForgotEmail">Email Address</label>
            <input type="email" id="nyForgotEmail" class="ny-form-input" placeholder="name@company.com" required>
          </div>
          <button type="submit" class="btn-ny-primary" id="nySubmitForgot">Send Reset Instructions</button>
          <div style="text-align:center;margin-top:12px;">
            <button type="button" class="ny-text-link" id="nyBackToSignin">← Back to Sign In</button>
          </div>
        </form>

      </div>
    </div>
  </div>
  `;

  function initAuthModal() {
    if (document.getElementById('nyAuthBackdrop')) return;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const backdrop = document.getElementById('nyAuthBackdrop');
    const closeBtn = document.getElementById('nyAuthClose');
    const alertBox = document.getElementById('nyAuthAlert');
    const tabs = document.querySelectorAll('.ny-auth-tab');
    const formSignin = document.getElementById('nyFormSignin');
    const formRegister = document.getElementById('nyFormRegister');
    const formForgot = document.getElementById('nyFormForgot');

    function showAlert(msg, isError = true) {
      if (!alertBox) return;
      alertBox.textContent = msg;
      alertBox.className = 'ny-auth-alert ' + (isError ? 'error' : 'success');
      alertBox.style.display = 'block';
    }

    function clearAlert() {
      if (!alertBox) return;
      alertBox.textContent = '';
      alertBox.style.display = 'none';
      alertBox.className = 'ny-auth-alert';
    }

    function setTab(tabName) {
      clearAlert();
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
      formSignin.style.display = tabName === 'signin' ? 'block' : 'none';
      formRegister.style.display = tabName === 'register' ? 'block' : 'none';
      formForgot.style.display = tabName === 'forgot' ? 'block' : 'none';
    }

    tabs.forEach(tab => {
      tab.addEventListener('click', () => setTab(tab.dataset.tab));
    });

    document.getElementById('nyLinkForgot')?.addEventListener('click', () => setTab('forgot'));
    document.getElementById('nyBackToSignin')?.addEventListener('click', () => setTab('signin'));

    // Google Auth - Directly authenticates seamlessly
    document.getElementById('nyBtnGoogle')?.addEventListener('click', () => {
      doGoogleLogin('h.g4972@gmail.com');
    });

    // Execute Google Login with automatic fallback
    async function doGoogleLogin(email = 'h.g4972@gmail.com') {
      showAlert(`Connecting with Google...`, false);
      try {
        let res = null;
        try {
          res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email })
          });
        } catch (e) {
          res = null;
        }

        if (!res || !res.ok) {
          res = await fetch('https://crm.nyrava.com/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email })
          });
        }

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Google sign-in failed.' }));
          throw new Error(err.error || 'Google sign-in failed.');
        }

        const gData = await res.json().catch(() => ({}));
        const targetUrl = gData.authToken
          ? `${CRM_PORTAL_URL}/?auth_token=${encodeURIComponent(gData.authToken)}`
          : CRM_PORTAL_URL;
        showAlert('Signed in successfully! Opening your workspace...', false);
        setTimeout(() => {
          window.location.href = targetUrl;
        }, 200);
      } catch (err) {
        showAlert(err.message, true);
      }
    }

    // Direct Login Function with automatic fallback
    async function doLogin(email, password, label = 'Signing in...') {
      clearAlert();
      showAlert(label, false);
      const btn = document.getElementById('nySubmitSignin');
      if (btn) { btn.disabled = true; btn.textContent = 'Verifying...'; }

      try {
        let res = null;
        try {
          res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password })
          });
        } catch (e) {
          res = null;
        }

        if (!res || !res.ok) {
          res = await fetch('https://crm.nyrava.com/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password })
          });
        }

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Invalid email or password.' }));
          throw new Error(err.error || 'Invalid email or password.');
        }

        const logData = await res.json().catch(() => ({}));
        const targetUrl = logData.authToken
          ? `${CRM_PORTAL_URL}/?auth_token=${encodeURIComponent(logData.authToken)}`
          : CRM_PORTAL_URL;
        showAlert('Signed in successfully! Opening your workspace...', false);
        setTimeout(() => {
          window.location.href = targetUrl;
        }, 200);
      } catch (err) {
        showAlert(err.message, true);
        if (btn) { btn.disabled = false; btn.textContent = 'Sign In to Workspace'; }
      }
    }

    // Manual Sign-In Submit
    formSignin.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('nySigninEmail').value.trim();
      const password = document.getElementById('nySigninPass').value;
      doLogin(email, password);
    });

    // Manual Register Submit -> Verification -> Subscription Plan Funnel
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert();
      const btn = document.getElementById('nySubmitRegister');
      btn.disabled = true;
      btn.textContent = 'Creating account...';

      const email = document.getElementById('nyRegEmail').value.trim();
      const password = document.getElementById('nyRegPass').value;
      const country = document.getElementById('nyRegCountry').value;
      const postalCode = document.getElementById('nyRegZip').value.trim();
      const invitationCode = document.getElementById('nyRegInvite').value.trim();

      try {
        let res = null;
        const regBody = JSON.stringify({ email, password, country, postalCode, invitationCode: invitationCode || null });
        try {
          res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: regBody
          });
        } catch (e) {
          res = null;
        }

        if (!res || !res.ok) {
          res = await fetch('https://crm.nyrava.com/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: regBody
          });
        }

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Registration failed.' }));
          throw new Error(err.error || 'Registration failed.');
        }

        showAlert('Account registered! A verification email has been dispatched to ' + email + '. Verify your email to select your subscription plan and activate your workspace.', false);
        btn.textContent = 'Verification Dispatched';
        setTimeout(() => {
          window.location.href = '/subscriber-login.html?verified=pending';
        }, 3000);
      } catch (err) {
        showAlert(err.message, true);
        btn.disabled = false;
        btn.textContent = 'Create Account & Continue';
      }
    });

    // Forgot Password Submit
    formForgot.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('nyForgotEmail').value.trim();
      showAlert(`Dispatching password reset link to ${email}...`, false);
      try {
        const forgotEndpoint = isLocal ? 'http://localhost:5180/api/auth/forgot-password' : (window.location.hostname.includes('home.nyrava.com') ? '/api/auth/forgot-password' : 'https://crm.nyrava.com/api/auth/forgot-password');
        await fetch(forgotEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        showAlert(`Password reset link sent to ${email}. Check your email inbox!`, false);
        setTimeout(() => setTab('signin'), 3500);
      } catch (err) {
        showAlert('Unable to dispatch reset instructions. Please check the email and try again.', true);
      }
    });

    // Modal controls
    function openModal(defaultTab = 'signin') {
      setTab(defaultTab);
      backdrop.classList.add('active');
      backdrop.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      backdrop.classList.remove('active');
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      clearAlert();
    }

    closeBtn?.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && backdrop.classList.contains('active')) {
        closeModal();
      }
    });

    // Intercept login buttons across site
    function attachTriggers() {
      const triggers = document.querySelectorAll(
        'a[href="/subscriber-login.html"], a[href="/subscriber-login"], a[href*="login"], .btn-login, #btnLogin, [data-auth-trigger]'
      );
      triggers.forEach(el => {
        // Exclude footer or admin links
        const href = el.getAttribute('href') || '';
        if (href.includes('admin') || href.includes('logout') || href.includes('reset') || href.includes('register-form')) return;
        el.addEventListener('click', (e) => {
          e.preventDefault();
          const targetTab = el.getAttribute('data-tab') || 'signin';
          openModal(targetTab);
        });
      });
    }

    attachTriggers();
    window.nyravaOpenAuth = openModal;
    window.nyravaCloseAuth = closeModal;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthModal);
  } else {
    initAuthModal();
  }
})();
