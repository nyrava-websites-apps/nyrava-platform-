/* Nyra Mascot Voice Guide - Compact, Logo-Anchored, Section-by-Section Narrator */
(() => {
  'use strict';
  if (document.getElementById('nyra-sales-bot')) return;

  const script = document.currentScript;
  const rootUrl = new URL('.', script.src);
  const homeTour = ['/', '/index.html'].includes(location.pathname);

  // Section Tour Definition
  const tourSections = [
    {
      target: '#top',
      selector: '.nw-wordmark',
      text: "Welcome to Nyrava Home! I am Nyra. We connect licensed real estate professionals with verified local buyer and seller opportunities across 60 US metro territories.",
      name: "Welcome"
    },
    {
      target: '.nw-hero',
      selector: '.nw-hero-copy',
      text: "Our platform gives you more time with clients and less time finding them, with predictive analytics, verified local leads, and complete team tools.",
      name: "Overview"
    },
    {
      target: '.nw-homeowner',
      selector: '.nw-homeowner-inner',
      text: "Homeowners use our valuation and moving tools to request help buying or selling, creating direct inbound opportunities for participating local Realtors.",
      name: "Inbound Leads"
    },
    {
      target: '.nw-features',
      selector: '.nw-feature-grid',
      text: "Explore our core features: verified lead generation, comprehensive home-value reports, and connected team follow-up tools all in one workspace.",
      name: "Platform Tools"
    },
    {
      target: '#realtor-how-it-works',
      selector: '.realtor-explainer-grid',
      text: "How it works: We use predictive analytics to identify signals, qualify buyer and seller intent, and deliver organized opportunities ready for your follow-up.",
      name: "How It Works"
    },
    {
      target: '#realtor-tools',
      selector: '.tool-grid',
      text: "Your team gets one connected workspace for lead summaries, AI follow-up assistance, private valuation reports, and organized task reminders.",
      name: "Team Workspace"
    },
    {
      target: '#zip-availability',
      selector: '#zip-availability-form',
      text: "Check territory availability in your target ZIP codes. We limit subscriber capacity per ZIP so your opportunities remain exclusive.",
      name: "Territory Capacity"
    },
    {
      target: '#pricing',
      selector: '.pricing-grid',
      text: "Our transparent pricing: Basic at $89 a month or Pro at $149 a month, with a $349 annual license that includes your first month of service.",
      name: "Plans & Pricing"
    }
  ];

  let currentStep = -1;
  let isTouring = false;
  let isSpeaking = false;
  let activeUtterance = null;
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
      }
      .nyra-companion {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        position: relative;
        z-index: 9999;
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .nyra-avatar-btn {
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
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
        filter: drop-shadow(0 2px 6px rgba(8, 102, 255, 0.25));
      }
      .nyra-avatar-btn.is-talking .nyra-avatar-img {
        animation: nyraBounce 0.6s infinite alternate ease-in-out;
      }
      @keyframes nyraBounce {
        from { transform: translateY(0); }
        to { transform: translateY(-3px); }
      }
      .nyra-badge {
        position: absolute;
        top: -2px;
        right: -2px;
        background: #0866ff;
        color: #fff;
        font-size: 9px;
        font-weight: 800;
        border-radius: 10px;
        padding: 1px 4px;
        border: 1px solid #fff;
      }

      /* Compact Floating Action Pill */
      .nyra-tour-pill {
        display: none;
        align-items: center;
        gap: 8px;
        background: #081a3a;
        color: #ffffff;
        padding: 6px 12px;
        border-radius: 20px;
        box-shadow: 0 4px 16px rgba(8, 26, 58, 0.3);
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
      }
      .nyra-companion.active .nyra-tour-pill {
        display: inline-flex;
      }
      .btn-pill-action {
        background: rgba(255, 255, 255, 0.15);
        color: #fff;
        border: none;
        border-radius: 12px;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .btn-pill-action:hover {
        background: rgba(255, 255, 255, 0.3);
      }
      .btn-pill-stop {
        background: #ef4444;
        color: #fff;
      }
      .btn-pill-stop:hover {
        background: #dc2626;
      }

      /* Fixed Touring Overlay Placement */
      .nyra-companion.floating {
        position: fixed;
        left: 20px;
        bottom: 24px;
        background: #ffffff;
        border: 1px solid #dce5ef;
        padding: 6px 12px;
        border-radius: 30px;
        box-shadow: 0 8px 28px rgba(8, 26, 58, 0.2);
        animation: nyraFlyIn 0.35s ease-out;
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
      .nyra-companion.floating .btn-pill-action:hover {
        background: #e2e8f0;
      }
      .nyra-companion.floating .btn-pill-stop {
        background: #fee2e2;
        color: #991b1b;
        border-color: #fecaca;
      }
      .nyra-companion.floating .btn-pill-stop:hover {
        background: #fecaca;
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
        background: #00bfc5;
        border-radius: 2px;
        animation: waveAnim 0.8s infinite ease-in-out;
      }
      .nyra-audio-wave span:nth-child(2) { animation-delay: 0.15s; }
      .nyra-audio-wave span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes waveAnim {
        0%, 100% { height: 4px; }
        50% { height: 12px; }
      }
    </style>

    <div class="nyra-companion" id="nyraCompanion">
      <button type="button" class="nyra-avatar-btn" id="nyraAvatarBtn" title="Nyra: Listen to Platform Tour" aria-label="Nyra Tour">
        <img class="nyra-avatar-img" id="nyraImg" src="${new URL('assets/nyra-original.png', rootUrl).href}" alt="Nyra Bot">
        <span class="nyra-badge" id="nyraBadge">Tour</span>
      </button>

      <div class="nyra-tour-pill" id="nyraPill">
        <div class="nyra-audio-wave" id="nyraWave" style="display:none;">
          <span></span><span></span><span></span>
        </div>
        <span id="nyraStatusText">Touring</span>
        <button type="button" class="btn-pill-action" id="btnNextStep" title="Next Section">Next ❯</button>
        <button type="button" class="btn-pill-action btn-pill-stop" id="btnStopTour" title="Stop Tour">⏹ Stop</button>
      </div>
    </div>
  `;

  // Attach into the companion slot next to the logo in the header
  function mountCompanion() {
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

  const companion = shadow.getElementById('nyraCompanion');
  const avatarBtn = shadow.getElementById('nyraAvatarBtn');
  const avatarImg = shadow.getElementById('nyraImg');
  const badge = shadow.getElementById('nyraBadge');
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
      target.style.outline = '3px solid #00bfc5';
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
      setTimeout(onComplete, 4000);
      return;
    }
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.0;
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

    activeUtterance = utter;
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
    badge.textContent = 'Tour';
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

    // Position indicator
    badge.textContent = `${index + 1}/${tourSections.length}`;
    statusText.textContent = step.name;

    // Highlight and scroll to section
    highlightSection(step.selector || step.target);

    // Make companion float smoothly alongside the tour
    if (index > 0) {
      companion.classList.add('floating');
    } else {
      companion.classList.remove('floating');
    }

    // Speak explanation
    speak(step.text, () => {
      if (isTouring) {
        setTimeout(() => {
          if (isTouring && currentStep === index) {
            playStep(index + 1);
          }
        }, 1200);
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

  // Expose global controller
  window.NyravaTour = {
    start: startTour,
    stop: stopTour,
    next: () => playStep(currentStep + 1)
  };

})();
