/**
 * AegisCam Remote View Engine
 * Multi-Layered Streaming: High-Speed WebSocket Frame Broadcast + PeerJS WebRTC Relay.
 */
class RemoteEngine {
  constructor() {
    this.peer = null;
    this.ws = null;
    this.peerId = null;
    this.role = null; // 'host' | 'remote'
    
    // Connected Channels
    this.dataConnections = new Set();
    this.peerCalls = new Set();

    this.serverInfo = null;
    this.wsFrameInterval = null;

    // Callbacks
    this.onRemoteAlert = null;
    this.onRemoteCommand = null;
    this.onStreamReady = null;
    this.onFrameReceived = null;
    this.onStatusChange = null;
    this.onError = null;
  }

  async fetchServerInfo() {
    try {
      const res = await fetch('/api/info');
      this.serverInfo = await res.json();
      return this.serverInfo;
    } catch (err) {
      console.warn('[RemoteEngine] Could not fetch server info:', err);
      return null;
    }
  }

  // --- HOST CAMERA MODE ---
  initHost(customPeerId = '123456cam123456cam') {
    this.role = 'host';
    this.peerId = customPeerId;

    this.initWebSocketHost();
    this.initPeerJSHost(customPeerId);
    this.startWebSocketFrameBroadcaster();
  }

