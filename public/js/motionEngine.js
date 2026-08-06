/**
 * AegisCam Motion & Audio Detection Engine
 * High-speed canvas pixel difference analysis, object tracking bounding boxes, Web Audio noise metering, & siren synthesizer.
 */
class MotionEngine {
  constructor() {
    // Configuration Settings
    this.motionSensitivity = 15; // Trigger threshold (% of canvas motion)
    this.pixelDiffThreshold = 35; // Pixel color diff sensitivity (0-255)
    this.drawBoundingBoxes = true;
    this.nightVision = false;

    this.audioThreshold = 40; // Audio trigger threshold (%)
    this.alarmEnabled = true;
    this.sirenType = 'siren';

    // State Variables
    this.prevFrameData = null;
    this.currentMotionLevel = 0;
    this.currentAudioLevel = 0;
    this.isMotionActive = false;
    this.motionBoundingBox = null;
    this.historyGraph = new Array(60).fill(0); // 60 seconds history

    // Offscreen Processing Canvas (Low res for performance)
    this.procCanvas = document.createElement('canvas');
    this.procCanvas.width = 160;
    this.procCanvas.height = 120;
    this.procCtx = this.procCanvas.getContext('2d', { willReadFrequently: true });

    // Audio Analysis Setup
    this.audioCtx = null;
    this.analyser = null;
    this.audioSource = null;
    this.micDataArray = null;

    // Siren Audio Context
    this.sirenAudioCtx = null;
    this.sirenOsc = null;
    this.isSirenPlaying = false;

    // Callbacks
    this.onMotionDetected = null;
    this.onMotionStopped = null;
    this.onAudioAlert = null;
  }

