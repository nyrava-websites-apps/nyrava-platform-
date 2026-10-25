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

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({
    service: 'nyrava-meet-consultation',
    status: 'online',
    port: PORT,
    activeRooms: rooms.size
  });
});

// WebRTC Signaling Rooms
const rooms = new Map(); // roomId -> Set of ws clients

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

        // Notify client of current participants
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

        // Broadcast to existing peers that a new user arrived
        roomPeers.forEach((peer, id) => {
          if (id !== clientId && peer.ws.readyState === WebSocket.OPEN) {
            peer.ws.send(JSON.stringify({
              type: 'peer-joined',
              id: clientId,
              name: data.name || 'Participant'
            }));
          }
        });
      } else if (data.type === 'signal') {
        // Forward signaling message (offer, answer, candidate) to target peer
        const targetId = data.target;
        const roomPeers = rooms.get(currentRoom);
        if (roomPeers && roomPeers.has(targetId)) {
          const targetPeer = roomPeers.get(targetId);
          if (targetPeer.ws.readyState === WebSocket.OPEN) {
            targetPeer.ws.send(JSON.stringify({
              type: 'signal',
              sender: clientId,
              data: data.data
            }));
          }
        }
      } else if (data.type === 'chat') {
        // Broadcast chat to all peers in room
        const roomPeers = rooms.get(currentRoom);
        if (roomPeers) {
          roomPeers.forEach((peer) => {
            if (peer.ws.readyState === WebSocket.OPEN) {
              peer.ws.send(JSON.stringify({
                type: 'chat',
                sender: data.name || 'Participant',
                text: data.text,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }));
            }
          });
        }
      }
    } catch (err) {
      console.error('[Signaling Error]', err);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const roomPeers = rooms.get(currentRoom);
      roomPeers.delete(clientId);
      if (roomPeers.size === 0) {
        rooms.delete(currentRoom);
      } else {
        // Notify others
        roomPeers.forEach((peer) => {
          if (peer.ws.readyState === WebSocket.OPEN) {
            peer.ws.send(JSON.stringify({
              type: 'peer-left',
              id: clientId
            }));
          }
        });
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Nyrava Meet & Video Consultation] Server listening on http://0.0.0.0:${PORT}`);
});
