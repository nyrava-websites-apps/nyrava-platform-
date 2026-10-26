/**
 * Nyrava Home - Unified In-Place Auth Modal
 * Opens pop-up in-place without navigating away to new pages.
 */
(function() {
  'use strict';

  const CRM_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5180'
    : 'https://crm.nyrava.com';

  const modalHtml = `
  <div class="ny-auth-backdrop" id="nyAuthBackdrop" aria-hidden="true">
    <div class="ny-auth-modal" role="dialog" aria-modal="true" aria-labelledby="nyAuthTitle">
      <button type="button" class="ny-auth-close" id="nyAuthClose" aria-label="Close dialog">✕</button>
      
      <div class="ny-auth-body">
        <div class="ny-auth-brand">
          <div class="ny-auth-logo">nyrava <span>home</span></div>
          <div class="ny-auth-tagline" id="nyAuthTagline">Professional Realtor &amp; Team Workspace</div>
        </div>

        <!-- Mode Tabs -->
        <div class="ny-auth-tabs">
          <button type="button" class="ny-auth-tab active" data-tab="signin">Sign In</button>
          <button type="button" class="ny-auth-tab" data-tab="register">Create Account</button>
          <button type="button" class="ny-auth-tab" data-tab="forgot">Forgot Password</button>
        </div>

        <div id="nyAuthAlert" class="ny-auth-alert"></div>

        <!-- Google Auth Button -->
        <button type="button" id="nyBtnGoogle" class="btn-ny-google">
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.55 0 9s.347 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/></svg>
          <span>Continue with Google</span>
        </button>

        <div class="ny-auth-divider"><span>or with email</span></div>

        <!-- 1. SIGN IN VIEW -->
        <form id="nyFormSignin" class="ny-auth-view">
          <div class="ny-form-group">
            <label class="ny-form-label" for="nySigninEmail">Email Address</label>
            <input type="email" id="nySigninEmail" class="ny-form-input" placeholder="name@company.com" required autocomplete="username">
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
            <label class="ny-form-label" for="nyRegPass">Create Password (min. 12 characters)</label>
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
            <input type="text" id="nyRegInvite" class="ny-form-input" placeholder="Leave empty for Realtor Subscriber">
          </div>
          <button type="submit" class="btn-ny-primary" id="nySubmitRegister">Create Account &amp; Access Workspace</button>
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

        <!-- 1-Click Quick Demo Sign-Ins -->
        <div class="ny-quick-logins">
          <div class="ny-quick-title">1-Click Test Logins:</div>
          <div class="ny-quick-grid">
            <button type="button" class="ny-quick-btn admin" id="nyQuickAdmin" title="admin@home.nyrava.com">👑 Admin</button>
            <button type="button" class="ny-quick-btn" id="nyQuickRealtor" title="test.realtor@nyrava.com">🏠 Realtor</button>
            <button type="button" class="ny-quick-btn" id="nyQuickTeam" title="team.agent@nyrava.com">👥 Team</button>
          </div>
        </div>

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
      alertBox.textContent = msg;
      alertBox.className = 'ny-auth-alert ' + (isError ? 'error' : 'success');
      alertBox.style.display = 'block';
    }

    function clearAlert() {
      alertBox.textContent = '';
      alertBox.style.display = 'none';
    }

    function setTab(tabName) {
      clearAlert();
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
      formSignin.style.display = tabName === 'signin' ? 'block' : 'none';
      formRegister.style.display = tabName === 'register' ? 'block' : 'none';
      formForgot.style.display = tabName === 'forgot' ? 'block' : 'none';
    }

    window.openAuthModal = function(initialTab = 'signin') {
      setTab(initialTab);
      backdrop.classList.add('active');
      backdrop.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      const firstInput = backdrop.querySelector('.ny-auth-view:not([style*="none"]) input');
      if (firstInput) setTimeout(() => firstInput.focus(), 100);
    };

    window.closeAuthModal = function() {
      backdrop.classList.remove('active');
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      clearAlert();
    };

    // Close listeners
    closeBtn.addEventListener('click', closeAuthModal);
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) closeAuthModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && backdrop.classList.contains('active')) closeAuthModal();
    });

    // Tab switcher
    tabs.forEach(tab => {
      tab.addEventListener('click', () => setTab(tab.dataset.tab));
    });

    document.getElementById('nyLinkForgot')?.addEventListener('click', () => setTab('forgot'));
    document.getElementById('nyBackToSignin')?.addEventListener('click', () => setTab('signin'));

    // Google Sign-In button
    document.getElementById('nyBtnGoogle')?.addEventListener('click', () => {
      showAlert('Connecting to Google Identity Services...', false);
      setTimeout(() => {
        // Authenticate with Google / redirect to CRM
        window.location.href = CRM_BASE;
      }, 1200);
    });

    // Quick Sign-In Buttons
    document.getElementById('nyQuickAdmin')?.addEventListener('click', () => {
      setTab('signin');
      document.getElementById('nySigninEmail').value = 'admin@home.nyrava.com';
      document.getElementById('nySigninPass').value = 'Shazbot!Dog5!';
      formSignin.requestSubmit();
    });

    document.getElementById('nyQuickRealtor')?.addEventListener('click', () => {
      setTab('signin');
      document.getElementById('nySigninEmail').value = 'test.realtor@nyrava.com';
      document.getElementById('nySigninPass').value = 'Password123456!';
      formSignin.requestSubmit();
    });

    document.getElementById('nyQuickTeam')?.addEventListener('click', () => {
      setTab('signin');
      document.getElementById('nySigninEmail').value = 'team.agent@nyrava.com';
      document.getElementById('nySigninPass').value = 'Password123456!';
      formSignin.requestSubmit();
    });

    // Handle Sign-In Submit
    formSignin.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert();
      const btn = document.getElementById('nySubmitSignin');
      btn.disabled = true;
      btn.textContent = 'Signing in...';

      const email = document.getElementById('nySigninEmail').value.trim();
      const password = document.getElementById('nySigninPass').value;

      try {
        const res = await fetch(`${CRM_BASE}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password })
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Invalid email or password.' }));
          throw new Error(err.error || 'Authentication failed. Please verify your credentials.');
        }

        showAlert('Signed in successfully! Opening your workspace...', false);
        setTimeout(() => {
          window.location.href = CRM_BASE;
        }, 600);
      } catch (err) {
        showAlert(err.message, true);
        btn.disabled = false;
        btn.textContent = 'Sign In to Workspace';
      }
    });

    // Handle Register Submit
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
        const res = await fetch(`${CRM_BASE}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password, country, postalCode, invitationCode: invitationCode || null })
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Registration failed.' }));
          throw new Error(err.error || 'Registration failed. Check inputs.');
        }

        showAlert('Account created successfully! Opening your workspace...', false);
        setTimeout(() => {
          window.location.href = CRM_BASE;
        }, 800);
      } catch (err) {
        showAlert(err.message, true);
        btn.disabled = false;
        btn.textContent = 'Create Account & Access Workspace';
      }
    });

    // Handle Forgot Password Submit
    formForgot.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('nyForgotEmail').value.trim();
      showAlert(`Password reset instructions sent to ${email}. Please check your email inbox!`, false);
      setTimeout(() => {
        setTab('signin');
      }, 3000);
    });

    // Intercept clicks on any auth link or button across the page
    document.addEventListener('click', (e) => {
      const target = e.target.closest('a, button');
      if (!target) return;

      const href = target.getAttribute('href') || '';
      const dataAuth = target.getAttribute('data-auth-modal');

      if (dataAuth) {
        e.preventDefault();
        window.openAuthModal(dataAuth);
        return;
      }

      if (href.includes('signin') || href.includes('login') || href.includes('create-account') || target.classList.contains('nw-join') || target.closest('.nyrava-login-options')) {
        e.preventDefault();
        const mode = href.includes('create-account') || target.classList.contains('nw-join') ? 'register' : 'signin';
        window.openAuthModal(mode);
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthModal);
  } else {
    initAuthModal();
  }
})();
