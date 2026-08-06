const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DEFAULT_CAM_ID = '123456cam123456cam';
let securityPin = Math.floor(1000 + Math.random() * 9000).toString();

// Utility to find local IPv4 address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && !alias.internal && alias.address !== '127.0.0.1') {
        return alias.address;
      }
    }
  }
  return 'localhost';
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Latest live camera frame cache for instant viewer loading
let latestFrameCache = null;

// Get local & global network server info
app.get('/api/info', (req, res) => {
  const localIp = getLocalIpAddress();
  const remoteUrl = `http://${localIp}:${PORT}/?mode=remote&cam=${DEFAULT_CAM_ID}`;
  const kfadUrl = `https://kfadapps.com/?cam=${DEFAULT_CAM_ID}`;
  res.json({
    localIp,
    port: PORT,
    securityPin,
    camId: DEFAULT_CAM_ID,
    remoteUrl,
    kfadUrl,
    hasHost: clients.hosts.size > 0,
    hostname: os.hostname()
  });
});

// Latest frame snapshot endpoint (HTTP fallback)
app.get('/api/stream/latest.jpg', (req, res) => {
  if (latestFrameCache) {
    const base64Data = latestFrameCache.replace(/^data:image\/jpeg;base64,/, "");
    const imgBuffer = Buffer.from(base64Data, 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': imgBuffer.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(imgBuffer);
  } else {
    res.status(404).send('Camera stream offline');
  }
});

// Generate QR code for internet remote viewing link
app.get('/api/qrcode', async (req, res) => {
  const kfadUrl = `https://kfadapps.com/?cam=${DEFAULT_CAM_ID}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(kfadUrl, {
      margin: 2,
      color: {
        dark: '#00ffcc',
        light: '#0b1120'
      },
      width: 280
    });
    res.json({ qrDataUrl, remoteUrl: kfadUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// WebSocket Clients Management
const clients = {
  hosts: new Set(),
  remotes: new Set()
};

wss.on('connection', (ws) => {
  ws.clientRole = null;
  ws.authenticated = false;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'register-host':
          ws.clientRole = 'host';
          ws.authenticated = true;
          clients.hosts.add(ws);
          console.log('[WS] Camera Host registered');
          ws.send(JSON.stringify({ type: 'registered', role: 'host' }));
          broadcastToRemotes({ type: 'host-status', online: true });
          break;

        case 'register-remote':
          ws.clientRole = 'remote';
          ws.authenticated = true;
          clients.remotes.add(ws);
          console.log('[WS] Remote viewer registered');
          ws.send(JSON.stringify({ 
            type: 'registered', 
            role: 'remote', 
            hostOnline: clients.hosts.size > 0 
          }));
          broadcastToHosts({ type: 'remote-connected' });

          // Send cached frame immediately if available
          if (latestFrameCache) {
            ws.send(JSON.stringify({ type: 'stream-frame', frame: latestFrameCache }));
          }
          break;

        // High-Speed Server Frame Broadcast from Host -> All Remotes
        case 'stream-frame':
          if (ws.clientRole === 'host' && data.frame) {
            latestFrameCache = data.frame;
            broadcastToRemotes({ type: 'stream-frame', frame: data.frame });
          }
          break;

        case 'sdp-offer':
        case 'sdp-answer':
        case 'ice-candidate':
          if (ws.clientRole === 'host') {
            broadcastToRemotes(data);
          } else if (ws.clientRole === 'remote') {
            broadcastToHosts(data);
          }
          break;

        case 'motion-alert':
          if (ws.clientRole === 'host') {
            broadcastToRemotes({
              type: 'motion-alert',
              timestamp: data.timestamp || new Date().toISOString(),
              intensity: data.intensity,
              snapshot: data.snapshot
            });
          }
          break;

        case 'remote-command':
          if (ws.clientRole === 'remote') {
            broadcastToHosts({
              type: 'remote-command',
              command: data.command,
              params: data.params
            });
          }
          break;

        default:
          break;
      }
    } catch (err) {
      console.error('[WS] Error handling message:', err);
    }
  });

  ws.on('close', () => {
    if (ws.clientRole === 'host') {
      clients.hosts.delete(ws);
      console.log('[WS] Camera Host disconnected');
      broadcastToRemotes({ type: 'host-status', online: false });
    } else if (ws.clientRole === 'remote') {
      clients.remotes.delete(ws);
      console.log('[WS] Remote viewer disconnected');
    }
  });
});

function broadcastToRemotes(data) {
  const payload = JSON.stringify(data);
  for (const client of clients.remotes) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function broadcastToHosts(data) {
  const payload = JSON.stringify(data);
  for (const client of clients.hosts) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

server.listen(PORT, () => {
  const localIp = getLocalIpAddress();
  console.log(`\n======================================================`);
  console.log(`  AEGISCAM GLOBAL SECURITY SYSTEM RUNNING`);
  console.log(`  Camera Host Access:     http://localhost:${PORT}`);
  console.log(`  Website Remote Access:  https://kfadapps.com/?cam=${DEFAULT_CAM_ID}`);
  console.log(`  Global Camera ID:       ${DEFAULT_CAM_ID}`);
  console.log(`======================================================\n`);
});
