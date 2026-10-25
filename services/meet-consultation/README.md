# Nyrava Team Meet (Self-Hosted Video Consultation Engine)

**Nyrava Team Meet** is a standalone, self-hosted, private WebRTC multi-party video conferencing, consultation, and screen-sharing system designed specifically for Realtors, their teams, and client meetings.

It is 100% owned, operated, and branded for Nyrava — completely replacing third-party systems like Jitsi Meet or 8x8 with zero monthly per-user fees or meeting time limits.

---

## Features

- **Multi-Party WebRTC Video Grid:** Dynamic responsive video grid for teams, buyers, and sellers.
- **HD Screen Sharing:** Share property presentations, MLS listings, and home valuation reports in real time.
- **In-Meeting Team Chat:** Encrypted in-room chat messages.
- **Nyra Real Estate AI Assistant:** Built-in intelligence for property comp lookups, mortgage rate amortization, and seller net sheets.
- **Instant Room Invite Links:** 1-click room creation and link copying (`https://meet.nyrava.com/room/{id}`).
- **Drop-in Embed SDK (`external_api.js`):** Plug into any web page or CRM workspace just like Jitsi Meet (`NyravaTeamMeet` / `JitsiMeetExternalAPI`).

---

## How to Plug In (Like Jitsi Meet)

You can embed Nyrava Team Meet into any CRM, website, or custom dashboard with two lines of code:

### 1. Include the SDK:
```html
<script src="https://meet.nyrava.com/external_api.js"></script>
```

### 2. Launch the Meeting:
```javascript
const meet = new NyravaTeamMeet({
  roomName: 'Austin-Territory-Team',
  parentNode: document.getElementById('meet-container'),
  width: '100%',
  height: '600px',
  userInfo: {
    displayName: 'Sarah Realtor'
  }
});
```

### Programmatic Control:
```javascript
// Toggle microphone
meet.executeCommand('toggleAudio');

// Toggle camera
meet.executeCommand('toggleVideo');

// Toggle screen share
meet.executeCommand('shareScreen');

// Leave / end meeting
meet.dispose();
```

---

## Standalone Quick Start

### Option A: Node.js Directly
```bash
npm install
node server.mjs
```
The server will start on port `5000`: `http://localhost:5000`

### Option B: Docker
```bash
docker compose up -d --build
```

---

## Production Reverse Proxy (Caddy Example)

```caddy
meet.nyrava.com {
    reverse_proxy localhost:5000
}
```

---

## Architecture

- **Signaling:** Node.js + WebSockets (`ws`)
- **Transport:** Native Browser WebRTC with Google STUN (`stun:stun.l.google.com:19302`)
- **Front-End:** Vanilla JS (zero bundler bloat, zero runtime dependencies)
- **Security:** End-to-end WebRTC DTLS/SRTP encryption
