/**
 * AegisCam Video & Audio Recorder Engine
 * Manages MediaRecorder stream capture, motion-activated recording timers, pre/post buffer cooldowns, and clip generation.
 */
class VideoRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;

    this.currentTrigger = 'manual'; // 'motion' | 'manual'
    this.recordingStartTime = 0;
    this.recordingTimer = null;
    this.cooldownTimer = null;

    // Config
    this.autoRecord = true;
    this.cooldownSeconds = 5;
    this.maxClipSeconds = 60;

    // Callbacks
    this.onStateChange = null;
    this.onClipSaved = null;
  }

  // Start video recording with combined video + audio stream
  startRecording(canvasStream, audioStream, trigger = 'manual') {
    if (this.isRecording) return;

    try {
      this.currentTrigger = trigger;
      this.recordedChunks = [];

      // Combine Canvas Video Track + Mic Audio Track
      const combinedTracks = [...canvasStream.getVideoTracks()];
      if (audioStream && audioStream.getAudioTracks().length > 0) {
        combinedTracks.push(audioStream.getAudioTracks()[0]);
      }

      const combinedStream = new MediaStream(combinedTracks);

      // MimeType fallback check (WebM VP9/VP8 or MP4)
      let options = { mimeType: 'video/webm;codecs=vp9,opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm;codecs=vp8,opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'video/webm' };
        }
      }

      this.mediaRecorder = new MediaRecorder(combinedStream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.saveRecording();
      };

      this.mediaRecorder.start(1000); // 1-second time slices
      this.isRecording = true;
      this.recordingStartTime = Date.now();

      console.log(`[Recorder] Recording started (${trigger})`);
      if (this.onStateChange) this.onStateChange(true, trigger, 0);

      // Start duration ticker timer
      this.recordingTimer = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        if (this.onStateChange) this.onStateChange(true, trigger, elapsedSec);

        // Auto split if exceeds max clip length
        if (elapsedSec >= this.maxClipSeconds) {
          console.log('[Recorder] Reached max clip length. Splitting clip...');
          this.stopRecording();
        }
      }, 1000);

    } catch (err) {
      console.error('[Recorder] Failed to start recording:', err);
      this.isRecording = false;
    }
  }

  // Handle Motion Event for Auto-recording
  handleMotionEvent(isMotion, canvasStream, audioStream) {
    if (!this.autoRecord) return;

    if (isMotion) {
      // Clear any pending cooldown timer if motion re-occurs
      if (this.cooldownTimer) {
        clearTimeout(this.cooldownTimer);
        this.cooldownTimer = null;
      }

      if (!this.isRecording) {
        this.startRecording(canvasStream, audioStream, 'motion');
      }
    } else {
      // Motion stopped: start cooldown buffer timer
      if (this.isRecording && this.currentTrigger === 'motion' && !this.cooldownTimer) {
        console.log(`[Recorder] Motion stopped. Cooldown timer started (${this.cooldownSeconds}s)...`);
        this.cooldownTimer = setTimeout(() => {
          console.log('[Recorder] Cooldown expired. Stopping auto-recording.');
          this.stopRecording();
          this.cooldownTimer = null;
        }, this.cooldownSeconds * 1000);
      }
    }
  }

  // Stop current recording
  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;

    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }

    this.mediaRecorder.stop();
    this.isRecording = false;
    console.log('[Recorder] Recording stopped');

    if (this.onStateChange) this.onStateChange(false, this.currentTrigger, 0);
  }

  // Process & save recording blob into IndexedDB
  async saveRecording() {
    if (this.recordedChunks.length === 0) return;

    const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
    const duration = Math.max(1, Math.round((Date.now() - this.recordingStartTime) / 1000));

    // Generate thumbnail from main CCTV Canvas
    const canvas = document.getElementById('cctvCanvas');
    let thumbnailDataUrl = null;
    if (canvas) {
      thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.6);
    }

    const clipRecord = {
      blob,
      thumbnail: thumbnailDataUrl,
      trigger: this.currentTrigger,
      duration,
      timestamp: new Date().toISOString()
    };

    try {
      const savedClip = await window.clipStorage.saveClip(clipRecord);
      console.log('[Recorder] Saved clip to IndexedDB:', savedClip.id);
      if (this.onClipSaved) this.onClipSaved(savedClip);
    } catch (err) {
      console.error('[Recorder] Error saving clip:', err);
    }

    this.recordedChunks = [];
  }

  // Take Instant Snapshot Photo
  takeSnapshot(canvas) {
    if (!canvas) return null;
    const dataUrl = canvas.toDataURL('image/png');
    
    // Create instant download link
    const link = document.createElement('a');
    link.download = `AegisCam_Snap_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    link.href = dataUrl;
    link.click();

    return dataUrl;
  }
}

window.videoRecorder = new VideoRecorder();