  // Initialize Microphone Audio Analyzer
  initAudio(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;

      this.audioSource = this.audioCtx.createMediaStreamSource(stream);
      this.audioSource.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      this.micDataArray = new Uint8Array(bufferLength);
      console.log('[MotionEngine] Audio analyzer initialized');
    } catch (err) {
      console.warn('[MotionEngine] Could not initialize microphone analyzer:', err);
    }
  }

  // Process single video frame for motion & audio
  processFrame(videoEl, displayCanvas) {
    if (!videoEl || videoEl.readyState < 2) return;

    const displayCtx = displayCanvas.getContext('2d');
    const width = displayCanvas.width;
    const height = displayCanvas.height;

    // 1. Draw raw video onto main display canvas
    displayCtx.drawImage(videoEl, 0, 0, width, height);

    // Apply Night Vision Matrix filter if enabled
    if (this.nightVision) {
      this.applyNightVisionFilter(displayCtx, width, height);
    }

    // 2. Draw downscaled frame to offscreen processing canvas
    const pW = this.procCanvas.width;
    const pH = this.procCanvas.height;
    this.procCtx.drawImage(videoEl, 0, 0, pW, pH);

    const currentFrameData = this.procCtx.getImageData(0, 0, pW, pH);

    // 3. Motion Calculation (Pixel Diffing)
    if (this.prevFrameData) {
      let diffPixels = 0;
      const totalPixels = pW * pH;
      const curr = currentFrameData.data;
      const prev = this.prevFrameData.data;

      let minX = pW, minY = pH, maxX = 0, maxY = 0;

      for (let i = 0; i < curr.length; i += 4) {
        // Luminance difference
        const rDiff = Math.abs(curr[i] - prev[i]);
        const gDiff = Math.abs(curr[i + 1] - prev[i + 1]);
        const bDiff = Math.abs(curr[i + 2] - prev[i + 2]);

        const avgDiff = (rDiff + gDiff + bDiff) / 3;

        if (avgDiff > this.pixelDiffThreshold) {
          diffPixels++;
          const pxIndex = i / 4;
          const x = pxIndex % pW;
          const y = Math.floor(pxIndex / pW);

          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }

      this.currentMotionLevel = Math.min(100, Math.round((diffPixels / totalPixels) * 100 * 5));

      // Calculate Bounding Box on Display Canvas scale
      if (diffPixels > 10 && minX < maxX && minY < maxY) {
        const scaleX = width / pW;
        const scaleY = height / pH;
        this.motionBoundingBox = {
          x: minX * scaleX,
          y: minY * scaleY,
          w: (maxX - minX) * scaleX,
          h: (maxY - minY) * scaleY
        };
      } else {
        this.motionBoundingBox = null;
      }

      // Check motion trigger state
      const wasActive = this.isMotionActive;
      this.isMotionActive = this.currentMotionLevel >= this.motionSensitivity;

      if (!wasActive && this.isMotionActive) {
        if (this.onMotionDetected) this.onMotionDetected(this.currentMotionLevel);
        if (this.alarmEnabled) this.triggerSirenAlert();
      } else if (wasActive && !this.isMotionActive) {
        if (this.onMotionStopped) this.onMotionStopped();
      }
    }

    this.prevFrameData = currentFrameData;

    // 4. Process Audio Level
    if (this.analyser && this.micDataArray) {
      this.analyser.getByteFrequencyData(this.micDataArray);
      let sum = 0;
      for (let i = 0; i < this.micDataArray.length; i++) {
        sum += this.micDataArray[i];
      }
      const avg = sum / this.micDataArray.length;
      this.currentAudioLevel = Math.min(100, Math.round((avg / 128) * 100));

      if (this.currentAudioLevel >= this.audioThreshold) {
        if (this.onAudioAlert) this.onAudioAlert(this.currentAudioLevel);
      }
    }

    // 5. Draw Motion Bounding Box on HUD
    if (this.drawBoundingBoxes && this.motionBoundingBox && this.isMotionActive) {
      this.drawTargetBox(displayCtx, this.motionBoundingBox);
    }
  }

  // Draw HUD Target Box
  drawTargetBox(ctx, box) {
    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(box.x, box.y, box.w, box.h);

    // Corner Accents
    ctx.fillStyle = '#ef4444';
    const cSize = 6;
    ctx.fillRect(box.x - 2, box.y - 2, cSize, cSize);
    ctx.fillRect(box.x + box.w - 4, box.y - 2, cSize, cSize);
    ctx.fillRect(box.x - 2, box.y + box.h - 4, cSize, cSize);
    ctx.fillRect(box.x + box.w - 4, box.y + box.h - 4, cSize, cSize);

    // Motion Tag
    ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
    ctx.fillRect(box.x, box.y - 22, 110, 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px "Chakra Petch", monospace';
    ctx.fillText('TARGET DETECTED', box.x + 6, box.y - 8);

    ctx.restore();
  }

  // Night Vision Canvas Filter
  applyNightVisionFilter(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      // High contrast green tint
      data[i] = avg * 0.2;     // R
      data[i + 1] = avg * 1.4; // G (boost green)
      data[i + 2] = avg * 0.3; // B
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // Synthesize Siren Audio Alert (Web Audio API)
  triggerSirenAlert() {
    if (this.isSirenPlaying) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.sirenAudioCtx = new AudioCtx();
      const osc = this.sirenAudioCtx.createOscillator();
      const gain = this.sirenAudioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.sirenAudioCtx.destination);

      const now = this.sirenAudioCtx.currentTime;

      if (this.sirenType === 'siren') {
        // Police Siren Frequency Sweep
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(1200, now + 0.3);
        osc.frequency.linearRampToValueAtTime(600, now + 0.6);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

        osc.start(now);
        osc.stop(now + 0.6);
      } else if (this.sirenType === 'pulse') {
        // Cyber Beep Pulse
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

        osc.start(now);
        osc.stop(now + 0.2);
      } else {
        // Subtle Ping
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1046.5, now); // C6 note
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.start(now);
        osc.stop(now + 0.4);
      }

      this.isSirenPlaying = true;
      setTimeout(() => { this.isSirenPlaying = false; }, 600);

    } catch (err) {
      console.warn('[MotionEngine] Could not play siren audio:', err);
    }
  }

  // Draw 60s Motion History Line Graph
  drawHistoryGraph(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.clientWidth;
    const height = canvas.height = canvas.clientHeight;

    ctx.clearRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Push new motion level to history
    this.historyGraph.push(this.currentMotionLevel);
    if (this.historyGraph.length > 60) this.historyGraph.shift();

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;

    const step = width / (this.historyGraph.length - 1);
    for (let i = 0; i < this.historyGraph.length; i++) {
      const val = this.historyGraph[i];
      const x = i * step;
      const y = height - (val / 100) * height;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under graph
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.fillStyle = 'rgba(6, 182, 212, 0.15)';
    ctx.fill();
  }
}

window.motionEngine = new MotionEngine();
