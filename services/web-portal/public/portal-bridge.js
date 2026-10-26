// Nyrava Unified Platform Portal Bridge
// In-place authentication modal connector - prevents navigation away from home.nyrava.com
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('a[href*="nyrava-signin.html"], a[href*="create-account.html"], a[href*="billing-checkout.html"], a.nw-join').forEach(a => {
    a.removeAttribute('target');
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const href = a.getAttribute('href') || '';
      const mode = (href.includes('create-account') || href.includes('billing-checkout') || a.classList.contains('nw-join')) ? 'register' : 'signin';
      if (window.openAuthModal) {
        window.openAuthModal(mode);
      }
    });
  });
});
