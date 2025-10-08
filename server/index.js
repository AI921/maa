// server/index.js
// Full Express + Socket.IO server with signaling and TURN credential endpoints.
// Place this file at maa-main/server/index.js (replace your current server file).
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: '*' } // tighten in production
});

const CLIENT_DIR = path.join(__dirname, '..', 'client'); // adjust if needed
app.use(express.static(CLIENT_DIR));
app.use(express.json());

// Environment variables (set these in Render / your VM)
// - TURN_USE_LT_CRED: if "true", server will generate temporary TURN credentials using TURN_SHARED_SECRET
// - TURN_SHARED_SECRET: shared secret used for long-term credentials (HMAC-SHA1). Used only if TURN_USE_LT_CRED=true
// - TURN_URLS: optional comma-separated turn/stun URLs to include in pcConfig (eg "stun:stun.l.google.com:19302,turn:turn.example.com:3478")
// - TURN_USERNAME & TURN_PASSWORD: optional static username/password (if not using shared secret)
const TURN_USE_LT_CRED = (process.env.TURN_USE_LT_CRED || 'false').toLowerCase() === 'true';
const TURN_SHARED_SECRET = process.env.TURN_SHARED_SECRET || '';
const TURN_URLS = (process.env.TURN_URLS || 'stun:stun.l.google.com:19302').split(',').map(s => s.trim()).filter(Boolean);
const STATIC_TURN_USERNAME = process.env.TURN_USERNAME || '';
const STATIC_TURN_PASSWORD = process.env.TURN_PASSWORD || '';

// Simple endpoint to return static TURN/STUN urls (client can call this)
app.get('/turn-config', (req, res) => {
  const urls = TURN_URLS;
  res.json({ urls });
});

// Endpoint to request short-lived TURN credentials (RFC 5389 long-term mechanism variant).
// Server-side will return { username, credential, ttl, urls } if TURN_USE_LT_CRED=true and TURN_SHARED_SECRET present.
// If TURN_USERNAME/TURN_PASSWORD env vars are set (static), they are returned instead.
app.get('/turn-credentials', (req, res) => {
  // If static TURN username/password provided, return them
  if (STATIC_TURN_USERNAME && STATIC_TURN_PASSWORD) {
    return res.json({
      urls: TURN_URLS,
      username: STATIC_TURN_USERNAME,
      credential: STATIC_TURN_PASSWORD,
      ttl: 86400
    });
  }

  if (!TURN_USE_LT_CRED || !TURN_SHARED_SECRET) {
    // fallback: no TURN credentials available
    return res.status(400).json({ error: 'TURN not configured on server. Set TURN_USERNAME/TURN_PASSWORD or TURN_USE_LT_CRED + TURN_SHARED_SECRET.' });
  }

  // Generate a username based on expiry timestamp (seconds) and optionally a small random token.
  // Many TURN servers accept a username which is the expiry timestamp (e.g. "1609459200") or "username:expiry".
  // Here we use "expiry:random" to be conservative.
  const ttl = parseInt(process.env.TURN_CREDENTIAL_TTL || '3600', 10); // default 1 hour
  const expiry = Math.floor(Date.now() / 1000) + ttl;
  const shortRandom = crypto.randomBytes(4).toString('hex');
  const username = `${expiry}:${shortRandom}`;

  // credential = base64(hmac-sha1(shared_secret, username))
  const hmac = crypto.createHmac('sha1', TURN_SHARED_SECRET);
  hmac.update(username);
  const credential = hmac.digest('base64');

  res.json({
    urls: TURN_URLS,
    username,
    credential,
    ttl
  });
});

// ------------------- Socket.IO signaling -------------------
io.on('connection', socket => {
  console.log('socket connected', socket.id);

  socket.on('join-room', (roomId, meta = {}) => {
    try {
      socket.join(roomId);
      const clients = io.sockets.adapter.rooms.get(roomId) || new Set();
      console.log('join-room', roomId, 'clients:', clients.size, 'joined:', socket.id);

      // notify existing peer(s)
      socket.to(roomId).emit('peer-joined', socket.id);

      // send creation/joined events back to the caller
      if (clients.size === 1) {
        socket.emit('created');
      } else {
        socket.emit('joined');
        // tell existing peer to prepare to receive the offer
        socket.to(roomId).emit('ready');
      }
    } catch (err) {
      console.error('join-room error', err);
    }
  });

  socket.on('offer', (data) => {
    // data = { to, from, sdp, roomId, name? }
    if (!data || !data.to) return;
    io.to(data.to).emit('offer', data);
  });

  socket.on('answer', (data) => {
    // data = { to, from, sdp, roomId, name? }
    if (!data || !data.to) return;
    io.to(data.to).emit('answer', data);
  });

  socket.on('ice-candidate', (data) => {
    // data = { to, from, candidate }
    if (!data || !data.to) return;
    io.to(data.to).emit('ice-candidate', data);
  });

  socket.on('leave-room', (roomId) => {
    try {
      socket.leave(roomId);
      socket.to(roomId).emit('peer-left', socket.id);
    } catch (err) { console.warn(err); }
  });

  socket.on('disconnect', (reason) => {
    console.log('socket disconnect', socket.id, reason);
    // Optionally broadcast this disconnect to rooms if you maintain mapping.
  });
});
// ------------------- end signaling -------------------

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
