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
  bgImages.office.src = '/backgrounds/office.jpg';
  bgImages.penthouse.src = '/backgrounds/penthouse.jpg';
  bgImages.studio.src = '/backgrounds/studio.jpg';

  const peerConnections = new Map(); // peerId -> RTCPeerConnection
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:188.172.228.105:3478' },
      { urls: 'turn:188.172.228.105:3478?transport=udp', username: 'nyrava_user', credential: 'turn_secure_pass_2026' },
      { urls: 'turn:188.172.228.105:3478?transport=tcp', username: 'nyrava_user', credential: 'turn_secure_pass_2026' }
    ]
  };

  // SDP & Bitrate Optimization for Crystal-Clear Studio Quality
  function optimizeSdp(sdp) {
    if (!sdp || typeof sdp !== 'string') return sdp;
    // 1. Opus Studio Voice Quality (128 kbps, FEC enabled, stereo, cbr)
    if (sdp.includes('opus/48000')) {
      sdp = sdp.replace(
        /a=fmtp:(\d+) (minptime=\d+;useinbandfec=\d+)?(.*)/g,
        'a=fmtp:$1 useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000;cbr=1$3'
      );
    }
    // 2. Video High-Def Bitrate Target (2500 kbps for Full HD)
    if (!sdp.includes('b=AS:')) {
      sdp = sdp.replace(/(m=video \d+ [A-Z\/]+ [0-9 ]+)/g, '$1\r\nb=AS:2500\r\nb=TIAS:2500000');
    }
    return sdp;
  }

  async function optimizeSenderParameters(targetPc) {
    try {
      const senders = targetPc.getSenders();
      for (const sender of senders) {
        if (!sender.track) continue;
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        if (sender.track.kind === 'video') {
          params.encodings[0].maxBitrate = 2500000; // 2.5 Mbps Full HD
          params.encodings[0].priority = 'high';
          params.encodings[0].networkPriority = 'high';
          params.degradationPreference = 'maintain-framerate';
        } else if (sender.track.kind === 'audio') {
          params.encodings[0].maxBitrate = 128000; // 128 kbps Studio audio
          params.encodings[0].priority = 'high';
          params.encodings[0].networkPriority = 'high';
        }
        await sender.setParameters(params);
      }
    } catch (_) {}
  }

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

  // 4. Local Media Initializer with High-Fidelity Studio Audio & Full HD Video
  async function startLocalMedia(videoDeviceId, audioDeviceId) {
    if (rawCameraStream) {
      try {
        rawCameraStream.getTracks().forEach(t => { t.stop(); t.enabled = false; });
      } catch (_) {}
      rawCameraStream = null;
    }

    // Robust Audio Constraints without brittle sampleSize / channelCount that break on mobile
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };
    if (audioDeviceId) {
      audioConstraints.deviceId = { exact: audioDeviceId };
    }

    let stream = null;
    let cameraFailure = null;

    // Flexible video constraints that work seamlessly in portrait (mobile) and landscape (desktop)
    const videoConstraints = videoDeviceId
      ? { deviceId: { exact: videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } };

    // Tier 1: Optimal HD with standard echo/noise cancelled audio
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints
      });
    } catch (err1) {
      console.warn('[Media Tier 1 Failed] Fallback to basic user camera:', err1.message);
      cameraFailure = err1;

      // Tier 2: Basic user facing camera + standard audio
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: true
        });
        cameraFailure = null;
      } catch (err2) {
        console.warn('[Media Tier 2 Failed] Fallback to generic video & audio:', err2.message);
        cameraFailure = err2;

        // Tier 3: Any video and any audio
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          });
          cameraFailure = null;
        } catch (err3) {
          console.warn('[Media Tier 3 Failed] Fallback to audio-only:', err3.message);
          // Tier 4: Audio-only fallback
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          } catch (err4) {
            console.warn('[Media Tier 4 Failed] Fallback to video-only:', err4.message);
            // Tier 5: Video-only fallback
            try {
              stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
              cameraFailure = null;
            } catch (err5) {
              console.warn('[Media All Tiers Failed]:', err5.message);
            }
          }
        }
      }
    }

    const permBanner = document.getElementById('mediaPermissionBanner');
    if (!stream) {
      console.warn('[Media Error] Could not access camera or microphone:', cameraFailure?.message);
      addSysMessage('⚠️ Camera & microphone access needed. Tap "Enable Camera & Mic" to start video.');
      if (permBanner) permBanner.style.display = 'flex';
      updateCameraStateUI(false);
      updateMicStateUI(false);
      return;
    }
    if (permBanner) permBanner.style.display = 'none';

    rawCameraStream = stream;
    activeVideoStream = stream;

    const hasVideo = stream.getVideoTracks().length > 0;
    const hasAudio = stream.getAudioTracks().length > 0;
    isCamActive = hasVideo;
    isMicActive = hasAudio;

    const localVid = document.getElementById('localVideo');
    const localVidBg = document.getElementById('localVideoBg');

    // CRITICAL: Local preview MUST be completely muted to prevent acoustic feedback screaming
    if (localVid) {
      localVid.muted = true;
      localVid.defaultMuted = true;
      localVid.volume = 0;
      localVid.srcObject = activeVideoStream;
    }
    if (localVidBg) {
      localVidBg.muted = true;
      localVidBg.defaultMuted = true;
      localVidBg.volume = 0;
      localVidBg.srcObject = activeVideoStream;
    }

    updateCameraStateUI(hasVideo);
    updateMicStateUI(hasAudio);

    if (!hasVideo && cameraFailure) {
      addSysMessage('⚠️ Camera is occupied or unavailable. Microphone audio is active.');
    }

    // Populate hardware devices list in settings
    populateDeviceList();
    updateVideoGridLayout();

    // Broadcast track updates to existing peers if re-acquiring
    const vTrack = stream.getVideoTracks()[0];
    if (vTrack) broadcastVideoTrack(vTrack);
    const aTrack = stream.getAudioTracks()[0];
    if (aTrack) broadcastAudioTrack(aTrack);
  }

  function updateMicStateUI(active) {
    isMicActive = active;
    const btnMic = document.getElementById('btnToggleMic');
    if (btnMic) {
      btnMic.classList.toggle('active', active);
      const icon = btnMic.querySelector('.tool-icon');
      if (icon) icon.innerHTML = active ? '&#127908;' : '&#127908;&#xFE0E; ✕';
      btnMic.title = active ? 'Mute Microphone' : 'Unmute Microphone';
    }
    notifyParentState();
  }

  function updateCameraStateUI(active) {
    isCamActive = active;
    const btnCam = document.getElementById('btnToggleCam');
    if (btnCam) {
      btnCam.classList.toggle('active', active);
      const icon = btnCam.querySelector('.tool-icon');
      if (icon) icon.innerHTML = active ? '&#128249;' : '&#128249;&#xFE0E; ✕';
      btnCam.title = active ? 'Turn Off Camera' : 'Turn On Camera';
    }
    const localCard = document.getElementById('localCard');
    if (localCard) {
      localCard.classList.toggle('cam-off', !active);
    }
    notifyParentState();
  }

  function notifyParentState() {
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({
          source: 'nyrava-team-meet-api',
          type: 'NYRAVA_MEET_STATE',
          micActive: isMicActive,
          camActive: isCamActive,
          isSharing: isScreenSharing,
          room: room
        }, '*');
      } catch (_) {}
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

  // 5. Video Processing Pipeline (Real-Time MediaPipe AI Background Segmentation & Studio Lighting)
  let selfieSegmentation = null;
  let isSegmenterReady = false;
  let isSegmenterInitializing = false;
  let isProcessingFrame = false;
  let maskCanvas = null;
  let maskCtx = null;
  let personCanvas = null;
  let personCtx = null;
  let currentBalance = 'wide';
  const maskLut = new Uint32Array(256);

  function updateMaskLut(balance) {
    let low = 45;
    let high = 115;
    if (balance === 'wide') {
      low = 20;
      high = 95;
    } else if (balance === 'crisp') {
      low = 60;
      high = 135;
    }
    for (let i = 0; i < 256; i++) {
      let a;
      if (i < low) {
        a = 0;
      } else if (i >= high) {
        a = 255; // 100% OPAQUE - Solid human body, zero translucency!
      } else {
        const t = (i - low) / (high - low);
        a = Math.round(t * t * (3 - 2 * t) * 255);
      }
      maskLut[i] = (a << 24) | 0x00FFFFFF;
    }
  }
  updateMaskLut(currentBalance);

  function initMediaPipe() {
    if (typeof SelfieSegmentation === 'undefined') {
      return;
    }
    if (selfieSegmentation || isSegmenterInitializing) return;

    isSegmenterInitializing = true;
    try {
      selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => `/vendor/mediapipe/${file}`
      });

      selfieSegmentation.setOptions({
        modelSelection: 0, // 1 = landscape model (fastest, optimized for webcams / 720p-1080p video calls)
        selfieMode: false   // false so remote peers receive normal orientation; local self-view is mirrored by CSS scaleX(-1)
      });

      selfieSegmentation.onResults(onSegmentationResults);
      isSegmenterReady = true;
      console.log('[Nyrava Team Meet] MediaPipe AI Selfie Segmentation ready.');
    } catch (e) {
      console.error('[Nyrava Team Meet] MediaPipe initialization error:', e);
      isSegmenterReady = false;
    } finally {
      isSegmenterInitializing = false;
    }
  }

  function setupCanvasPipeline() {
    if (!canvasElem) {
      canvasElem = document.getElementById('localCanvas');
      if (!canvasElem) {
        canvasElem = document.createElement('canvas');
        canvasElem.width = 1280;
        canvasElem.height = 720;
      }
      canvasCtx = canvasElem.getContext('2d');
      try {
        canvasStream = canvasElem.captureStream(30);
      } catch (e) {
        console.warn('captureStream error', e);
      }
    }
    if (!maskCanvas) {
      maskCanvas = document.createElement('canvas');
      maskCanvas.width = 480;
      maskCanvas.height = 270;
      maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (!personCanvas) {
      personCanvas = document.createElement('canvas');
      personCanvas.width = 1280;
      personCanvas.height = 720;
      personCtx = personCanvas.getContext('2d');
    }
    if (!isSegmenterReady && !isSegmenterInitializing) {
      initMediaPipe();
    }
  }

  function getToneFilterString() {
    if (currentFilter === 'bright') return 'brightness(1.12) contrast(1.04) saturate(1.05)';
    if (currentFilter === 'warm') return 'brightness(1.04) sepia(0.18) saturate(1.15) contrast(1.04)';
    if (currentFilter === 'cool') return 'brightness(1.04) hue-rotate(12deg) saturate(1.08) contrast(1.06)';
    if (currentFilter === 'vivid') return 'brightness(1.05) contrast(1.12) saturate(1.20)';
    if (currentFilter === 'cinema') return 'brightness(1.04) grayscale(1) contrast(1.18)';
    return 'none';
  }

  function onSegmentationResults(results) {
    if (!isCamActive || isScreenSharing) return;
    if (currentBg === 'none' && currentFilter === 'none') return;
    if (!canvasCtx || !canvasElem) return;

    setupCanvasPipeline();

    // 1. Draw raw neural segmentation mask onto 480x270 mask canvas
    maskCtx.globalCompositeOperation = 'source-over';
    maskCtx.filter = 'none';
    maskCtx.clearRect(0, 0, 480, 270);
    maskCtx.drawImage(results.segmentationMask, 0, 0, 480, 270);

    // 2. Transform confidence into clean silhouette mask (smooth anti-aliasing curve)
    const imgData = maskCtx.getImageData(0, 0, 480, 270);
    const u8 = imgData.data;
    const u32 = new Uint32Array(u8.buffer);
    for (let i = 0; i < u32.length; i++) {
      const raw = u8[i * 4];
      u32[i] = maskLut[raw];
    }
    maskCtx.putImageData(imgData, 0, 0);

    const filterStr = getToneFilterString();

    // 3. STEP A: Draw the 100% SOLID BACKDROP FIRST onto canvasCtx!
    // This guarantees the backdrop covers the entire screen, and can NEVER be erased when moving your head!
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, 1280, 720);

    if (currentBg === 'blur-soft' || currentBg === 'blur-deep') {
      const blurRadius = currentBg === 'blur-deep' ? '28px' : '14px';
      canvasCtx.filter = (filterStr !== 'none' ? filterStr + ' ' : '') + `blur(${blurRadius})`;
      canvasCtx.drawImage(results.image, -25, -15, 1330, 750);
    } else if (currentBg === 'penthouse' || currentBg === 'office' || currentBg === 'studio') {
      canvasCtx.filter = 'none';
      const bgImg = bgImages[currentBg];
      if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
        canvasCtx.drawImage(bgImg, 0, 0, 1280, 720);
      } else {
        const grad = canvasCtx.createLinearGradient(0, 0, 1280, 720);
        grad.addColorStop(0, '#0b162c');
        grad.addColorStop(0.5, '#1e293b');
        grad.addColorStop(1, '#0f172a');
        canvasCtx.fillStyle = grad;
        canvasCtx.fillRect(0, 0, 1280, 720);
      }
    } else {
      // Raw background with tone/lighting filter
      if (filterStr !== 'none') canvasCtx.filter = filterStr;
      canvasCtx.drawImage(results.image, 0, 0, 1280, 720);
      canvasCtx.restore();
      return;
    }
    canvasCtx.restore();

    // 4. STEP B: Cut out ONLY the person on offscreen personCanvas
    personCtx.save();
    personCtx.globalCompositeOperation = 'source-over';
    personCtx.filter = 'none';
    personCtx.clearRect(0, 0, 1280, 720);
    if (filterStr !== 'none') personCtx.filter = filterStr;
    personCtx.drawImage(results.image, 0, 0, 1280, 720);

    // Clip strictly to the person's silhouette using destination-in
    personCtx.globalCompositeOperation = 'destination-in';
    // Soft, slightly expanded silhouette; full-resolution person remains sharp.
    personCtx.filter = 'blur(0.8px)';
    personCtx.drawImage(maskCanvas, -3, -3, 1286, 726);
    personCtx.filter = 'none';
    personCtx.restore();

    // 5. STEP C: Composite the crisp, solid person directly ON TOP of the solid backdrop!
    canvasCtx.drawImage(personCanvas, 0, 0, 1280, 720);
  }

  let lastSegmentationTime = 0;

  async function renderProcessedFrame() {
    if (!rawCameraStream || isScreenSharing || !isCamActive) return;
    const localVid = document.getElementById('localVideo');
    if (!localVid || localVid.readyState < 2) {
      animFrameId = requestAnimationFrame(renderProcessedFrame);
      return;
    }

    setupCanvasPipeline();

    if (currentBg !== 'none') {
      if (!isSegmenterReady && !isSegmenterInitializing) {
        initMediaPipe();
      }

      if (isSegmenterReady && selfieSegmentation) {
        const now = performance.now();
        if (!isProcessingFrame && now - lastSegmentationTime >= 50) {
          isProcessingFrame = true;
          lastSegmentationTime = now;
          try {
            await selfieSegmentation.send({ image: localVid });
          } catch (err) {
            console.warn('[Nyrava Team Meet] MediaPipe frame error:', err);
          } finally {
            isProcessingFrame = false;
          }
        }
      } else {
        // Fast direct pass while AI model finishes compiling
        const filterStr = getToneFilterString();
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, 1280, 720);
        if (filterStr !== 'none') canvasCtx.filter = filterStr;
        canvasCtx.drawImage(localVid, 0, 0, 1280, 720);
        canvasCtx.restore();
      }
    } else {
      // Just tone filter (zero ML overhead)
      const filterStr = getToneFilterString();
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, 1280, 720);
      if (filterStr !== 'none') canvasCtx.filter = filterStr;
      canvasCtx.drawImage(localVid, 0, 0, 1280, 720);
      canvasCtx.restore();
    }

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
    const localCanvas = document.getElementById('localCanvas');

    if (currentBg === 'none' && currentFilter === 'none') {
      // Standard raw camera feed (zero overhead)
      if (localCanvas) localCanvas.style.display = 'none';
      if (localVid) {
        localVid.style.display = 'block';
        localVid.style.filter = 'none';
      }
      activeVideoStream = rawCameraStream;
      if (rawCameraStream && rawCameraStream.getVideoTracks()[0]) {
        broadcastVideoTrack(rawCameraStream.getVideoTracks()[0]);
      }
    } else {
      // Real-time canvas processing for Virtual Backgrounds, Blur, and Lighting
      setupCanvasPipeline();
      if (localCanvas) localCanvas.style.display = 'block';
      if (localVid) {
        localVid.style.display = 'block'; // Keep playing so canvas can read frames
        localVid.style.filter = 'none';
      }
      renderProcessedFrame();
      if (canvasStream && canvasStream.getVideoTracks()[0]) {
        activeVideoStream = canvasStream;
        broadcastVideoTrack(canvasStream.getVideoTracks()[0]);
      }
    }
  }

  function broadcastVideoTrack(newTrack) {
    if (!newTrack) return;
    peerConnections.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(newTrack).catch(e => console.warn('replaceTrack video error', e));
      } else if (rawCameraStream || screenStream) {
        try { pc.addTrack(newTrack, rawCameraStream || screenStream); } catch (_) {}
      }
    });
  }

  function broadcastAudioTrack(newTrack) {
    if (!newTrack) return;
    peerConnections.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
      if (sender) {
        sender.replaceTrack(newTrack).catch(e => console.warn('replaceTrack audio error', e));
      } else if (rawCameraStream) {
        try { pc.addTrack(newTrack, rawCameraStream); } catch (_) {}
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
      let stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
      renderRemoteVideo(peerId, peerName, stream, event.track);
    };

    // SDP & Bitrate Optimization for Crystal-Clear Studio Quality
    function optimizeSdp(sdp) {
      if (!sdp || typeof sdp !== 'string') return sdp;
      // 1. Opus Studio Voice Quality (128 kbps, FEC enabled, stereo, cbr)
      if (sdp.includes('opus/48000')) {
        sdp = sdp.replace(
          /a=fmtp:(\d+) (minptime=\d+;useinbandfec=\d+)?(.*)/g,
          'a=fmtp:$1 useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000;cbr=1$3'
        );
      }
      // 2. Video High-Def Bitrate Target (2500 kbps for Full HD)
      if (!sdp.includes('b=AS:')) {
        sdp = sdp.replace(/(m=video \d+ [A-Z\/]+ [0-9 ]+)/g, '$1\r\nb=AS:2500\r\nb=TIAS:2500000');
      }
      return sdp;
    }

    async function optimizeSenderParameters(targetPc) {
      try {
        const senders = targetPc.getSenders();
        for (const sender of senders) {
          if (!sender.track) continue;
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          if (sender.track.kind === 'video') {
            params.encodings[0].maxBitrate = 2500000; // 2.5 Mbps Full HD
            params.encodings[0].priority = 'high';
            params.encodings[0].networkPriority = 'high';
            params.degradationPreference = 'maintain-framerate';
          } else if (sender.track.kind === 'audio') {
            params.encodings[0].maxBitrate = 128000; // 128 kbps Studio audio
            params.encodings[0].priority = 'high';
            params.encodings[0].networkPriority = 'high';
          }
          await sender.setParameters(params);
        }
      } catch (_) {}
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        optimizeSenderParameters(pc);
      }
    };

    if (isInitiator) {
      const offer = await pc.createOffer();
      // SDP optimization disabled for WebRTC compatibility
      await pc.setLocalDescription(offer);
      optimizeSenderParameters(pc);
      ws.send(JSON.stringify({
        type: 'offer',
        target: peerId,
        offer: offer
      }));
    }
  }

  function renderRemoteVideo(peerId, peerName, stream, track) {
    let card = document.getElementById(`card-${peerId}`);
    if (!card) {
      card = document.createElement('div');
      card.className = 'video-card';
      card.id = `card-${peerId}`;

      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.muted = false; // MUST be unmuted to hear other attendees!
      video.volume = 1.0;
      video.srcObject = stream;

      const label = document.createElement('div');
      label.className = 'participant-label';
      label.innerHTML = `<span class="status-dot"></span><span>${escapeHtml(peerName)}</span>`;

      // Autoplay blocker recovery: if browser blocks unmuted audio on mobile or desktop, immediately start muted then show unmute pill
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('[Remote video play blocked by browser policy, starting muted]', err);
          video.muted = true;
          video.play().then(() => {
            const unmuteBtn = document.createElement('button');
            unmuteBtn.type = 'button';
            unmuteBtn.className = 'remote-unmute-btn';
            unmuteBtn.innerHTML = '🔊 Click to listen';
            unmuteBtn.onclick = () => {
              video.muted = false;
              unmuteBtn.remove();
            };
            card.appendChild(unmuteBtn);
          }).catch(e => console.warn(e));
        });
      }

      card.appendChild(video);
      card.appendChild(label);
      document.getElementById('videoGrid').appendChild(card);
      updateVideoGridLayout();
    } else {
      const video = card.querySelector('video');
      if (video) {
        if (!video.srcObject) {
          video.srcObject = stream;
        } else if (stream && video.srcObject !== stream) {
          stream.getTracks().forEach(t => {
            if (!video.srcObject.getTracks().some(existing => existing.id === t.id)) {
              video.srcObject.addTrack(t);
            }
          });
        } else if (track) {
          if (!video.srcObject.getTracks().some(existing => existing.id === track.id)) {
            video.srcObject.addTrack(track);
          }
        }
        video.muted = false;
        video.play().catch(e => console.warn('Remote video play retry error:', e));
      }
    }
  }

  function removePeer(peerId) {
    const pc = peerConnections.get(peerId);
    if (pc) {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.close();
      } catch (_) {}
      peerConnections.delete(peerId);
    }
    const card = document.getElementById(`card-${peerId}`);
    if (card) {
      const video = card.querySelector('video');
      if (video) {
        video.srcObject = null;
        try { video.pause(); } catch (_) {}
      }
      card.remove();
    }
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

  function updateBalanceCardVisibility() {
    const balanceCard = document.getElementById('balanceCard');
    if (balanceCard) {
      balanceCard.style.display = currentBg !== 'none' ? 'block' : 'none';
    }
  }

  function openSettings() {
    if (modalBackdrop) {
      modalBackdrop.hidden = false;
      populateDeviceList();
      updateBalanceCardVisibility();
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
      updateBalanceCardVisibility();
      applyEffects();
    });
  }

  // Silhouette Balance Selection
  const balanceGrid = document.getElementById('balanceGrid');
  if (balanceGrid) {
    balanceGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;
      balanceGrid.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const bal = btn.dataset.balance || 'balanced';
      currentBalance = bal;
      updateMaskLut(bal);
      const balanceLabel = document.getElementById('balanceLabel');
      if (balanceLabel) {
        if (bal === 'wide') balanceLabel.textContent = 'Wide Coverage (Full Head & Hair)';
        else if (bal === 'crisp') balanceLabel.textContent = 'Crisp Edge';
        else balanceLabel.textContent = 'Balanced (Solid Human)';
      }
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
      if (rawCameraStream && rawCameraStream.getAudioTracks().length > 0) {
        const nextState = !isMicActive;
        rawCameraStream.getAudioTracks().forEach(t => t.enabled = nextState);
        updateMicStateUI(nextState);
        addSysMessage(nextState ? 'Microphone unmuted.' : 'Microphone muted.');
      } else {
        startLocalMedia(document.getElementById('selectCamera')?.value, document.getElementById('selectMic')?.value);
      }
    };
  }

  if (btnCam) {
    btnCam.onclick = async () => {
      if (rawCameraStream && rawCameraStream.getVideoTracks().length > 0) {
        const nextState = !isCamActive;
        rawCameraStream.getVideoTracks().forEach(t => t.enabled = nextState);
        updateCameraStateUI(nextState);
        if (nextState) applyEffects();
        addSysMessage(nextState ? 'Camera turned on.' : 'Camera turned off.');
      } else {
        await startLocalMedia(document.getElementById('selectCamera')?.value, document.getElementById('selectMic')?.value);
        applyEffects();
      }
    };
  }

  if (btnScreen) btnScreen.onclick = toggleScreenSharing;
  if (btnFs) btnFs.onclick = toggleFullscreen;

  const btnCloseSidepanel = document.getElementById('btnCloseSidepanel');
  if (btnCloseSidepanel) {
    btnCloseSidepanel.onclick = () => {
      sidePanel.classList.add('collapsed');
      sidePanel.classList.remove('open');
      if (btnChat) btnChat.classList.remove('active');
    };
  }

  const btnGrantMedia = document.getElementById('btnGrantMedia');
  if (btnGrantMedia) {
    btnGrantMedia.onclick = async () => {
      await startLocalMedia();
      applyEffects();
    };
  }

  if (btnChat) {
    btnChat.onclick = () => {
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        const isOpen = sidePanel.classList.contains('open');
        if (isOpen) {
          sidePanel.classList.remove('open');
          sidePanel.classList.add('collapsed');
          btnChat.classList.remove('active');
        } else {
          sidePanel.classList.remove('collapsed');
          sidePanel.classList.add('open');
          btnChat.classList.add('active');
          switchTab('chat');
        }
      } else {
        sidePanel.classList.toggle('collapsed');
        switchTab('chat');
      }
    };
  }

  if (btnAi) {
    btnAi.onclick = () => {
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        sidePanel.classList.remove('collapsed');
        sidePanel.classList.add('open');
      } else {
        sidePanel.classList.remove('collapsed');
      }
      switchTab('nyra');
    };
  }

  // Teardown & Exit (Cleanly releases all hardware tracks and closes connections)
  function terminateAllMediaAndConnections() {
    console.log('[Nyrava Team Meet] Terminating camera, microphone, screen tracks and connections...');
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    // 1. Explicitly stop and disable all local tracks to power off camera/mic hardware
    if (rawCameraStream) {
      rawCameraStream.getTracks().forEach(track => {
        try {
          track.stop();
          track.enabled = false;
        } catch (e) {}
      });
      rawCameraStream = null;
    }

    if (canvasStream) {
      canvasStream.getTracks().forEach(track => {
        try {
          track.stop();
          track.enabled = false;
        } catch (e) {}
      });
      canvasStream = null;
    }

    if (screenStream) {
      screenStream.getTracks().forEach(track => {
        try {
          track.stop();
          track.enabled = false;
        } catch (e) {}
      });
      screenStream = null;
    }

    isScreenSharing = false;
    activeVideoStream = null;

    // 2. Clear local video elements
    const localVid = document.getElementById('localVideo');
    if (localVid) {
      localVid.srcObject = null;
      try { localVid.pause(); } catch (_) {}
    }
    const localVidBg = document.getElementById('localVideoBg');
    if (localVidBg) {
      localVidBg.srcObject = null;
      try { localVidBg.pause(); } catch (_) {}
    }

    // 3. Close and destroy all peer connections and remote video cards
    peerConnections.forEach((pc, peerId) => {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.close();
      } catch (e) {}
      const card = document.getElementById(`card-${peerId}`);
      if (card) {
        const v = card.querySelector('video');
        if (v) {
          v.srcObject = null;
          try { v.pause(); } catch (_) {}
        }
        card.remove();
      }
    });
    peerConnections.clear();

    // 4. Close WebSocket
    if (ws) {
      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch (e) {}
    }

    updateCameraStateUI(false);
    updateMicStateUI(false);

    // 5. Display Consultation Ended Overlay (DO NOT reload page, keeps hardware powered off)
    const endedOverlay = document.getElementById('meetEndedOverlay');
    if (endedOverlay) {
      endedOverlay.hidden = false;
    }
  }

  window.addEventListener('beforeunload', terminateAllMediaAndConnections);
  window.addEventListener('pagehide', terminateAllMediaAndConnections);
  window.addEventListener('unload', terminateAllMediaAndConnections);

  if (btnEnd) {
    btnEnd.onclick = () => {
      terminateAllMediaAndConnections();
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: 'nyrava-team-meet-api', type: 'NYRAVA_MEET_CLOSED' }, '*');
      }
    };
  }

  // Rejoin and Close handlers on Ended Overlay
  const btnRejoin = document.getElementById('btnRejoinMeeting');
  if (btnRejoin) {
    btnRejoin.onclick = () => {
      window.location.reload();
    };
  }

  const btnCloseTab = document.getElementById('btnCloseMeetingTab');
  if (btnCloseTab) {
    btnCloseTab.onclick = () => {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: 'nyrava-team-meet-api', type: 'NYRAVA_MEET_CLOSED' }, '*');
      } else {
        window.location.href = 'https://home.nyrava.com/dashboard/home';
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
    if (event.data && (event.data.source === 'nyrava-team-meet-api' || event.data.type === 'NYRAVA_MEET_SHUTDOWN' || event.data.type === 'NYRAVA_MEET_COMMAND')) {
      const { command, type } = event.data;
      if (command === 'shutdown' || command === 'leave' || type === 'NYRAVA_MEET_SHUTDOWN') {
        terminateAllMediaAndConnections();
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ source: 'nyrava-team-meet-api', type: 'NYRAVA_MEET_TERMINATED' }, '*');
          window.parent.postMessage({ source: 'nyrava-team-meet-api', type: 'NYRAVA_MEET_CLOSED' }, '*');
        }
      }
      if (command === 'toggleAudio' && btnMic) btnMic.click();
      if (command === 'toggleVideo' && btnCam) btnCam.click();
      if (command === 'shareScreen' && btnScreen) btnScreen.click();
      if (command === 'toggleFullscreen' && btnFs) btnFs.click();
      if (command === 'openSettings') openSettings();
      if (command === 'requestState') notifyParentState();
    }
  });

  // Pre-initialize MediaPipe AI background engine in background
  initMediaPipe();

  // Default to collapsed chat on mobile viewports so user lands directly on the video grid
  if (window.innerWidth <= 768 && sidePanel) {
    sidePanel.classList.add('collapsed');
    sidePanel.classList.remove('open');
  }

  // Announce initial ready state
  notifyParentState();

})();
