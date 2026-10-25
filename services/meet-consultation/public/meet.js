// WebRTC Peer Connection & Nyra Meet Client Logic
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room') || 'NYR-' + Math.floor(100 + Math.random() * 900);
document.getElementById('roomIndicator').innerText = `Room: ${roomId}`;

let localStream = null;
let ws = null;
const peers = new Map(); // id -> RTCPeerConnection
const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// UI Elements
const localVideo = document.getElementById('localVideo');
const videoGrid = document.getElementById('videoGrid');
const btnToggleMic = document.getElementById('btnToggleMic');
const btnToggleCam = document.getElementById('btnToggleCam');
const btnScreenShare = document.getElementById('btnScreenShare');
const btnToggleChat = document.getElementById('btnToggleChat');
const sidePanel = document.getElementById('sidePanel');
const btnCopyInvite = document.getElementById('btnCopyInvite');

btnCopyInvite.addEventListener('click', () => {
  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
  navigator.clipboard.writeText(inviteUrl);
  btnCopyInvite.innerText = 'Copied!';
  setTimeout(() => btnCopyInvite.innerText = '🔗 Copy Invite Link', 2000);
});

// Setup Media
async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch (err) {
    console.warn('Camera/Mic permission denied, operating in receive-only mode.', err);
  }
  connectSignaling();
}

function connectSignaling() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'join',
      room: roomId,
      name: 'User ' + Math.floor(Math.random() * 100)
    }));
  };

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'room-joined') {
      // Connect to existing peers
      for (const peer of msg.peers) {
        initiatePeerConnection(peer.id, true);
      }
    } else if (msg.type === 'peer-joined') {
      initiatePeerConnection(msg.id, false);
    } else if (msg.type === 'signal') {
      handleSignal(msg.sender, msg.data);
    } else if (msg.type === 'peer-left') {
      removePeer(msg.id);
    } else if (msg.type === 'chat') {
      appendChatMessage(msg.sender, msg.text, msg.timestamp);
    }
  };
}

function initiatePeerConnection(peerId, isInitiator) {
  const pc = new RTCPeerConnection(config);
  peers.set(peerId, pc);

  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        type: 'signal',
        target: peerId,
        data: { candidate: event.candidate }
      }));
    }
  };

  pc.ontrack = (event) => {
    let remoteCard = document.getElementById(`card_${peerId}`);
    if (!remoteCard) {
      remoteCard = document.createElement('div');
      remoteCard.className = 'video-card';
      remoteCard.id = `card_${peerId}`;
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.srcObject = event.streams[0];
      const label = document.createElement('div');
      label.className = 'participant-label';
      label.innerText = 'Client';
      remoteCard.appendChild(video);
      remoteCard.appendChild(label);
      videoGrid.appendChild(remoteCard);
    }
  };

  if (isInitiator) {
    pc.onnegotiationneeded = async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.send(JSON.stringify({
        type: 'signal',
        target: peerId,
        data: { sdp: pc.localDescription }
      }));
    };
  }
}

async function handleSignal(senderId, data) {
  let pc = peers.get(senderId);
  if (!pc) {
    initiatePeerConnection(senderId, false);
    pc = peers.get(senderId);
  }

  if (data.sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    if (data.sdp.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({
        type: 'signal',
        target: senderId,
        data: { sdp: pc.localDescription }
      }));
    }
  } else if (data.candidate) {
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
}

function removePeer(peerId) {
  const pc = peers.get(peerId);
  if (pc) {
    pc.close();
    peers.delete(peerId);
  }
  const card = document.getElementById(`card_${peerId}`);
  if (card) card.remove();
}

// Media Controls
btnToggleMic.addEventListener('click', () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    btnToggleMic.classList.toggle('active', audioTrack.enabled);
  }
});

btnToggleCam.addEventListener('click', () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    btnToggleCam.classList.toggle('active', videoTrack.enabled);
  }
});

btnScreenShare.addEventListener('click', async () => {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];
    peers.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(screenTrack);
    });
    screenTrack.onended = () => {
      const origTrack = localStream.getVideoTracks()[0];
      peers.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(origTrack);
      });
    };
  } catch (err) {
    console.error('Screen sharing cancelled', err);
  }
});

// Chat
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  ws.send(JSON.stringify({ type: 'chat', text }));
  chatInput.value = '';
});

function appendChatMessage(sender, text, time) {
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.innerHTML = `<div class="chat-sender">${sender} <span style="font-weight:normal;color:#64748b;margin-left:6px;">${time}</span></div><div>${text}</div>`;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Tabs
const tabChat = document.getElementById('tabChat');
const tabNyra = document.getElementById('tabNyra');
const chatView = document.getElementById('chatView');
const nyraView = document.getElementById('nyraView');

tabChat.addEventListener('click', () => {
  tabChat.classList.add('active');
  tabNyra.classList.remove('active');
  chatView.hidden = false;
  nyraView.hidden = true;
});

tabNyra.addEventListener('click', () => {
  tabNyra.classList.add('active');
  tabChat.classList.remove('active');
  nyraView.hidden = false;
  chatView.hidden = true;
});

btnToggleChat.addEventListener('click', () => {
  sidePanel.hidden = !sidePanel.hidden;
});

// AI Nyra Interaction
window.askNyra = (prompt) => {
  const container = document.getElementById('nyraResponses');
  const card = document.createElement('div');
  card.className = 'nyra-card';
  card.innerHTML = `<strong>Q: ${prompt}</strong><p style="margin-top:6px; color:#a7f3d0;">Nyra is calculating response...</p>`;
  container.appendChild(card);
  container.scrollTop = container.scrollHeight;

  setTimeout(() => {
    let answer = "Analyzing market parameters based on nationwide 60-ZIP index...";
    if (prompt.includes('mortgage')) {
      answer = "Current 30-Year Fixed Mortgage Rates average 6.62%. On a $400k loan, estimated monthly principal & interest is approx. $2,559.";
    } else if (prompt.includes('appraisal')) {
      answer = "An appraisal is an official lender-ordered property valuation conducted by a licensed appraiser. A market valuation is a comparative analysis based on recent arm's-length sales and market momentum.";
    } else if (prompt.includes('net-sheet')) {
      answer = "Seller Net Sheet: Typical deductions include broker commission (5-6%), title/escrow fees (1%), transfer taxes (0.5-1.5%), and pro-rated property taxes.";
    }
    card.querySelector('p').innerText = answer;
  }, 900);
};

initMedia();