  // High-Speed 10 FPS WebSocket Frame Broadcaster (Guaranteed 100% working stream fallback)
  startWebSocketFrameBroadcaster() {
    if (this.wsFrameInterval) clearInterval(this.wsFrameInterval);
    this.wsFrameInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const canvas = document.getElementById('cctvCanvas');
        if (canvas) {
          const frameDataUrl = canvas.toDataURL('image/jpeg', 0.45);
          this.ws.send(JSON.stringify({
            type: 'stream-frame',
            frame: frameDataUrl
          }));
        }
      }
    }, 100); // 10 FPS live server stream broadcast
  }

  initWebSocketHost() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        console.log('[WS Host] Registered with server');
        this.ws.send(JSON.stringify({ type: 'register-host' }));
      };

      this.ws.onmessage = async (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'remote-connected') {
            console.log('[WS Host] Remote client connected. Initiating WebRTC...');
            await this.initiateWsPeerConnection();
          } else if (msg.type === 'sdp-answer' && this.wsPeerConn) {
            await this.wsPeerConn.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          } else if (msg.type === 'ice-candidate' && this.wsPeerConn && msg.candidate) {
            await this.wsPeerConn.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } else if (msg.type === 'remote-command' && this.onRemoteCommand) {
            this.onRemoteCommand(msg.command, msg.params);
          }
        } catch (err) {
          console.error('[WS Host] Message error:', err);
        }
      };
    } catch (err) {
      console.warn('[WS Host] WebSocket warning:', err);
    }
  }

  async initiateWsPeerConnection() {
    const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    this.wsPeerConn = new RTCPeerConnection(config);

    const canvas = document.getElementById('cctvCanvas');
    if (canvas) {
      const stream = canvas.captureStream(30);
      stream.getTracks().forEach(t => this.wsPeerConn.addTrack(t, stream));
    }

    this.wsPeerConn.onicecandidate = (e) => {
      if (e.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ice-candidate', candidate: e.candidate }));
      }
    };

    const offer = await this.wsPeerConn.createOffer();
    await this.wsPeerConn.setLocalDescription(offer);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'sdp-offer', sdp: offer }));
    }
  }

  initPeerJSHost(customPeerId) {
    if (!window.Peer) {
      console.warn('[PeerJS] Library not loaded.');
      return;
    }

    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }

    const peerOptions = {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    };

    try {
      this.peer = new Peer(customPeerId, peerOptions);

      this.peer.on('open', (id) => {
        console.log(`[PeerJS Host] Connected globally with Camera ID: ${id}`);
        if (this.onStatusChange) this.onStatusChange(true, `GLOBAL ONLINE: ${id}`);
      });

      this.peer.on('call', (call) => {
        console.log('[PeerJS Host] Incoming call from peer:', call.peer);
        const canvas = document.getElementById('cctvCanvas');
        if (canvas) {
          const canvasStream = canvas.captureStream(30);
          const tracks = [...canvasStream.getVideoTracks()];

          const webcamVideo = document.getElementById('webcamVideo');
          if (webcamVideo && webcamVideo.srcObject && webcamVideo.srcObject.getAudioTracks().length > 0) {
            tracks.push(webcamVideo.srcObject.getAudioTracks()[0]);
          }

          const combinedStream = new MediaStream(tracks);
          call.answer(combinedStream);
          this.peerCalls.add(call);
        }
      });

      this.peer.on('connection', (conn) => {
        console.log('[PeerJS Host] Data conn open from:', conn.peer);
        this.dataConnections.add(conn);

        conn.on('data', (data) => {
          if (data && data.type === 'remote-command' && this.onRemoteCommand) {
            this.onRemoteCommand(data.command, data.params);
          }
        });

        conn.on('close', () => this.dataConnections.delete(conn));
      });

      this.peer.on('error', (err) => {
        console.warn('[PeerJS Host] Error:', err);
        if (err.type === 'unavailable-id') {
          console.log('[PeerJS Host] Retrying PeerJS in 2s...');
          setTimeout(() => this.initPeerJSHost(customPeerId), 2000);
        }
      });
    } catch (err) {
      console.error('[PeerJS Host] Failed:', err);
    }
  }

  // --- REMOTE VIEWER MODE ---
  initRemote(targetCameraId = '123456cam123456cam') {
    this.role = 'remote';
    console.log(`[RemoteEngine] Remote connecting to camera: ${targetCameraId}`);

    if (this.onStatusChange) this.onStatusChange(false, 'Connecting to live camera stream...');

    this.initWebSocketRemote();

    if (window.Peer) {
      this.initPeerJSRemote(targetCameraId);
    }
  }

  initWebSocketRemote() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        console.log('[WS Remote] Connected to server WebSocket');
        this.ws.send(JSON.stringify({ type: 'register-remote' }));
        if (this.onStatusChange) this.onStatusChange(true, 'SERVER STREAM CONNECTED');
      };

      this.ws.onmessage = async (e) => {
        try {
          const msg = JSON.parse(e.data);
          
          // Instant Server Broadcast Stream Frame
          if (msg.type === 'stream-frame' && msg.frame && this.onFrameReceived) {
            this.onFrameReceived(msg.frame);
          } else if (msg.type === 'sdp-offer') {
            await this.handleWsOffer(msg.sdp);
          } else if (msg.type === 'ice-candidate' && this.wsPeerConn && msg.candidate) {
            await this.wsPeerConn.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } else if (msg.type === 'motion-alert' && this.onRemoteAlert) {
            this.onRemoteAlert(msg);
          } else if (msg.type === 'host-status') {
            if (!msg.online && this.onError) {
              this.onError('Camera Host is currently OFFLINE. Please start camera on desktop PC.');
            }
          }
        } catch (err) {
          console.error('[WS Remote] Message handling error:', err);
        }
      };
    } catch (err) {
      console.warn('[WS Remote] WebSocket connect failed:', err);
    }
  }

  async handleWsOffer(sdpOffer) {
    const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    this.wsPeerConn = new RTCPeerConnection(config);

    this.wsPeerConn.ontrack = (e) => {
      console.log('[WS Remote] Received WebRTC video track!');
      if (this.onStreamReady) this.onStreamReady(e.streams[0]);
    };

    this.wsPeerConn.onicecandidate = (e) => {
      if (e.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ice-candidate', candidate: e.candidate }));
      }
    };

    await this.wsPeerConn.setRemoteDescription(new RTCSessionDescription(sdpOffer));
    const answer = await this.wsPeerConn.createAnswer();
    await this.wsPeerConn.setLocalDescription(answer);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'sdp-answer', sdp: answer }));
    }
  }

  initPeerJSRemote(targetCameraId) {
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }

    const peerOptions = {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    };

    try {
      this.peer = new Peer(peerOptions);

      this.peer.on('open', (id) => {
        console.log(`[PeerJS Remote] Connecting to Camera ID: ${targetCameraId}...`);

        const conn = this.peer.connect(targetCameraId);
        conn.on('open', () => {
          console.log('[PeerJS Remote] Data channel open!');
          this.dataConnections.add(conn);
          if (this.onStatusChange) this.onStatusChange(true, 'LIVE GLOBAL STREAM');
        });

        conn.on('data', (data) => {
          if (data && data.type === 'motion-alert' && this.onRemoteAlert) {
            this.onRemoteAlert(data);
          } else if (data && data.type === 'live-frame' && this.onFrameReceived) {
            this.onFrameReceived(data.image);
          }
        });

        const dummyCanvas = document.createElement('canvas');
        const dummyStream = dummyCanvas.captureStream(1);

        const call = this.peer.call(targetCameraId, dummyStream);
        
        call.on('stream', (remoteStream) => {
          console.log('[PeerJS Remote] Received live WebRTC stream!');
          if (this.onStreamReady) this.onStreamReady(remoteStream);
          if (this.onStatusChange) this.onStatusChange(true, 'LIVE WEBRTC STREAM');
        });
      });

      this.peer.on('error', (err) => {
        console.warn('[PeerJS Remote] Peer error:', err);
      });

    } catch (err) {
      console.error('[PeerJS Remote] Exception:', err);
    }
  }

  sendMotionAlert(intensity, snapshot) {
    const payload = {
      type: 'motion-alert',
      timestamp: new Date().toISOString(),
      intensity,
      snapshot
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }

    for (const conn of this.dataConnections) {
      if (conn.open) conn.send(payload);
    }
  }

  sendRemoteCommand(command, params = {}) {
    const payload = {
      type: 'remote-command',
      command,
      params
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }

    for (const conn of this.dataConnections) {
      if (conn.open) conn.send(payload);
    }
  }
}

window.remoteEngine = new RemoteEngine();
