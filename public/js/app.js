/**
 * AegisCam Master Application Orchestrator
 * Connects webcam stream, canvas HUD, motion engine, recorder, storage, UI controls, & global WebRTC remote view logic.
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[App] AegisCam initializing...');

  // Initialize Lucide icons
  if (window.lucide) {
    try { lucide.createIcons(); } catch(e) { console.warn('[Lucide]', e); }
  }

  // DOM Elements - Main Layout & Nav
  const mainNavTabs = document.getElementById('mainNavTabs');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const webcamVideo = document.getElementById('webcamVideo');
  const cctvCanvas = document.getElementById('cctvCanvas');
  const hudClock = document.getElementById('hudClock');
  const hudRes = document.getElementById('hudRes');
  const systemStatusBadge = document.getElementById('systemStatusBadge');
  const statusText = document.getElementById('statusText');
  const recordingStatusPill = document.getElementById('recordingStatusPill');
  const recTimeText = document.getElementById('recTimeText');

  // DOM Elements - Camera Device Selector
  const selectCamDevice = document.getElementById('selectCamDevice');
  const btnRefreshCamList = document.getElementById('btnRefreshCamList');

  // DOM Elements - Controls
  const btnToggleRecord = document.getElementById('btnToggleRecord');
  const recBtnLabel = document.getElementById('recBtnLabel');
  const btnSnapshot = document.getElementById('btnSnapshot');
  const btnNightVision = document.getElementById('btnNightVision');
  const btnTriggerSiren = document.getElementById('btnTriggerSiren');
  const btnAudioToggle = document.getElementById('btnAudioToggle');
  const audioBtnLabel = document.getElementById('audioBtnLabel');
  const motionAlertBanner = document.getElementById('motionAlertBanner');

  // DOM Elements - Meters & Stats
  const motionMeterFill = document.getElementById('motionMeterFill');
  const motionPercentVal = document.getElementById('motionPercentVal');
  const motionThresholdLine = document.getElementById('motionThresholdLine');
  const audioMeterFill = document.getElementById('audioMeterFill');
  const audioDbVal = document.getElementById('audioDbVal');
  const audioThresholdLine = document.getElementById('audioThresholdLine');
  const motionGraphCanvas = document.getElementById('motionGraphCanvas');
  const eventFeedList = document.getElementById('eventFeedList');
  const btnClearLogs = document.getElementById('btnClearLogs');

  // DOM Elements - Settings
  const inputMotionSensitivity = document.getElementById('inputMotionSensitivity');
  const valMotionSensitivity = document.getElementById('valMotionSensitivity');
  const inputPixelDiffThreshold = document.getElementById('inputPixelDiffThreshold');
  const valPixelDiffThreshold = document.getElementById('valPixelDiffThreshold');
  const chkDrawBoxes = document.getElementById('chkDrawBoxes');
  const chkAutoRecord = document.getElementById('chkAutoRecord');
  const inputRecordCooldown = document.getElementById('inputRecordCooldown');
  const valRecordCooldown = document.getElementById('valRecordCooldown');
  const inputMaxClipLen = document.getElementById('inputMaxClipLen');
  const valMaxClipLen = document.getElementById('valMaxClipLen');
  const chkAudioAlarm = document.getElementById('chkAudioAlarm');
  const inputAudioThreshold = document.getElementById('inputAudioThreshold');
  const valAudioThreshold = document.getElementById('valAudioThreshold');
  const selectSirenSound = document.getElementById('selectSirenSound');

  // DOM Elements - Clips
  const clipsGrid = document.getElementById('clipsGrid');
  const clipCountBadge = document.getElementById('clipCountBadge');
  const storageStatsText = document.getElementById('storageStatsText');
  const btnRefreshClips = document.getElementById('btnRefreshClips');
  const btnClearAllClips = document.getElementById('btnClearAllClips');

  // DOM Elements - Player Modal
  const playerModal = document.getElementById('playerModal');
  const playerTitle = document.getElementById('playerTitle');
  const clipVideoPlayer = document.getElementById('clipVideoPlayer');
  const btnClosePlayer = document.getElementById('btnClosePlayer');
  const playerTrigger = document.getElementById('playerTrigger');
  const playerTime = document.getElementById('playerTime');
  const playerDuration = document.getElementById('playerDuration');
  const playerSize = document.getElementById('playerSize');
  const btnDownloadClip = document.getElementById('btnDownloadClip');
  const btnDeleteClipModal = document.getElementById('btnDeleteClipModal');

  // DOM Elements - Remote Access & Mode
  const imgQrCode = document.getElementById('imgQrCode');
  const qrLoading = document.getElementById('qrLoading');
  const remoteUrlText = document.getElementById('remoteUrlText');
  const kfadUrlText = document.getElementById('kfadUrlText');
  const btnCopyRemoteUrl = document.getElementById('btnCopyRemoteUrl');
  const btnCopyKfadUrl = document.getElementById('btnCopyKfadUrl');
  const displayGlobalCamId = document.getElementById('displayGlobalCamId');
  const remoteListStatusText = document.getElementById('remoteListStatusText');

  // Remote Standalone Elements
  const pinModal = document.getElementById('pinModal');
  const camIdInput = document.getElementById('camIdInput');
  const btnConnectRemote = document.getElementById('btnConnectRemote');
  const pinError = document.getElementById('pinError');
  const viewRemoteClient = document.getElementById('viewRemoteClient');
  const remoteVideoPlayer = document.getElementById('remoteVideoPlayer');
  const remoteSnapshotCanvas = document.getElementById('remoteSnapshotCanvas');
  const remoteStreamPlaceholder = document.getElementById('remoteStreamPlaceholder');
  const remoteStatusText = document.getElementById('remoteStatusText');
  const btnUnmuteAudio = document.getElementById('btnUnmuteAudio');
  const btnRemoteSiren = document.getElementById('btnRemoteSiren');
  const btnRemoteSnap = document.getElementById('btnRemoteSnap');
  const remoteAlertList = document.getElementById('remoteAlertList');

  // Application State Variables
  let webcamStream = null;
  let audioMuted = false;
  let selectedClipId = null;

  const DEFAULT_CAM_ID = '123456cam123456cam';

  // --- STRICT URL MODE DISPATCHER ---
  // Only enter Remote View mode if mode=remote or view=remote is explicitly passed in URL query
  const urlParams = new URLSearchParams(window.location.search);
  const isRemoteMode = urlParams.get('mode') === 'remote' || urlParams.get('view') === 'remote';
  const targetCamId = urlParams.get('cam') || DEFAULT_CAM_ID;

  if (isRemoteMode) {
    console.log('[App] Starting in Standalone Remote Viewer Mode');
    setupRemoteViewerMode(targetCamId);
    return;
  }

  // --- HOST CAMERA MODE INITIALIZATION ---
  console.log('[App] Starting in Camera Host Mode');
  await initCameraHost();

  async function initCameraHost(selectedDeviceId = null) {
    logEvent('Initializing camera host system...', 'system');
    
    // Stop existing stream if changing camera
    if (webcamStream) {
      webcamStream.getTracks().forEach(t => t.stop());
    }

    let stream = null;

    const constraintLevels = [
      selectedDeviceId ? { video: { deviceId: { exact: selectedDeviceId } }, audio: true } :
      { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true },

      { video: true, audio: true },
      { video: true, audio: false }
    ];

    let lastErr = null;
    for (const constraints of constraintLevels) {
      try {
        console.log('[App] Requesting getUserMedia:', constraints);
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream) break;
      } catch (err) {
        console.warn('[App] Constraint level failed:', err);
        lastErr = err;
      }
    }

    if (!stream) {
      console.error('[App] Camera access failed:', lastErr);
      let errorMsg = 'CAMERA NOT FOUND';
      if (lastErr && lastErr.name === 'NotAllowedError') errorMsg = 'CAMERA PERMISSION DENIED';
      if (lastErr && lastErr.name === 'NotFoundError') errorMsg = 'NO WEBCAM HARDWARE DETECTED';
      if (lastErr && lastErr.name === 'NotReadableError') errorMsg = 'CAMERA IN USE BY ANOTHER APP';

      if (statusText) statusText.textContent = errorMsg;
      if (systemStatusBadge) systemStatusBadge.className = 'status-pill status-rec';
      logEvent(`Camera error: ${errorMsg}. Please plug in camera or grant permission.`, 'motion');
      
      showCameraErrorOverlay(errorMsg);
      await populateCameraDevicesList();
      return;
    }

    webcamStream = stream;
    if (webcamVideo) {
      webcamVideo.srcObject = webcamStream;
      webcamVideo.onloadedmetadata = () => {
        if (cctvCanvas) {
          cctvCanvas.width = webcamVideo.videoWidth || 1280;
          cctvCanvas.height = webcamVideo.videoHeight || 720;
        }
        if (hudRes) hudRes.textContent = `${cctvCanvas.width}x${cctvCanvas.height} @ 30fps`;
        console.log(`[App] Camera metadata loaded: ${cctvCanvas.width}x${cctvCanvas.height}`);
      };

      try {
        await webcamVideo.play();
      } catch (e) {
        console.warn('[App] Play video warning:', e);
      }
    }

    if (cctvCanvas) {
      cctvCanvas.width = webcamVideo.videoWidth || 1280;
      cctvCanvas.height = webcamVideo.videoHeight || 720;
    }
    if (hudRes) hudRes.textContent = `${cctvCanvas ? cctvCanvas.width : 1280}x${cctvCanvas ? cctvCanvas.height : 720} @ 30fps`;

    if (systemStatusBadge) systemStatusBadge.className = 'status-pill status-ready';
    if (statusText) statusText.textContent = 'GLOBAL ONLINE';

    if (webcamStream.getAudioTracks().length > 0) {
      window.motionEngine.initAudio(webcamStream);
    } else {
      if (audioBtnLabel) audioBtnLabel.textContent = 'NO MIC';
      if (btnAudioToggle) btnAudioToggle.disabled = true;
    }

    logEvent('Camera stream acquired successfully!', 'system');

    await populateCameraDevicesList();

    if (window.clipStorage) {
      await window.clipStorage.init();
      await updateClipsUI();
    }

    if (window.remoteEngine) {
      window.remoteEngine.initHost(DEFAULT_CAM_ID);
      loadRemoteAccessInfo();

      window.remoteEngine.onStatusChange = (online, msg) => {
        if (statusText) statusText.textContent = msg;
        if (remoteListStatusText) remoteListStatusText.textContent = msg;
      };

      window.remoteEngine.onRemoteCommand = (cmd, params) => {
        logEvent(`Remote Command Received: ${cmd}`, 'motion');
        if (cmd === 'trigger-alarm' && window.motionEngine) {
          window.motionEngine.triggerSirenAlert();
        } else if (cmd === 'take-snapshot' && window.recorder) {
          window.recorder.takeSnapshot(cctvCanvas);
        }
      };
    }

    if (window.motionEngine) {
      window.motionEngine.onMotionDetected = (level) => {
        if (motionAlertBanner) motionAlertBanner.classList.remove('hidden');
        logEvent(`Motion detected! (Intensity: ${level}%)`, 'motion');
        
        if (cctvCanvas && window.remoteEngine) {
          const snap = cctvCanvas.toDataURL('image/jpeg', 0.4);
          window.remoteEngine.sendMotionAlert(level, snap);
        }

        if (cctvCanvas && window.recorder) {
          const canvasStream = cctvCanvas.captureStream(30);
          window.recorder.handleMotionEvent(true, canvasStream, webcamStream);
        }
      };

      window.motionEngine.onMotionStopped = () => {
        if (motionAlertBanner) motionAlertBanner.classList.add('hidden');
        logEvent('Motion activity ceased', 'system');

        if (cctvCanvas && window.recorder) {
          const canvasStream = cctvCanvas.captureStream(30);
          window.recorder.handleMotionEvent(false, canvasStream, webcamStream);
        }
      };
    }

    if (window.recorder) {
      window.recorder.onStateChange = (isRec, trigger, elapsedSec) => {
        if (isRec) {
          if (recordingStatusPill) recordingStatusPill.classList.remove('hidden');
          if (recTimeText) recTimeText.textContent = `REC ${formatTimer(elapsedSec)}`;
          if (btnToggleRecord) btnToggleRecord.classList.add('active');
          if (recBtnLabel) recBtnLabel.textContent = 'STOP REC';
          if (elapsedSec === 0) logEvent(`Started recording (${trigger} mode)`, 'rec');
        } else {
          if (recordingStatusPill) recordingStatusPill.classList.add('hidden');
          if (btnToggleRecord) btnToggleRecord.classList.remove('active');
          if (recBtnLabel) recBtnLabel.textContent = 'RECORD';
          logEvent('Stopped recording. Processing clip...', 'rec');
        }
      };

      window.recorder.onClipSaved = (savedClip) => {
        logEvent(`Clip saved! (${savedClip.duration}s, ${(savedClip.size / 1048576).toFixed(1)}MB)`, 'rec');
        updateClipsUI();
      };
    }

    startProcessingLoop();
  }

  async function populateCameraDevicesList() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      console.log('[App] Connected video devices:', videoDevices);

      if (selectCamDevice) {
        if (videoDevices.length === 0) {
          selectCamDevice.innerHTML = '<option value="">No Camera Found</option>';
        } else {
          selectCamDevice.innerHTML = videoDevices.map((d, i) => {
            const label = d.label ? d.label : `Webcam ${i + 1}`;
            return `<option value="${d.deviceId}">${label}</option>`;
          }).join('');
        }
      }
    } catch (e) {
      console.warn('[App] Could not enumerate camera devices:', e);
    }
  }

  if (selectCamDevice) {
    selectCamDevice.addEventListener('change', (e) => {
      if (e.target.value) {
        logEvent(`Switching camera device: ${e.target.value}`, 'system');
        initCameraHost(e.target.value);
      }
    });
  }

  if (btnRefreshCamList) {
    btnRefreshCamList.addEventListener('click', async () => {
      await populateCameraDevicesList();
      logEvent('Camera device list refreshed', 'system');
    });
  }

  function showCameraErrorOverlay(errorMsg) {
    if (!cctvCanvas) return;
    const ctx = cctvCanvas.getContext('2d');
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, cctvCanvas.width, cctvCanvas.height);

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 24px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📷 ' + errorMsg, cctvCanvas.width / 2, cctvCanvas.height / 2 - 20);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText('Ensure webcam is plugged in & browser permission is allowed.', cctvCanvas.width / 2, cctvCanvas.height / 2 + 20);
    ctx.fillText('Click anywhere on screen to retry camera detection.', cctvCanvas.width / 2, cctvCanvas.height / 2 + 50);

    cctvCanvas.style.cursor = 'pointer';
    cctvCanvas.onclick = () => {
      initCameraHost();
    };
  }

  function startProcessingLoop() {
    function loop() {
      if (webcamStream && webcamVideo && webcamVideo.readyState >= 2 && window.motionEngine) {
        window.motionEngine.processFrame(webcamVideo, cctvCanvas);
      }

      if (hudClock) {
        const now = new Date();
        hudClock.textContent = now.toISOString().replace('T', ' ').substring(0, 19);
      }

      if (window.motionEngine) {
        const motionLevel = window.motionEngine.currentMotionLevel;
        const audioLevel = window.motionEngine.currentAudioLevel;

        if (motionMeterFill) motionMeterFill.style.width = `${motionLevel}%`;
        if (motionPercentVal) motionPercentVal.textContent = `${motionLevel}%`;

        if (audioMeterFill) audioMeterFill.style.width = `${audioLevel}%`;
        if (audioDbVal) audioDbVal.textContent = `${audioLevel}%`;

        if (motionGraphCanvas) window.motionEngine.drawHistoryGraph(motionGraphCanvas);
      }

      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  // --- UI BUTTON LISTENERS (WITH NULL GUARDS) ---

  if (mainNavTabs) {
    mainNavTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn');
      if (!btn) return;
      const targetTab = btn.getAttribute('data-tab');

      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      tabPanes.forEach(pane => {
        if (pane.id === targetTab) pane.classList.add('active');
        else pane.classList.remove('active');
      });

      if (targetTab === 'tabClips') updateClipsUI();
    });
  }

  if (btnToggleRecord) {
    btnToggleRecord.addEventListener('click', () => {
      if (!window.recorder) return;
      if (window.recorder.isRecording) {
        window.recorder.stopRecording();
      } else if (cctvCanvas) {
        const canvasStream = cctvCanvas.captureStream(30);
        window.recorder.startRecording(canvasStream, webcamStream, 'manual');
      }
    });
  }

  if (btnSnapshot) {
    btnSnapshot.addEventListener('click', () => {
      if (window.recorder && cctvCanvas) {
        const snapUrl = window.recorder.takeSnapshot(cctvCanvas);
        if (snapUrl) logEvent('Snapshot photo saved', 'system');
      }
    });
  }

  if (btnNightVision) {
    btnNightVision.addEventListener('click', () => {
      if (window.motionEngine) {
        window.motionEngine.nightVision = !window.motionEngine.nightVision;
        btnNightVision.classList.toggle('active', window.motionEngine.nightVision);
        logEvent(`Night Vision ${window.motionEngine.nightVision ? 'ENABLED' : 'DISABLED'}`, 'system');
      }
    });
  }

  if (btnTriggerSiren) {
    btnTriggerSiren.addEventListener('click', () => {
      if (window.motionEngine) {
        window.motionEngine.triggerSirenAlert();
        logEvent('Siren Alarm Manually Triggered!', 'motion');
      }
    });
  }

  if (btnAudioToggle) {
    btnAudioToggle.addEventListener('click', () => {
      audioMuted = !audioMuted;
      if (webcamStream) {
        webcamStream.getAudioTracks().forEach(t => t.enabled = !audioMuted);
      }
      if (audioBtnLabel) audioBtnLabel.textContent = audioMuted ? 'MIC OFF' : 'MIC ON';
      btnAudioToggle.classList.toggle('active', audioMuted);
      logEvent(`Microphone ${audioMuted ? 'Muted' : 'Unmuted'}`, 'system');
    });
  }

  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', () => {
      if (eventFeedList) eventFeedList.innerHTML = '';
      logEvent('Event log cleared', 'system');
    });
  }

  // Settings Controls
  if (inputMotionSensitivity) {
    inputMotionSensitivity.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      if (window.motionEngine) window.motionEngine.motionSensitivity = val;
      if (valMotionSensitivity) valMotionSensitivity.textContent = `${val}%`;
      if (motionThresholdLine) motionThresholdLine.style.left = `${val}%`;
    });
  }

  if (inputPixelDiffThreshold) {
    inputPixelDiffThreshold.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      if (window.motionEngine) window.motionEngine.pixelDiffThreshold = val;
      if (valPixelDiffThreshold) valPixelDiffThreshold.textContent = `${val}`;
    });
  }

  if (chkDrawBoxes) {
    chkDrawBoxes.addEventListener('change', (e) => {
      if (window.motionEngine) window.motionEngine.drawBoundingBoxes = e.target.checked;
    });
  }

  if (chkAutoRecord) {
    chkAutoRecord.addEventListener('change', (e) => {
      if (window.recorder) window.recorder.autoRecord = e.target.checked;
    });
  }

  if (inputRecordCooldown) {
    inputRecordCooldown.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      if (window.recorder) window.recorder.cooldownSeconds = val;
      if (valRecordCooldown) valRecordCooldown.textContent = `${val}s`;
    });
  }

  if (inputMaxClipLen) {
    inputMaxClipLen.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      if (window.recorder) window.recorder.maxClipSeconds = val;
      if (valMaxClipLen) valMaxClipLen.textContent = `${val}s`;
    });
  }

  if (chkAudioAlarm) {
    chkAudioAlarm.addEventListener('change', (e) => {
      if (window.motionEngine) window.motionEngine.alarmEnabled = e.target.checked;
    });
  }

  if (inputAudioThreshold) {
    inputAudioThreshold.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      if (window.motionEngine) window.motionEngine.audioThreshold = val;
      if (valAudioThreshold) valAudioThreshold.textContent = `${val}%`;
      if (audioThresholdLine) audioThresholdLine.style.left = `${val}%`;
    });
  }

  if (selectSirenSound) {
    selectSirenSound.addEventListener('change', (e) => {
      if (window.motionEngine) window.motionEngine.sirenType = e.target.value;
    });
  }

  // --- CLIPS LIBRARY & PLAYER LOGIC ---

  async function updateClipsUI() {
    if (!window.clipStorage || !clipsGrid) return;
    const clips = await window.clipStorage.getAllClips();
    const stats = await window.clipStorage.getStorageUsage();

    if (clipCountBadge) clipCountBadge.textContent = stats.count;
    if (storageStatsText) storageStatsText.textContent = `${stats.count} clips (${stats.formattedSize} used)`;

    if (clips.length === 0) {
      clipsGrid.innerHTML = `
        <div class="empty-state">
          <i data-lucide="film"></i>
          <h3>No Security Recordings Yet</h3>
          <p>Clips will automatically appear here when motion is detected or when you hit Record.</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    clipsGrid.innerHTML = clips.map(clip => `
      <div class="clip-card" data-id="${clip.id}">
        <div class="clip-thumb-box">
          <img src="${clip.thumbnail || ''}" class="clip-thumb-img" alt="Thumbnail">
          <span class="clip-badge ${clip.trigger}">${clip.trigger}</span>
          <span class="clip-duration-tag">${formatTimer(clip.duration)}</span>
        </div>
        <div class="clip-card-body">
          <div class="clip-card-title">${new Date(clip.timestamp).toLocaleString()}</div>
          <div class="clip-card-meta">${(clip.size / 1048576).toFixed(1)} MB • WebM Video</div>
          <div class="clip-card-actions">
            <button class="btn btn-primary btn-play" data-id="${clip.id}"><i data-lucide="play"></i> Play</button>
            <button class="btn btn-secondary btn-download" data-id="${clip.id}"><i data-lucide="download"></i></button>
            <button class="btn btn-danger btn-delete" data-id="${clip.id}"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
      </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
  }

  if (clipsGrid) {
    clipsGrid.addEventListener('click', async (e) => {
      const btnPlay = e.target.closest('.btn-play');
      const btnDownload = e.target.closest('.btn-download');
      const btnDelete = e.target.closest('.btn-delete');

      if (btnPlay) {
        const clipId = btnPlay.getAttribute('data-id');
        await openClipPlayer(clipId);
      } else if (btnDownload) {
        const clipId = btnDownload.getAttribute('data-id');
        const clip = await window.clipStorage.getClipById(clipId);
        if (clip) downloadBlob(clip.blob, `AegisCam_${clip.id}.webm`);
      } else if (btnDelete) {
        const clipId = btnDelete.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this recording?')) {
          await window.clipStorage.deleteClip(clipId);
          await updateClipsUI();
        }
      }
    });
  }

  if (btnRefreshClips) btnRefreshClips.addEventListener('click', updateClipsUI);

  if (btnClearAllClips) {
    btnClearAllClips.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete ALL saved clips from storage?')) {
        await window.clipStorage.deleteAllClips();
        await updateClipsUI();
      }
    });
  }

  async function openClipPlayer(clipId) {
    if (!window.clipStorage) return;
    const clip = await window.clipStorage.getClipById(clipId);
    if (!clip) return;

    selectedClipId = clipId;
    const url = URL.createObjectURL(clip.blob);
    if (clipVideoPlayer) clipVideoPlayer.src = url;
    
    if (playerTrigger) {
      playerTrigger.textContent = clip.trigger.toUpperCase();
      playerTrigger.className = `badge ${clip.trigger}`;
    }
    if (playerTime) playerTime.textContent = new Date(clip.timestamp).toLocaleString();
    if (playerDuration) playerDuration.textContent = formatTimer(clip.duration);
    if (playerSize) playerSize.textContent = (clip.size / 1048576).toFixed(1) + ' MB';

    if (btnDownloadClip) {
      btnDownloadClip.href = url;
      btnDownloadClip.download = `AegisCam_${clip.id}.webm`;
    }

    if (playerModal) playerModal.classList.remove('hidden');
  }

  if (btnClosePlayer) {
    btnClosePlayer.addEventListener('click', () => {
      if (playerModal) playerModal.classList.add('hidden');
      if (clipVideoPlayer) {
        clipVideoPlayer.pause();
        clipVideoPlayer.src = '';
      }
    });
  }

  if (btnDeleteClipModal) {
    btnDeleteClipModal.addEventListener('click', async () => {
      if (selectedClipId && confirm('Delete this clip?')) {
        await window.clipStorage.deleteClip(selectedClipId);
        if (playerModal) playerModal.classList.add('hidden');
        if (clipVideoPlayer) clipVideoPlayer.pause();
        await updateClipsUI();
      }
    });
  }

  // --- REMOTE ACCESS & INTERNET STREAMING LOGIC ---

  async function loadRemoteAccessInfo() {
    if (!window.remoteEngine) return;
    const info = await window.remoteEngine.fetchServerInfo();
    const kfadLink = `https://kfadapps.com/?cam=${DEFAULT_CAM_ID}`;
    const directLink = info ? info.remoteUrl + `&cam=${DEFAULT_CAM_ID}` : kfadLink;

    if (kfadUrlText) kfadUrlText.textContent = kfadLink;
    if (remoteUrlText) remoteUrlText.textContent = directLink;
    if (displayGlobalCamId) displayGlobalCamId.textContent = DEFAULT_CAM_ID;

    try {
      const qrRes = await fetch('/api/qrcode');
      const qrData = await qrRes.json();
      if (imgQrCode) imgQrCode.src = qrData.qrDataUrl;
      if (qrLoading) qrLoading.style.display = 'none';
    } catch (err) {
      if (qrLoading) qrLoading.textContent = 'QR Code Ready';
    }
  }

  if (btnCopyKfadUrl) {
    btnCopyKfadUrl.addEventListener('click', () => {
      if (kfadUrlText) {
        navigator.clipboard.writeText(kfadUrlText.textContent);
        alert('Website stream link copied to clipboard!');
      }
    });
  }

  if (btnCopyRemoteUrl) {
    btnCopyRemoteUrl.addEventListener('click', () => {
      if (remoteUrlText) {
        navigator.clipboard.writeText(remoteUrlText.textContent);
        alert('Direct stream link copied to clipboard!');
      }
    });
  }

  // --- REMOTE VIEWER STANDALONE MODE ---
  function setupRemoteViewerMode(camId) {
    const appHeader = document.querySelector('.app-header');
    const appContent = document.querySelector('.app-content');
    if (appHeader) appHeader.style.display = 'none';
    if (appContent) appContent.style.padding = '0';
    document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
    
    if (viewRemoteClient) viewRemoteClient.classList.remove('hidden');
    if (pinModal) pinModal.classList.remove('hidden');
    if (camId && camIdInput) camIdInput.value = camId;

    if (btnConnectRemote) {
      btnConnectRemote.addEventListener('click', () => {
        const selectedCamId = camIdInput ? camIdInput.value.trim() : DEFAULT_CAM_ID;
        if (!selectedCamId) {
          if (pinError) {
            pinError.textContent = 'Please enter a Camera ID.';
            pinError.classList.remove('hidden');
          }
          return;
        }

        btnConnectRemote.disabled = true;
        btnConnectRemote.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Connecting to Camera...';
        if (pinError) pinError.classList.add('hidden');
        if (window.lucide) lucide.createIcons();

        if (window.remoteEngine) {
          window.remoteEngine.onStatusChange = (online, msg) => {
            if (remoteStatusText) remoteStatusText.textContent = msg.toUpperCase();
            if (online) {
              if (pinModal) pinModal.classList.add('hidden');
              if (remoteStreamPlaceholder) remoteStreamPlaceholder.style.display = 'none';
              btnConnectRemote.disabled = false;
              btnConnectRemote.innerHTML = '<i data-lucide="wifi"></i> Connect Global Camera Stream';
              if (window.lucide) lucide.createIcons();
            }
          };

          window.remoteEngine.onError = (errMsg) => {
            if (pinError) {
              pinError.textContent = errMsg;
              pinError.classList.remove('hidden');
            }
            btnConnectRemote.disabled = false;
            btnConnectRemote.innerHTML = '<i data-lucide="wifi"></i> Retry Connection';
            if (window.lucide) lucide.createIcons();
          };

          window.remoteEngine.onStreamReady = (stream) => {
            console.log('[App Remote] WebRTC stream received!');
            if (remoteVideoPlayer) {
              remoteVideoPlayer.srcObject = stream;
              remoteVideoPlayer.muted = true;
              remoteVideoPlayer.play().then(() => {
                if (remoteSnapshotCanvas) remoteSnapshotCanvas.style.display = 'none';
                remoteVideoPlayer.style.display = 'block';
                if (remoteStreamPlaceholder) remoteStreamPlaceholder.style.display = 'none';
                if (pinModal) pinModal.classList.add('hidden');
              }).catch(err => console.warn('[App Remote] Video play error:', err));
            }
            addRemoteAlertLog('CONNECTED TO WEBRTC VIDEO STREAM!');
          };

          window.remoteEngine.onFrameReceived = (frameImgData) => {
            if (remoteSnapshotCanvas) {
              remoteSnapshotCanvas.src = frameImgData;
              remoteSnapshotCanvas.style.display = 'block';
              if (remoteStreamPlaceholder) remoteStreamPlaceholder.style.display = 'none';
              if (pinModal) pinModal.classList.add('hidden');
            }
          };

          window.remoteEngine.onRemoteAlert = (alertData) => {
            addRemoteAlertLog(`MOTION ALERT DETECTED! (Intensity: ${alertData.intensity}%)`);
          };

          window.remoteEngine.initRemote(selectedCamId);
        }
      });
    }

    if (btnUnmuteAudio) {
      btnUnmuteAudio.addEventListener('click', () => {
        if (remoteVideoPlayer) {
          remoteVideoPlayer.muted = !remoteVideoPlayer.muted;
          btnUnmuteAudio.innerHTML = remoteVideoPlayer.muted ? 
            '<i data-lucide="volume-x"></i> Unmute Sound' : 
            '<i data-lucide="volume-2"></i> Mute Sound';
          if (window.lucide) lucide.createIcons();
        }
      });
    }

    if (btnRemoteSiren) {
      btnRemoteSiren.addEventListener('click', () => {
        if (window.remoteEngine) {
          window.remoteEngine.sendRemoteCommand('trigger-alarm');
          addRemoteAlertLog('Sent Siren Command to Camera Host');
        }
      });
    }

    if (btnRemoteSnap) {
      btnRemoteSnap.addEventListener('click', () => {
        if (window.remoteEngine) {
          window.remoteEngine.sendRemoteCommand('take-snapshot');
          addRemoteAlertLog('Sent Snapshot Command to Camera Host');
        }
      });
    }
  }

  function addRemoteAlertLog(text) {
    if (!remoteAlertList) return;
    const div = document.createElement('div');
    div.className = 'alert-item info';
    div.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    remoteAlertList.prepend(div);
  }

  // --- HELPER FUNCTIONS ---
  function logEvent(msg, type = 'system') {
    if (!eventFeedList) return;
    const item = document.createElement('div');
    item.className = `event-item ${type}`;
    let icon = 'info';
    if (type === 'motion') icon = 'alert-triangle';
    if (type === 'rec') icon = 'disc';

    item.innerHTML = `
      <i data-lucide="${icon}"></i>
      <div class="event-details">
        <span class="event-msg">${msg}</span>
        <span class="event-time">${new Date().toLocaleTimeString()}</span>
      </div>
    `;
    eventFeedList.prepend(item);
    if (window.lucide) lucide.createIcons();
  }

  function formatTimer(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
});
