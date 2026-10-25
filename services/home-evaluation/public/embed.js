(function() {
  const currentScript = document.currentScript;
  const containerId = currentScript ? currentScript.getAttribute('data-container') || 'nyrava-evaluation-widget' : 'nyrava-evaluation-widget';
  const target = document.getElementById(containerId);

  if (!target) {
    console.warn('Nyrava Home Evaluation: Container #' + containerId + ' not found.');
    return;
  }

  const iframe = document.createElement('iframe');
  const host = currentScript ? new URL(currentScript.src).origin : 'http://localhost:5190';
  iframe.src = host + '/index.html';
  iframe.style.width = '100%';
  iframe.style.height = '850px';
  iframe.style.border = '0';
  iframe.style.borderRadius = '12px';
  iframe.style.overflow = 'hidden';
  iframe.title = 'Nyrava Home Evaluation';

  target.innerHTML = '';
  target.appendChild(iframe);
})();
