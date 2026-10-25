import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 5000;

// Enable CORS for external embedding (like Jitsi external API)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // Allow iframing by parent origins
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors *;");
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    service: 'nyrava-team-meet',
    status: 'online',
    port: PORT,
    activeRooms: rooms.size,
    time: new Date().toISOString()
  });
});

// Direct room routes: /room/:roomId or /:roomId
app.get(['/room/:roomId', '/:roomId([a-zA-Z0-9_-]{3,64})'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===================================================================
// WebRTC Signaling Server for Multi-Party Mesh Calls
// ===================================================================
const rooms = new Map(); // roomId -> Map of clientId -> { ws, name }

wss.on('connection', (ws) => {
  let currentRoom = null;
  let clientId = 'usr_' + Math.random().toString(36).substring(2, 9);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'join') {
        currentRoom = data.room || 'general';
        if (!rooms.has(currentRoom)) {
          rooms.set(currentRoom, new Map());
        }
        const roomPeers = rooms.get(currentRoom);
        roomPeers.set(clientId, { ws, name: data.name || 'Participant' });

        // Notify newcomer of all active peers in room
        const participants = [];
        roomPeers.forEach((peer, id) => {
          if (id !== clientId) {
            participants.push({ id, name: peer.name });
          }
        });

        ws.send(JSON.stringify({
          type: 'room-joined',
          clientId,
          room: currentRoom,
          peers: participants
        }));

        // Notify existing peers of the newcomer
        roomPeers.forEach((peer, id) => {
          if (id !== clientId && peer.ws.readyState === WebSocket.OPEN) {
            peer.ws.send(JSON.stringify({
              type: 'peer-joined',
              peerId: clientId,
              name: data.name || 'Participant'
            }));
          }
        });

        console.log(`[Nyrava Team Meet] Client ${clientId} joined room "${currentRoom}" (Total: ${roomPeers.size})`);
      }

      // Relay WebRTC SDP Offers, Answers, and ICE candidates
      if (['offer', 'answer', 'ice-candidate'].includes(data.type)) {
        const roomPeers = rooms.get(currentRoom);
        if (roomPeers && roomPeers.has(data.target)) {
          const targetPeer = roomPeers.get(data.target);
          if (targetPeer.ws.readyState === WebSocket.OPEN) {
            targetPeer.ws.send(JSON.stringify({
              ...data,
              from: clientId
            }));
          }
        }
      }

      // Relay in-room chat messages
      if (data.type === 'chat') {
        const roomPeers = rooms.get(currentRoom);
        if (roomPeers) {
          const chatMsg = JSON.stringify({
            type: 'chat',
            from: clientId,
            name: data.name || 'Participant',
            text: data.text || '',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
          roomPeers.forEach((peer) => {
            if (peer.ws.readyState === WebSocket.OPEN) {
              peer.ws.send(chatMsg);
            }
          });
        }
      }

    } catch (e) {
      console.warn('[Signaling Error]', e.message);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const roomPeers = rooms.get(currentRoom);
      roomPeers.delete(clientId);

      // Notify others in room
      roomPeers.forEach((peer) => {
        if (peer.ws.readyState === WebSocket.OPEN) {
          peer.ws.send(JSON.stringify({
            type: 'peer-left',
            peerId: clientId
          }));
        }
      });

      if (roomPeers.size === 0) {
        rooms.delete(currentRoom);
      }
      console.log(`[Nyrava Team Meet] Client ${clientId} left room "${currentRoom}"`);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================================`);
  console.log(`   NYRAVA TEAM MEET SERVER (STANDALONE)`);
  console.log(`   Running at: http://localhost:${PORT}`);
  console.log(`   Embed API: http://localhost:${PORT}/external_api.js`);
  console.log(`=================================================================`);
});
