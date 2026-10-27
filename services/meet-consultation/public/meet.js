// Nyrava Team Meet WebRTC Engine & Consultation Client
(function () {
  'use strict';

  // 1. Parse Room & User Parameters
  const urlParams = new URLSearchParams(window.location.search);
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  let room = urlParams.get('room') || (pathParts[0] === 'room' ? pathParts[1] : (pathParts[0] || 'general'));
  const userName = urlParams.get('name') || 'Participant-' + Math.floor(1000 + Math.random() * 9000);
  const isEmbed = urlParams.get('embed') === '1';

  // In embed mode, completely hide the inner header so there is NO double header
  if (isEmbed) {
    document.body.classList.add('embed-mode');
    const hdr = document.getElementById('meetHeader');
    if (hdr) hdr.style.display = 'none';
  }

  const roomIndicator = document.getElementById('roomIndicator');
  if (roomIndicator) roomIndicator.textContent = `Room: ${room}`;
  const localLabel = document.getElementById('localLabelName');
  if (localLabel) localLabel.textContent = `${userName} (You)`;

  // 2. WebRTC Peer & Media Setup
  let rawCameraStream = null;
  let activeVideoStream = null; // Either camera, canvas filtered, or screen
  let screenStream = null;
  let isMicActive = true;
  let isCamActive = true;
  let isScreenSharing = false;

  // Background and Filter Settings
  let currentBg = 'none';
  let currentFilter = 'none';
  let canvasElem = null;
  let canvasCtx = null;
  let canvasStream = null;
  let animFrameId = null;

  // Virtual background photorealistic backdrops
  const bgImages = {
    office: new Image(),
    penthouse: new Image(),
    studio: new Image()
  };
  bgImages.office.src = '/backgrounds/office.svg';
  bgImages.penthouse.src = '/backgrounds/penthouse.svg';
  bgImages.studio.src = '/backgrounds/studio.svg';

  const peerConnections = new Map(); // peerId -> RTCPeerConnection
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:meet.nyrava.com:3478' },
      { urls: 'turn:meet.nyrava.com:3478', username: 'nyrava_user', credential: 'turn_secure_pass_2026' }
    ]
  };

  // 3. Connect to Signaling Server
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = async () => {
    console.log('[Nyrava Team Meet] Connected to signaling server');
    await startLocalMedia();
    ws.send(JSON.stringify({
      type: 'join',
      room: room,
      name: userName
    }));
  };

  ws.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'error') {
        alert(data.message || 'Room error');
        return;
      }

      if (data.type === 'room-joined') {
        for (const peer of data.peers) {
          await createPeerConnection(peer.id, peer.name, true);
        }
        updateVideoGridLayout();
      }

      if (data.type === 'peer-joined') {
        addSysMessage(`${data.name} joined the meeting.`);
        await createPeerConnection(data.peerId, data.name, false);
        updateVideoGridLayout();
      }

      if (data.type === 'offer') {
        const pc = peerConnections.get(data.from);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({
            type: 'answer',
            target: data.from,
            answer: answer
          }));
        }
      }

      if (data.type === 'answer') {
        const pc = peerConnections.get(data.from);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
      }

      if (data.type === 'ice-candidate') {
        const pc = peerConnections.get(data.from);
        if (pc && data.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      }

      if (data.type === 'peer-left') {
        removePeer(data.peerId);
        updateVideoGridLayout();
      }

      if (data.type === 'chat') {
        appendChatMessage(data.name, data.text, data.from === ws.clientId, data.timestamp);
      }
    } catch (e) {
      console.warn('[Signaling message error]', e);
    }
  };

  // 4. Local Media Initializer
  async function startLocalMedia(videoDeviceId, audioDeviceId) {
    try {
      const constraints = {
        video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true
      };
      rawCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      activeVideoStream = rawCameraStream;

      const localVid = document.getElementById('localVideo');
      const localVidBg = document.getElementById('localVideoBg');
      if (localVid) localVid.srcObject = activeVideoStream;
      if (localVidBg) localVidBg.srcObject = activeVideoStream;

      // Populate hardware devices list in settings
      populateDeviceList();
      updateVideoGridLayout();
    } catch (err) {
      console.warn('[Media Error] Could not access camera/mic:', err.message);
      addSysMessage('Camera or microphone access denied. You are joined in listen-only mode.');
    }
  }

  // Populate Device Dropdowns in Settings Modal
  async function populateDeviceList() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const selCam = document.getElementById('selectCamera');
      const selMic = document.getElementById('selectMic');
      if (!selCam || !selMic) return;

      selCam.innerHTML = '';
      selMic.innerHTML = '';

      let camCount = 0;
      let micCount = 0;

      devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        if (d.kind === 'videoinput') {
          camCount++;
          opt.textContent = d.label || `Camera ${camCount}`;
          selCam.appendChild(opt);
        } else if (d.kind === 'audioinput') {
          micCount++;
          opt.textContent = d.label || `Microphone ${micCount}`;
          selMic.appendChild(opt);
        }
      });
    } catch (e) {
      console.warn('enumerateDevices error', e);
    }
  }

  // 5. Video Processing Pipeline (Virtual Backgrounds & Tone Filters)
  function setupCanvasPipeline() {
    if (!canvasElem) {
      canvasElem = document.createElement('canvas');
      canvasElem.width = 1280;
      canvasElem.height = 720;
      canvasCtx = canvasElem.getContext('2d');
      canvasStream = canvasElem.captureStream(30);
    }
  }

  function renderProcessedFrame() {
    if (!rawCameraStream || isScreenSharing) return;
    const localVid = document.getElementById('localVideo');
    if (!localVid) return;

    setupCanvasPipeline();

    // 1. Determine Tone Filter String
    let filterStr = 'none';
    if (currentFilter === 'warm') filterStr = 'sepia(0.28) saturate(1.3) contrast(1.08)';
    else if (currentFilter === 'cool') filterStr = 'hue-rotate(18deg) saturate(1.15) contrast(1.1) brightness(1.04)';
    else if (currentFilter === 'cinema') filterStr = 'grayscale(1) contrast(1.25) brightness(1.02)';
    else if (currentFilter === 'vivid') filterStr = 'contrast(1.25) saturate(1.4) brightness(1.05)';

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, 1280, 720);

    // 2. Composite Background & Person
    if ((currentBg === 'office' && bgImages.office.complete) ||
        (currentBg === 'penthouse' && bgImages.penthouse.complete) ||
        (currentBg === 'studio' && bgImages.studio.complete)) {
      const bgImg = bgImages[currentBg];
      canvasCtx.drawImage(bgImg, 0, 0, 1280, 720);

      // Masked foreground portrait
      canvasCtx.save();
      if (filterStr !== 'none') canvasCtx.filter = filterStr;
      canvasCtx.beginPath();
      canvasCtx.ellipse(640, 430, 420, 350, 0, 0, Math.PI * 2);
      canvasCtx.clip();
      canvasCtx.drawImage(localVid, 0, 0, 1280, 720);
      canvasCtx.restore();
    } else if (currentBg === 'blur-soft' || currentBg === 'blur-deep') {
      const blurPx = currentBg === 'blur-soft' ? '12px' : '26px';
      // Blurred background layer
      canvasCtx.save();
      canvasCtx.filter = (filterStr === 'none' ? '' : filterStr + ' ') + `blur(${blurPx})`;
      canvasCtx.drawImage(localVid, -20, -20, 1320, 760);
      canvasCtx.restore();

      // Sharp portrait foreground layer
      canvasCtx.save();
      if (filterStr !== 'none') canvasCtx.filter = filterStr;
      canvasCtx.beginPath();
      canvasCtx.ellipse(640, 430, 420, 350, 0, 0, Math.PI * 2);
      canvasCtx.clip();
      canvasCtx.drawImage(localVid, 0, 0, 1280, 720);
      canvasCtx.restore();
    } else {
      // Raw or tone filter only
      if (filterStr !== 'none') canvasCtx.filter = filterStr;
      canvasCtx.drawImage(localVid, 0, 0, 1280, 720);
    }

    canvasCtx.restore();

    if (currentBg !== 'none' || currentFilter !== 'none') {
      animFrameId = requestAnimationFrame(renderProcessedFrame);
    }
  }

  function applyEffects() {
    if (isScreenSharing) return;

    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    const localVid = document.getElementById('localVideo');
    const localVidBg = document.getElementById('localVideoBg');
    const localCard = document.getElementById('localCard');

    let toneFilterCss = 'none';
    if (currentFilter === 'warm') toneFilterCss = 'sepia(0.28) saturate(1.3) contrast(1.08)';
    else if (currentFilter === 'cool') toneFilterCss = 'hue-rotate(18deg) saturate(1.15) contrast(1.1) brightness(1.04)';
    else if (currentFilter === 'cinema') toneFilterCss = 'grayscale(1) contrast(1.25) brightness(1.02)';
    else if (currentFilter === 'vivid') toneFilterCss = 'contrast(1.25) saturate(1.4) brightness(1.05)';

    const portraitMask = 'radial-gradient(ellipse 65% 82% at 50% 55%, #000 56%, transparent 88%)';

    // 1. Immediately apply visual appearance to local preview elements
    if (localCard && localVid) {
      if (currentBg === 'office') {
        localCard.style.backgroundImage = "url('/backgrounds/office.svg')";
        localCard.style.backgroundColor = '#0b162c';
        if (localVidBg) localVidBg.style.display = 'none';
        localVid.style.webkitMaskImage = portraitMask;
        localVid.style.maskImage = portraitMask;
        localVid.style.filter = toneFilterCss;
      } else if (currentBg === 'penthouse') {
        localCard.style.backgroundImage = "url('/backgrounds/penthouse.svg')";
        localCard.style.backgroundColor = '#060f24';
        if (localVidBg) localVidBg.style.display = 'none';
        localVid.style.webkitMaskImage = portraitMask;
        localVid.style.maskImage = portraitMask;
        localVid.style.filter = toneFilterCss;
      } else if (currentBg === 'studio') {
        localCard.style.backgroundImage = "url('/backgrounds/studio.svg')";
        localCard.style.backgroundColor = '#18181b';
        if (localVidBg) localVidBg.style.display = 'none';
        localVid.style.webkitMaskImage = portraitMask;
        localVid.style.maskImage = portraitMask;
        localVid.style.filter = toneFilterCss;
      } else if (currentBg === 'blur-soft') {
        localCard.style.backgroundImage = 'none';
        if (localVidBg) {
          localVidBg.style.display = 'block';
          localVidBg.style.filter = (toneFilterCss === 'none' ? '' : toneFilterCss + ' ') + 'blur(12px) brightness(0.92)';
        }
        localVid.style.webkitMaskImage = portraitMask;
        localVid.style.maskImage = portraitMask;
        localVid.style.filter = toneFilterCss;
      } else if (currentBg === 'blur-deep') {
        localCard.style.backgroundImage = 'none';
        if (localVidBg) {
          localVidBg.style.display = 'block';
          localVidBg.style.filter = (toneFilterCss === 'none' ? '' : toneFilterCss + ' ') + 'blur(28px) brightness(0.85)';
        }
        localVid.style.webkitMaskImage = portraitMask;
        localVid.style.maskImage = portraitMask;
        localVid.style.filter = toneFilterCss;
      } else {
        // 'none'
        localCard.style.backgroundImage = 'none';
        if (localVidBg) localVidBg.style.display = 'none';
        localVid.style.webkitMaskImage = 'none';
        localVid.style.maskImage = 'none';
        localVid.style.filter = toneFilterCss;
      }
    }

    // 2. Peer Broadcast Stream Update
    if (currentBg === 'none' && currentFilter === 'none') {
      activeVideoStream = rawCameraStream;
      if (rawCameraStream && rawCameraStream.getVideoTracks()[0]) {
        broadcastVideoTrack(rawCameraStream.getVideoTracks()[0]);
      }
    } else {
      setupCanvasPipeline();
      renderProcessedFrame();
      if (canvasStream && canvasStream.getVideoTracks()[0]) {
        broadcastVideoTrack(canvasStream.getVideoTracks()[0]);
      }
    }
  }

  function broadcastVideoTrack(newTrack) {
    if (!newTrack) return;
    peerConnections.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(newTrack).catch(e => console.warn('replaceTrack error', e));
      }
    });
  }

  // 6. Dynamic Grid Layout Manager (Groups of up to 25 members)
  function updateVideoGridLayout() {
    const grid = document.getElementById('videoGrid');
    if (!grid) return;
    const cards = grid.querySelectorAll('.video-card');
    const count = Math.min(Math.max(cards.length, 1), 25);
    grid.setAttribute('data-count', String(count));

    // Update capacity pill
    const capacityIndicator = document.getElementById('capacityIndicator');
    if (capacityIndicator) {
      capacityIndicator.textContent = `${count} / 25 Members`;
    }
  }

  // 7. Create Peer Connection (Mesh WebRTC)
  async function createPeerConnection(peerId, peerName, isInitiator) {
    if (peerConnections.has(peerId)) return;

    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections.set(peerId, pc);

    // Attach local audio track
    if (rawCameraStream) {
      rawCameraStream.getAudioTracks().forEach(track => pc.addTrack(track, rawCameraStream));
    }

    // Attach active video track (Screen share, Canvas filtered, or raw Camera)
    const activeVidTrack = isScreenSharing
      ? screenStream?.getVideoTracks()[0]
      : ((currentBg !== 'none' || currentFilter !== 'none') && canvasStream
          ? canvasStream.getVideoTracks()[0]
          : rawCameraStream?.getVideoTracks()[0]);
    if (activeVidTrack) {
      pc.addTrack(activeVidTrack, rawCameraStream || screenStream);
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        ws.send(JSON.stringify({
          type: 'ice-candidate',
          target: peerId,
          candidate: event.candidate
        }));
      }
    };

    pc.ontrack = (event) => {
      renderRemoteVideo(peerId, peerName, event.streams[0]);
    };

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.send(JSON.stringify({
        type: 'offer',
        target: peerId,
        offer: offer
      }));
    }
  }

  function renderRemoteVideo(peerId, peerName, stream) {
    let card = document.getElementById(`card-${peerId}`);
    if (!card) {
      card = document.createElement('div');
      card.className = 'video-card';
      card.id = `card-${peerId}`;

      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.srcObject = stream;

      const label = document.createElement('div');
      label.className = 'participant-label';
      label.innerHTML = `<span class="status-dot"></span><span>${escapeHtml(peerName)}</span>`;

      card.appendChild(video);
      card.appendChild(label);
      document.getElementById('videoGrid').appendChild(card);
      updateVideoGridLayout();
    } else {
      const video = card.querySelector('video');
      if (video) video.srcObject = stream;
    }
  }

  function removePeer(peerId) {
    const pc = peerConnections.get(peerId);
    if (pc) {
      pc.close();
      peerConnections.delete(peerId);
    }
    const card = document.getElementById(`card-${peerId}`);
    if (card) card.remove();
    addSysMessage('A participant left the meeting.');
    updateVideoGridLayout();
  }

  // 8. Screen Sharing Controller (Works from Toolbar AND Settings Modal)
  async function toggleScreenSharing() {
    const btnToolbar = document.getElementById('btnScreenShare');
    const badgeSettings = document.getElementById('settingShareBadge');
    const btnSettingsLabel = document.getElementById('btnSettingScreenShareLabel');
    const btnSettings = document.getElementById('btnSettingScreenShare');

    if (!isScreenSharing) {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: true
        });
        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace track on all peer senders
        broadcastVideoTrack(screenTrack);

        const localVid = document.getElementById('localVideo');
        if (localVid) {
          localVid.style.filter = 'none';
          localVid.srcObject = screenStream;
        }

        isScreenSharing = true;
        btnToolbar?.classList.add('active');
        btnSettings?.classList.add('is-sharing');
        if (badgeSettings) {
          badgeSettings.textContent = 'Sharing Active';
          badgeSettings.classList.add('active');
        }
        if (btnSettingsLabel) btnSettingsLabel.textContent = 'Stop Screen Sharing';

        screenTrack.onended = () => stopScreenShare();
        addSysMessage('Screen sharing started.');
      } catch (e) {
        console.warn('[Screen share canceled/denied]', e);
      }
    } else {
      stopScreenShare();
    }
  }

  function stopScreenShare() {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      screenStream = null;
    }
    isScreenSharing = false;

    const btnToolbar = document.getElementById('btnScreenShare');
    const badgeSettings = document.getElementById('settingShareBadge');
    const btnSettingsLabel = document.getElementById('btnSettingScreenShareLabel');
    const btnSettings = document.getElementById('btnSettingScreenShare');

    btnToolbar?.classList.remove('active');
    btnSettings?.classList.remove('is-sharing');
    if (badgeSettings) {
      badgeSettings.textContent = 'Not Sharing';
      badgeSettings.classList.remove('active');
    }
    if (btnSettingsLabel) btnSettingsLabel.textContent = 'Start Screen Share';

    // Restore active video stream
    applyEffects();
    addSysMessage('Screen sharing ended.');
  }

  // 9. Fullscreen Controller (Enter and Exit seamlessly)
  function toggleFullscreen() {
    const icon = document.getElementById('fullscreenIcon');
    const btnFs = document.getElementById('btnToggleFullscreen');

    if (!document.fullscreenElement) {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch((err) => console.warn('Fullscreen error:', err));
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => console.warn('Exit fullscreen error:', err));
      }
    }
  }

  // Handle Fullscreen state change events
  function handleFullscreenChange() {
    const isFs = !!document.fullscreenElement;
    const icon = document.getElementById('fullscreenIcon');
    const btnFs = document.getElementById('btnToggleFullscreen');

    if (btnFs) {
      btnFs.classList.toggle('active', isFs);
      btnFs.title = isFs ? 'Exit Fullscreen (Esc)' : 'Enter Fullscreen';
    }
    if (icon) {
      icon.innerHTML = isFs ? '&#x2715;' : '&#x26F6;'; // ✕ when full, ⛶ when normal
    }
  }
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

  // 10. Settings Modal Handlers
  const modalBackdrop = document.getElementById('modalSettingsBackdrop');
  const btnOpenSettings = document.getElementById('btnToggleSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnDoneSettings = document.getElementById('btnDoneSettings');
  const btnSettingShare = document.getElementById('btnSettingScreenShare');

  function openSettings() {
    if (modalBackdrop) {
      modalBackdrop.hidden = false;
      populateDeviceList();
    }
  }

  function closeSettings() {
    if (modalBackdrop) modalBackdrop.hidden = true;
  }

  if (btnOpenSettings) btnOpenSettings.onclick = openSettings;
  if (btnCloseSettings) btnCloseSettings.onclick = closeSettings;
  if (btnDoneSettings) btnDoneSettings.onclick = closeSettings;
  if (btnSettingShare) btnSettingShare.onclick = toggleScreenSharing;

  modalBackdrop?.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeSettings();
  });

  // Background Options Selection
  const bgGrid = document.getElementById('bgOptionsGrid');
  if (bgGrid) {
    bgGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.bg-option');
      if (!btn) return;
      bgGrid.querySelectorAll('.bg-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentBg = btn.dataset.bg || 'none';
      applyEffects();
    });
  }

  // Filter Pills Selection
  const filterGrid = document.getElementById('filterOptionsGrid');
  if (filterGrid) {
    filterGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;
      filterGrid.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter || 'none';
      applyEffects();
    });
  }

  // Device selectors change
  document.getElementById('selectCamera')?.addEventListener('change', async (e) => {
    const deviceId = e.target.value;
    if (rawCameraStream) {
      rawCameraStream.getVideoTracks().forEach(t => t.stop());
    }
    await startLocalMedia(deviceId, document.getElementById('selectMic')?.value);
    applyEffects();
  });

  document.getElementById('selectMic')?.addEventListener('change', async (e) => {
    const deviceId = e.target.value;
    if (rawCameraStream) {
      rawCameraStream.getAudioTracks().forEach(t => t.stop());
    }
    await startLocalMedia(document.getElementById('selectCamera')?.value, deviceId);
  });

  // 11. Meeting Toolbar Listeners
  const btnMic = document.getElementById('btnToggleMic');
  const btnCam = document.getElementById('btnToggleCam');
  const btnScreen = document.getElementById('btnScreenShare');
  const btnFs = document.getElementById('btnToggleFullscreen');
  const btnChat = document.getElementById('btnToggleChat');
  const btnAi = document.getElementById('btnToggleAi');
  const btnEnd = document.getElementById('btnEndCall');
  const sidePanel = document.getElementById('sidePanel');
  const tabChat = document.getElementById('tabChat');
  const tabNyra = document.getElementById('tabNyra');
  const chatView = document.getElementById('chatView');
  const nyraView = document.getElementById('nyraView');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');

  if (btnMic) {
    btnMic.onclick = () => {
      if (rawCameraStream) {
        isMicActive = !isMicActive;
        rawCameraStream.getAudioTracks().forEach(t => t.enabled = isMicActive);
        btnMic.classList.toggle('active', isMicActive);
        btnMic.querySelector('.tool-icon').innerHTML = isMicActive ? '&#127908;' : '&#127908;&#xFE0E; ✕';
      }
    };
  }

  if (btnCam) {
    btnCam.onclick = () => {
      if (rawCameraStream) {
        isCamActive = !isCamActive;
        rawCameraStream.getVideoTracks().forEach(t => t.enabled = isCamActive);
        btnCam.classList.toggle('active', isCamActive);
        btnCam.querySelector('.tool-icon').innerHTML = isCamActive ? '&#128249;' : '&#128249;&#xFE0E; ✕';
      }
    };
  }

  if (btnScreen) btnScreen.onclick = toggleScreenSharing;
  if (btnFs) btnFs.onclick = toggleFullscreen;

  if (btnChat) {
    btnChat.onclick = () => {
      sidePanel.classList.toggle('collapsed');
      switchTab('chat');
    };
  }

  if (btnAi) {
    btnAi.onclick = () => {
      sidePanel.classList.remove('collapsed');
      switchTab('nyra');
    };
  }

  // Teardown & Exit
  function terminateAllMediaAndConnections() {
    console.log('[Nyrava Team Meet] Terminating camera, microphone, screen tracks and connections...');
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (rawCameraStream) {
      rawCameraStream.getTracks().forEach(track => {
        try { track.stop(); track.enabled = false; } catch (e) {}
      });
      rawCameraStream = null;
    }
    if (screenStream) {
      screenStream.getTracks().forEach(track => {
        try { track.stop(); track.enabled = false; } catch (e) {}
      });
      screenStream = null;
    }
    const localVid = document.getElementById('localVideo');
    if (localVid) {
      localVid.srcObject = null;
      try { localVid.pause(); } catch (_) {}
    }
    peerConnections.forEach((pc) => {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.close();
      } catch (e) {}
    });
    peerConnections.clear();

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try { ws.close(); } catch (e) {}
    }
  }

  window.addEventListener('beforeunload', terminateAllMediaAndConnections);
  window.addEventListener('pagehide', terminateAllMediaAndConnections);
  window.addEventListener('unload', terminateAllMediaAndConnections);

  if (btnEnd) {
    btnEnd.onclick = () => {
      if (confirm('Leave Nyrava Team Meet consultation?')) {
        terminateAllMediaAndConnections();
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ source: 'nyrava-team-meet-api', type: 'NYRAVA_MEET_CLOSED' }, '*');
        } else {
          window.location.href = '/';
        }
      }
    };
  }

  function switchTab(target) {
    if (target === 'chat') {
      tabChat.classList.add('active');
      tabNyra.classList.remove('active');
      chatView.hidden = false;
      nyraView.hidden = true;
    } else {
      tabNyra.classList.add('active');
      tabChat.classList.remove('active');
      nyraView.hidden = false;
      chatView.hidden = true;
    }
  }

  if (tabChat) tabChat.onclick = () => switchTab('chat');
  if (tabNyra) tabNyra.onclick = () => switchTab('nyra');

  if (chatForm) {
    chatForm.onsubmit = (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;
      ws.send(JSON.stringify({
        type: 'chat',
        name: userName,
        text: text
      }));
      chatInput.value = '';
    };
  }

  function appendChatMessage(senderName, text, isMine, time) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isMine ? 'mine' : 'other'}`;
    bubble.innerHTML = `
      <div class="chat-author">${escapeHtml(senderName)} <span class="chat-time">${time}</span></div>
      <div>${escapeHtml(text)}</div>
    `;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function addSysMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'sys-msg';
    msg.textContent = text;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const btnCopy = document.getElementById('btnCopyInvite');
  if (btnCopy) {
    btnCopy.onclick = () => {
      const inviteUrl = `${window.location.origin}/room/${encodeURIComponent(room)}`;
      navigator.clipboard.writeText(inviteUrl).then(() => {
        const orig = btnCopy.textContent;
        btnCopy.textContent = '✓ Link Copied!';
        btnCopy.style.background = '#10b981';
        btnCopy.style.color = '#fff';
        setTimeout(() => {
          btnCopy.textContent = orig;
          btnCopy.style.background = '';
          btnCopy.style.color = '';
        }, 3000);
      });
    };
  }

  // Nyra Assistant Prompts
  window.askNyra = function (question) {
    const responses = document.getElementById('nyraResponses');
    const msg = document.createElement('div');
    msg.className = 'nyra-msg';
    
    let answer = '';
    if (question.includes('mortgage')) {
      answer = 'As of late 2026, the national average 30-year fixed conforming mortgage rate is approximately 6.25% - 6.50%. On a $400,000 loan with 20% down, monthly principal & interest is approx. $2,462.';
    } else if (question.includes('appraisal')) {
      answer = 'Market valuation is an estimate of what a buyer is willing to pay based on current neighborhood supply and demand. An appraisal is a formal, lender-required valuation conducted by a licensed appraiser to protect the loan.';
    } else {
      answer = 'A seller net sheet estimates proceeds after deducting remaining mortgage payoff, title & escrow fees, transfer taxes, and agreed commissions. Keep closing costs estimated at 1.5% - 2% of sale price.';
    }

    msg.innerHTML = `<strong>Q: ${escapeHtml(question)}</strong><br><br>${answer}`;
    responses.prepend(msg);
  };

  // Embed PostMessage Commands
  window.addEventListener('message', (event) => {
    if (event.data && (event.data.source === 'nyrava-team-meet-api' || event.data.type === 'NYRAVA_MEET_SHUTDOWN')) {
      const { command, type } = event.data;
      if (command === 'shutdown' || command === 'leave' || type === 'NYRAVA_MEET_SHUTDOWN') {
        terminateAllMediaAndConnections();
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ source: 'nyrava-team-meet-api', type: 'NYRAVA_MEET_TERMINATED' }, '*');
        }
      }
      if (command === 'toggleAudio' && btnMic) btnMic.click();
      if (command === 'toggleVideo' && btnCam) btnCam.click();
      if (command === 'shareScreen' && btnScreen) btnScreen.click();
      if (command === 'toggleFullscreen' && btnFs) btnFs.click();
      if (command === 'openSettings') openSettings();
    }
  });

})();
