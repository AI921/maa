// call.js - polished 1:1 WebRTC voice client
// Expects socket.io client lib already loaded and available as `io()`.
// It will try to reuse a global window.socket if your app creates it.

(() => {
  // prefer existing socket if your app has one
  const socket = window.socket || (window.io ? io() : null);
  if (!socket) {
    console.error('Socket.IO not available. Make sure /socket.io/socket.io.js is loaded.');
    return;
  }

  // UI elements
  const joinCallBtn = document.getElementById('joinCallBtn');
  const leaveCallBtn = document.getElementById('leaveCallBtn');
  const muteBtn = document.getElementById('muteBtn');
  const callRoomInput = document.getElementById('callRoom');
  const callerNameInput = document.getElementById('callerName');
  const callStatus = document.getElementById('callStatus');
  const callTimer = document.getElementById('callTimer');
  const remoteAudio = document.getElementById('remoteAudio');
  const muteIcon = document.getElementById('muteIcon');
  const muteText = document.getElementById('muteText');

  // State
  let localStream = null;
  let pc = null;
  let myId = null;
  let remoteId = null;
  let callRoom = null;
  let callerName = null;
  let muted = false;
  let timerInterval = null;
  let callStartTs = null;
  let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

  function setStatus(s) { if (callStatus) callStatus.innerText = s; }

  // fetch TURN configuration from server (first credentials endpoint, fallback to config)
  async function fetchTurnConfig() {
    try {
      // Try long-term credentials first
      const r = await fetch('/turn-credentials');
      if (r.ok) {
        const j = await r.json();
        const urls = j.urls || [];
        const entry = { urls };
        if (j.username && j.credential) {
          entry.username = j.username;
          entry.credential = j.credential;
        }
        iceServers = urls.map(u => {
          const e = { urls: u };
          if (entry.username && entry.credential && u.startsWith('turn')) {
            e.username = entry.username;
            e.credential = entry.credential;
          }
          return e;
        });
        console.log('Using TURN/STUN config (credentials)', iceServers);
        return;
      } else {
        // fallback
        console.warn('/turn-credentials returned', r.status);
      }
    } catch (err) {
      console.warn('turn-credentials fetch failed', err);
    }

    try {
      const r2 = await fetch('/turn-config');
      if (r2.ok) {
        const j2 = await r2.json();
        const urls = j2.urls || ['stun:stun.l.google.com:19302'];
        iceServers = urls.map(u => ({ urls: u }));
        console.log('Using TURN/STUN config (simple)', iceServers);
      }
    } catch (err) {
      console.warn('turn-config fetch failed', err);
      iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    }
  }

  // Initialize: fetch TURN info early
  fetchTurnConfig();

  // Setup socket handlers
  socket.on('connect', () => {
    myId = socket.id;
    console.log('socket connected', myId);
  });

  socket.on('peer-joined', (id) => {
    remoteId = id;
    console.log('peer-joined', id);
  });

  socket.on('created', () => setStatus('Waiting for peer...'));
  socket.on('joined', () => setStatus('Peer present — preparing...'));

  socket.on('ready', async () => {
    // other peer ready => we will create offer
    try {
      await ensureLocalStream();
      createPeerConnection();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { to: remoteId, from: myId, sdp: offer, roomId: callRoom, name: callerName });
      setStatus('Calling...');
    } catch (err) {
      console.error('ready->offer error', err);
      setStatus('Error creating offer');
    }
  });

  socket.on('offer', async (data) => {
    remoteId = data.from;
    if (data.name) setStatus('Incoming call from ' + data.name);
    try {
      await ensureLocalStream();
      createPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { to: remoteId, from: myId, sdp: answer, roomId: callRoom, name: callerName });
      setStatus('In call');
      startCallTimer();
    } catch (err) {
      console.error('offer->answer error', err);
      setStatus('Error handling offer');
    }
  });

  socket.on('answer', async (data) => {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      setStatus('In call');
      startCallTimer();
    } catch (err) {
      console.warn('answer error', err);
    }
  });

  socket.on('ice-candidate', async (data) => {
    if (!pc) return;
    try {
      await pc.addIceCandidate(data.candidate);
    } catch (err) {
      console.warn('Failed to add ICE', err);
    }
  });

  socket.on('peer-left', (id) => {
    setStatus('Peer left');
    hangUp();
  });

  async function ensureLocalStream() {
    if (localStream) return;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      muted = false;
      if (localStream.getAudioTracks().length === 0) {
        throw new Error('No audio tracks found');
      }
    } catch (err) {
      alert('Microphone access required: ' + err.message);
      throw err;
    }
  }

  function createPeerConnection() {
    if (pc) return;
    pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (evt) => {
      if (evt.candidate && remoteId) {
        socket.emit('ice-candidate', { to: remoteId, from: myId, candidate: evt.candidate });
      }
    };

    pc.ontrack = (evt) => {
      remoteAudio.srcObject = evt.streams[0];
    };

    pc.onconnectionstatechange = () => {
      console.log('pc.connectionState', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setStatus('Connection lost');
      } else if (pc.connectionState === 'connected') {
        setStatus('Connected');
      }
    };

    // If we already have local stream, attach tracks
    if (localStream) {
      localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    }
  }

  async function joinCall() {
    callRoom = callRoomInput.value.trim();
    callerName = callerNameInput.value.trim() || 'Anonymous';
    if (!callRoom) return alert('Enter a room ID (share with peer)');
    // re-fetch TURN config just before call in case credentials rotated
    await fetchTurnConfig();
    socket.emit('join-room', callRoom, { name: callerName });
    joinCallBtn.disabled = true;
    leaveCallBtn.disabled = false;
    muteBtn.disabled = false;
    setStatus('Joined room: ' + callRoom);
  }

  async function hangUp() {
    if (pc) {
      try { pc.close(); } catch (e) { /* ignore */ }
      pc = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    remoteAudio.srcObject = null;
    joinCallBtn.disabled = false;
    leaveCallBtn.disabled = true;
    muteBtn.disabled = true;
    if (callRoom) socket.emit('leave-room', callRoom);
    stopCallTimer();
    setStatus('Call ended');
    callRoom = null;
    remoteId = null;
  }

  function toggleMute() {
    if (!localStream) return;
    muted = !muted;
    localStream.getAudioTracks().forEach(t => t.enabled = !muted);
    if (muteIcon) muteIcon.innerText = muted ? '🔈' : '🔊';
    if (muteText) muteText.innerText = muted ? 'Unmute' : 'Mute';
  }

  function startCallTimer() {
    if (timerInterval) return;
    callStartTs = Date.now();
    timerInterval = setInterval(() => {
      const diff = Date.now() - callStartTs;
      const s = Math.floor(diff / 1000) % 60;
      const m = Math.floor(diff / 60000);
      callTimer.innerText = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }, 1000);
  }

  function stopCallTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    callTimer.innerText = '00:00';
  }

  joinCallBtn.addEventListener('click', joinCall);
  leaveCallBtn.addEventListener('click', hangUp);
  muteBtn.addEventListener('click', toggleMute);
})();
