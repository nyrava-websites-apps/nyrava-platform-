// Portal bridge neutralizer: Allows direct navigation to sign-in and account registration
window.openAuthModal = window.nyravaOpenAuth || function(mode) {
  if (mode === 'register') {
    window.location.href = '/create-account.html';
  } else {
    window.location.href = '/nyrava-signin.html';
  }
};
