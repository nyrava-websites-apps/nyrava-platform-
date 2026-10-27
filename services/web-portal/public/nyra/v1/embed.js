/* Nyra Mascot Voice Guide - Compact, Logo-Anchored, Section-by-Section Narrator */
(() => {
  'use strict';
  if (document.getElementById('nyra-sales-bot')) return;

  // Safe rootUrl resolution that never crashes even with defer/async
  const script = document.currentScript || document.querySelector('script[src*="embed.js"]');
  const scriptSrc = script ? script.src : '/nyra/v1/embed.js';
  const rootUrl = new URL('.', new URL(scriptSrc, window.location.href));

  // Section Tour Definition (Short, punchy, ending on pricing)
  const tourSections = [
    {
      target: '#top',
      selector: '.nw-wordmark',
      text: "Welcome to Nyrava Home! I am Nyra, your platform guide.",
      name: "Welcome"
    },
    {
      target: '.nw-hero',
      selector: '.nw-hero-copy',
      text: "We connect licensed Realtors with verified buyer and seller opportunities across sixty US metro territories.",
      name: "Overview"
    },
    {
      target: '#fsbo-section',
      selector: '#fsbo-section',
      text: "Homeowners can list their homes for sale by owner with zero fees, generating direct, exclusive seller opportunities for local agents.",
      name: "FSBO Listings"
    },
    {
      target: '.nw-features',
      selector: '.nw-feature-grid',
      text: "Access verified lead generation, automated home-value reports, and AI assistance to keep your business moving forward.",
      name: "Platform Tools"
    },
    {
      target: '#realtor-how-it-works',
      selector: '.realtor-explainer-grid',
      text: "Predictive analytics identify market signals, and our qualification verifies intent before opportunities reach your workspace.",
      name: "How It Works"
    },
    {
      target: '#realtor-tools',
      selector: '.tool-grid',
      text: "Give your team one connected workspace for lead summaries, AI follow-up drafting, and calendar reminders.",
      name: "Team Workspace"
    },
    {
      target: '#zip-availability',
      selector: '#zip-availability-form',
      text: "Check territory capacity in your target ZIP codes before they fill up. We cap subscribers to protect your pipeline.",
      name: "Territories"
    },
    {
      target: '#pricing',
      selector: '.pricing-grid',
      text: "Pricing is transparent: a 349 dollar annual license includes your first month, then Basic at 89 or Pro at 149 dollars monthly. Join today!",
      name: "Pricing"
    }
  ];

  let currentStep = -1;
  let isTouring = false;
  let isSpeaking = false;
  let highlightEl = null;
  let originalOutline = '';

  // Companion Host & Shadow DOM
  const host = document.createElement('div');
  host.id = 'nyra-sales-bot';
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        display: inline-block;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
        vertical-align: middle;
      }
      .nyra-companion {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        position: relative;
        z-index: 9999;
      }
      .nyra-avatar-btn {
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        position: relative;
        transition: transform 0.2s ease;
      }
      .nyra-avatar-btn:hover {
        transform: scale(1.08);
      }
      .nyra-avatar-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 2px 4px rgba(8, 102, 237, 0.25));
      }
      .nyra-avatar-btn.is-talking .nyra-avatar-img {
        animation: nyraBounce 0.45s infinite alternate ease-in-out;
      }
      @keyframes nyraBounce {
        from { transform: translateY(0); }
        to { transform: translateY(-3px); }
      }

      /* Floating Action Pill during Tour */
      .nyra-tour-pill {
        display: none;
        align-items: center;
        gap: 8px;
        background: #081a3a;
        color: #ffffff;
        padding: 6px 14px;
        border-radius: 20px;
        box-shadow: 0 4px 16px rgba(8, 26, 58, 0.35);
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
      }
      .nyra-companion.active .nyra-tour-pill {
        display: inline-flex;
      }
      .btn-pill-action {
        background: rgba(255, 255, 255, 0.2);
        color: #fff;
        border: none;
        border-radius: 12px;
        padding: 4px 10px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .btn-pill-action:hover {
        background: rgba(255, 255, 255, 0.35);
      }
      .btn-pill-stop {
        background: #ef4444;
        color: #fff;
      }
      .btn-pill-stop:hover {
        background: #dc2626;
      }

      /* Floating Placement when scrolling */
      .nyra-companion.floating {
        position: fixed;
        left: 24px;
        bottom: 24px;
        background: #ffffff;
        border: 1px solid #dce5ef;
        padding: 6px 14px;
        border-radius: 30px;
        box-shadow: 0 10px 30px rgba(8, 26, 58, 0.22);
        z-index: 999999;
      }
      .nyra-companion.floating .nyra-tour-pill {
        display: inline-flex;
        background: transparent;
        color: #081a3a;
        box-shadow: none;
        padding: 0;
      }
      .nyra-companion.floating .btn-pill-action {
        background: #f1f5f9;
        color: #081a3a;
        border: 1px solid #cbd5e1;
      }
      .nyra-companion.floating .btn-pill-stop {
        background: #fee2e2;
        color: #991b1b;
        border-color: #fecaca;
      }

      /* Audio Wave Animation */
      .nyra-audio-wave {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        height: 12px;
      }
      .nyra-audio-wave span {
        width: 3px;
        height: 100%;
        background: #0866ed;
        border-radius: 2px;
        animation: waveAnim 0.8s infinite ease-in-out;
      }
      .nyra-audio-wave span:nth-child(2) { animation-delay: 0.15s; }
      .nyra-audio-wave span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes waveAnim {
        0%, 100% { height: 3px; }
        50% { height: 12px; }
      }
    </style>

    <div class="nyra-companion" id="nyraCompanion">
      <button type="button" class="nyra-avatar-btn" id="nyraAvatarBtn" title="Click to listen to Nyra explain Nyrava Home" aria-label="Listen to Nyra">
        <img class="nyra-avatar-img" id="nyraImg" src="${new URL('assets/nyra-original.png', rootUrl).href}" alt="Nyra Mascot">
      </button>

      <div class="nyra-tour-pill" id="nyraPill">
        <div class="nyra-audio-wave" id="nyraWave" style="display:none;">
          <span></span><span></span><span></span>
        </div>
        <span id="nyraStatusText">Nyra</span>
        <button type="button" class="btn-pill-action" id="btnNextStep" title="Next Section">Next &gt;</button>
        <button type="button" class="btn-pill-action btn-pill-stop" id="btnStopTour" title="Stop">&#9209; Stop</button>
      </div>
    </div>
  `;

  // Attach into the companion slot next to the logo in the header
  function mountCompanion() {
    if (host.parentNode) return;
    const slot = document.getElementById('nyra-companion-slot');
    if (slot) {
      slot.appendChild(host);
    } else {
      const wordmark = document.querySelector('.nw-wordmark, .brand-wordmark, .nh-brand');
      if (wordmark && wordmark.parentNode) {
        wordmark.parentNode.insertBefore(host, wordmark);
      } else {
        document.body.appendChild(host);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountCompanion);
  } else {
    mountCompanion();
  }
  window.addEventListener('load', mountCompanion);

  const companion = shadow.getElementById('nyraCompanion');
  const avatarBtn = shadow.getElementById('nyraAvatarBtn');
  const avatarImg = shadow.getElementById('nyraImg');
  const wave = shadow.getElementById('nyraWave');
  const statusText = shadow.getElementById('nyraStatusText');
  const btnNext = shadow.getElementById('btnNextStep');
  const btnStop = shadow.getElementById('btnStopTour');

  function updateMascotImage(pose) {
    if (pose === 'point') {
      avatarImg.src = new URL('assets/nyra-point.png', rootUrl).href;
    } else if (pose === 'wave') {
      avatarImg.src = new URL('assets/nyra-wave.png', rootUrl).href;
    } else {
      avatarImg.src = new URL('assets/nyra-original.png', rootUrl).href;
    }
  }

  function highlightSection(selector) {
    if (highlightEl) {
      highlightEl.style.outline = originalOutline;
      highlightEl = null;
    }
    if (!selector) return;
    const target = document.querySelector(selector);
    if (target) {
      highlightEl = target;
      originalOutline = target.style.outline || '';
      target.style.outline = '3px solid #0866ed';
      target.style.outlineOffset = '6px';
      target.style.borderRadius = '8px';
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function clearHighlight() {
    if (highlightEl) {
      highlightEl.style.outline = originalOutline;
      highlightEl = null;
    }
  }

  // Speech Narration via Web Speech API
  function speak(text, onComplete) {
    if (!('speechSynthesis' in window)) {
      setTimeout(onComplete, 3500);
      return;
    }
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.05;
    utter.pitch = 1.05;
    utter.lang = 'en-US';

    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(v => (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Ava')) && v.lang.startsWith('en'));
    if (naturalVoice) utter.voice = naturalVoice;

    utter.onstart = () => {
      isSpeaking = true;
      avatarBtn.classList.add('is-talking');
      wave.style.display = 'inline-flex';
      updateMascotImage('point');
    };

    utter.onend = () => {
      isSpeaking = false;
      avatarBtn.classList.remove('is-talking');
      wave.style.display = 'none';
      updateMascotImage('original');
      if (onComplete) onComplete();
    };

    utter.onerror = () => {
      isSpeaking = false;
      avatarBtn.classList.remove('is-talking');
      wave.style.display = 'none';
      updateMascotImage('original');
      if (onComplete) onComplete();
    };

    window.speechSynthesis.speak(utter);
  }

  function stopTour() {
    isTouring = false;
    isSpeaking = false;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    clearHighlight();
    avatarBtn.classList.remove('is-talking');
    wave.style.display = 'none';
    companion.classList.remove('active', 'floating');
    updateMascotImage('original');
    currentStep = -1;
  }

  function playStep(index) {
    if (!isTouring || index >= tourSections.length) {
      stopTour();
      return;
    }
    currentStep = index;
    const step = tourSections[index];

    statusText.textContent = step.name;

    // Highlight and scroll to section (except step 0 which is the logo at top)
    if (index > 0) {
      highlightSection(step.selector || step.target);
      companion.classList.add('floating');
    } else {
      clearHighlight();
      companion.classList.remove('floating');
    }

    // Speak explanation
    speak(step.text, () => {
      if (isTouring) {
        setTimeout(() => {
          if (isTouring && currentStep === index) {
            playStep(index + 1);
          }
        }, 900);
      }
    });
  }

  function startTour() {
    isTouring = true;
    companion.classList.add('active');
    playStep(0);
  }

  avatarBtn.onclick = (e) => {
    e.stopPropagation();
    if (!isTouring) {
      startTour();
    } else {
      stopTour();
    }
  };

  btnNext.onclick = (e) => {
    e.stopPropagation();
    if (isTouring) {
      window.speechSynthesis.cancel();
      playStep(currentStep + 1);
    }
  };

  btnStop.onclick = (e) => {
    e.stopPropagation();
    stopTour();
  };

  window.NyravaTour = {
    start: startTour,
    stop: stopTour,
    next: () => playStep(currentStep + 1)
  };

})();
