// Nyrava Team Meet WebRTC Engine & Consultation Client
(function () {
  'use strict';

  // 1. Parse Room & User Parameters
  const urlParams = new URLSearchParams(window.location.search);
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  let room = urlParams.get('room') || (pathParts[0] === 'room' ? pathParts[1] : (pathParts[0] || 'general'));
  const userName = urlParams.get('name') || 'Participant-' + Math.floor(1000 + Math.random() * 9000);
  const isEmbed = urlParams.get('embed') === '1';

  // In embed mode, compact the header if needed
  if (isEmbed) {
    const hdr = document.getElementById('meetHeader');
    if (hdr) hdr.style.display = 'none';
  }

  const roomIndicator = document.getElementById('roomIndicator');
  if (roomIndicator) roomIndicator.textContent = `Room: ${room}`;
  const localLabel = document.getElementById('localLabelName');
  if (localLabel) localLabel.textContent = `${userName} (You)`;

  // 2. WebRTC Peer & Media Setup
  let localStream = null;
  let screenStream = null;
  let isMicActive = true;
  let isCamActive = true;
  let isScreenSharing = false;

  const peerConnections = new Map(); // peerId -> RTCPeerConnection
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
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

      if (data.type === 'room-joined') {
        // Connect to existing peers
        for (const peer of data.peers) {
          await createPeerConnection(peer.id, peer.name, true);
        }
      }

      if (data.type === 'peer-joined') {
        addSysMessage(`${data.name} joined the meeting.`);
        await createPeerConnection(data.peerId, data.name, false);
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
      }

      if (data.type === 'chat') {
        appendChatMessage(data.name, data.text, data.from === ws.clientId, data.timestamp);
      }
    } catch (e) {
      console.warn('[Signaling message error]', e);
    }
  };

  // 4. Local Media Initializer
  async function startLocalMedia() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      const localVid = document.getElementById('localVideo');
      if (localVid) localVid.srcObject = localStream;
    } catch (err) {
      console.warn('[Media Error] Could not access camera/mic:', err.message);
      addSysMessage('Camera or microphone access denied. You are joined in listen-only mode.');
    }
  }

  // 5. Create Peer Connection (Mesh WebRTC)
  async function createPeerConnection(peerId, peerName, isInitiator) {
    if (peerConnections.has(peerId)) return;

    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections.set(peerId, pc);

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
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
      label.innerHTML = `<span class="status-dot"></span><span>${peerName}</span>`;

      card.appendChild(video);
      card.appendChild(label);
      document.getElementById('videoGrid').appendChild(card);
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
  }

  // 6. UI Controls & Event Listeners
  const btnMic = document.getElementById('btnToggleMic');
  const btnCam = document.getElementById('btnToggleCam');
  const btnScreen = document.getElementById('btnScreenShare');
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
      if (localStream) {
        isMicActive = !isMicActive;
        localStream.getAudioTracks().forEach(t => t.enabled = isMicActive);
        btnMic.classList.toggle('active', isMicActive);
        btnMic.innerHTML = isMicActive ? '&#127908;' : '&#127908;&#xFE0E; ✕';
      }
    };
  }

  if (btnCam) {
    btnCam.onclick = () => {
      if (localStream) {
        isCamActive = !isCamActive;
        localStream.getVideoTracks().forEach(t => t.enabled = isCamActive);
        btnCam.classList.toggle('active', isCamActive);
        btnCam.innerHTML = isCamActive ? '&#128249;' : '&#128249;&#xFE0E; ✕';
      }
    };
  }

  if (btnScreen) {
    btnScreen.onclick = async () => {
      if (!isScreenSharing) {
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const screenTrack = screenStream.getVideoTracks()[0];
          
          peerConnections.forEach(pc => {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(screenTrack);
          });

          const localVid = document.getElementById('localVideo');
          if (localVid) localVid.srcObject = screenStream;

          isScreenSharing = true;
          btnScreen.classList.add('active');

          screenTrack.onended = () => stopScreenShare();
        } catch (e) {
          console.warn('[Screen share canceled]', e);
        }
      } else {
        stopScreenShare();
      }
    };
  }

  function stopScreenShare() {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      screenStream = null;
    }
    if (localStream) {
      const camTrack = localStream.getVideoTracks()[0];
      peerConnections.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender && camTrack) sender.replaceTrack(camTrack);
      });
      const localVid = document.getElementById('localVideo');
      if (localVid) localVid.srcObject = localStream;
    }
    isScreenSharing = false;
    btnScreen.classList.remove('active');
  }

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

  if (btnEnd) {
    btnEnd.onclick = () => {
      if (confirm('Leave Nyrava Team Meet consultation?')) {
        if (localStream) localStream.getTracks().forEach(t => t.stop());
        if (screenStream) screenStream.getTracks().forEach(t => t.stop());
        window.location.href = '/';
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

  // In-Room Chat Form
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
      <div class="chat-author">${senderName} <span class="chat-time">${time}</span></div>
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

  // Copy Meeting Link Button
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

  // 7. Nyra AI Assistant Prompts
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

  // 8. Listen for Plugin postMessage commands from NyravaTeamMeet embed API
  window.addEventListener('message', (event) => {
    if (event.data && event.data.source === 'nyrava-team-meet-api') {
      const { command } = event.data;
      if (command === 'toggleAudio' && btnMic) btnMic.click();
      if (command === 'toggleVideo' && btnCam) btnCam.click();
      if (command === 'shareScreen' && btnScreen) btnScreen.click();
      if (command === 'leave' && btnEnd) btnEnd.click();
    }
  });

})();
