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
const startTime = Date.now();

// Resilient Redis presence adapter
let redis = null;
if (process.env.REDIS_HOST || process.env.REDIS_URL) {
  try {
    const { default: Redis } = await import('ioredis');
    redis = new Redis(process.env.REDIS_URL || {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 200, 3000)
    });
    redis.connect().catch((err) => {
      console.log('[Meet Redis] Optional presence falling back to local memory:', err.message);
    });
  } catch (err) {
    console.log('[Meet Redis] Optional ioredis not active:', err.message);
  }
}

// Enable CORS for external embedding
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors *;");
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Observability: Health endpoint
app.get(['/health', '/healthz'], (req, res) => {
  res.json({
    service: 'meet-consultation',
    status: 'healthy',
    port: PORT,
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    activeRooms: rooms.size,
    redis: redis && redis.status === 'ready' ? 'connected' : 'in-memory',
    timestamp: new Date().toISOString()
  });
});

// Observability: Prometheus Metrics
app.get('/metrics', (req, res) => {
  let totalPeers = 0;
  rooms.forEach((peers) => { totalPeers += peers.size; });
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const metrics = `# HELP nyrava_meet_uptime_seconds Video service uptime in seconds\n` +
                  `# TYPE nyrava_meet_uptime_seconds gauge\n` +
                  `nyrava_meet_uptime_seconds ${uptime}\n\n` +
                  `# HELP nyrava_meet_active_rooms Active video rooms\n` +
                  `# TYPE nyrava_meet_active_rooms gauge\n` +
                  `nyrava_meet_active_rooms ${rooms.size}\n\n` +
                  `# HELP nyrava_meet_active_peers Active connected participants\n` +
                  `# TYPE nyrava_meet_active_peers gauge\n` +
                  `nyrava_meet_active_peers ${totalPeers}\n`;
  res.setHeader('Content-Type', 'text/plain');
  res.send(metrics);
});

// Redis Presence Query
app.get('/api/presence', async (req, res) => {
  if (redis && redis.status === 'ready') {
    try {
      const activeRooms = await redis.smembers('nyra:rooms');
      return res.json({ source: 'redis', activeRooms, roomCount: activeRooms.length });
    } catch (e) { }
  }
  res.json({ source: 'memory', activeRooms: Array.from(rooms.keys()), roomCount: rooms.size });
});

// Direct room routes: /room/:roomId or /:roomId
app.get(['/room/:roomId', '/:roomId([a-zA-Z0-9_-]{3,64})'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===================================================================
// WebRTC Signaling Server with Redis Presence Integration
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

        // Update Redis Presence
        if (redis && redis.status === 'ready') {
          redis.sadd('nyra:rooms', currentRoom).catch(() => {});
          redis.hset(`nyra:room:${currentRoom}:peers`, clientId, data.name || 'Participant').catch(() => {});
        }

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

      // Update Redis Presence
      if (redis && redis.status === 'ready') {
        redis.hdel(`nyra:room:${currentRoom}:peers`, clientId).catch(() => {});
        if (roomPeers.size === 0) {
          redis.srem('nyra:rooms', currentRoom).catch(() => {});
        }
      }

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
  console.log(`   NYRAVA TEAM MEET SERVER (BLUE ARCHITECTURE WITH REDIS)`);
  console.log(`   Running at: http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/healthz`);
  console.log(`   Metrics: http://localhost:${PORT}/metrics`);
  console.log(`=================================================================`);
});
