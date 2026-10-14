/*
 * Microphone Recorder — TurboWarp extension
 *
 * CUSTOMIZATION GUIDE
 * ------------------
 * Start here when modifying this extension:
 *   CONFIG              Colors, overlay appearance, and recording options.
 *   getInfo()           Block labels and extension metadata.
 *   startRecording()    Microphone permission and recording setup.
 *   stopRecording()     Finalize a recording and save it for playback.
 *   playLastRecording() Playback behavior.
 *   addStageOverlay()   Recording status overlay.
 *
 * Keep each responsibility in its own method where possible. This makes the
 * file easier for people and AI coding tools to understand and safely edit.
 */
(function (Scratch) {
  'use strict';

  // === CONFIG: safe, centralized customization points ======================
  const CONFIG = {
    extensionName: 'Microphone Recorder',
    extensionColor: '#ff0000',
    extensionColorDark: '#D10000',
    extensionColorDarker: '#A30000',

    // A recording duration limit is not enforced. This only controls the
    // visual scale of the overlay meter; set to 0 to disable the meter.
    overlayMeterSeconds: 60,
    overlayTop: '40px',
    overlayZIndex: '9999',
    overlayBackground: 'rgba(255, 0, 0, 0.85)',
    overlayMeterBackground: '#a30000',
    overlayMeterForeground: '#ff0000',

    // Prefer browser-supported formats instead of assuming WebM is available.
    preferredMimeTypes: [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ]
  };

  class MicRecorder {
    constructor(runtime) {
      this.runtime = runtime;
      this.mediaRecorder = null;
      this.chunks = [];
      this.recordings = [];
      this.audioElement = null;
      this.audioUrl = null;
      this.stageOverlay = null;
      this.overlayLabel = null;
      this.overlayMeterFill = null;
      this.startTime = null;
      this.timerInterval = null;

      // Keep the listener reference so it can be removed if needed later.
      this.handleStopAllBound = this.handleStopAll.bind(this);
      if (this.runtime && typeof this.runtime.on === 'function') {
        this.runtime.on('PROJECT_STOP_ALL', this.handleStopAllBound);
      }
    }

    getInfo() {
      return {
        id: 'micRecorder',
        name: CONFIG.extensionName,
        color1: CONFIG.extensionColor,
        color2: CONFIG.extensionColorDark,
        color3: CONFIG.extensionColorDarker,
        blocks: [
          {
            opcode: 'startRecording',
            blockType: Scratch.BlockType.COMMAND,
            text: 'start microphone recording'
          },
          {
            opcode: 'stopRecording',
            blockType: Scratch.BlockType.COMMAND,
            text: 'stop microphone recording'
          },
          {
            opcode: 'playLastRecording',
            blockType: Scratch.BlockType.COMMAND,
            text: 'play last recording'
          },
          {
            opcode: 'stopPlayback',
            blockType: Scratch.BlockType.COMMAND,
            text: 'stop playback'
          }
        ]
      };
    }

    /**
     * Pick a media type only when the browser says it supports it.
     * An empty string lets the browser choose its default format.
     */
    getSupportedMimeType() {
      if (typeof MediaRecorder.isTypeSupported !== 'function') return '';

      return CONFIG.preferredMimeTypes.find((mimeType) =>
        MediaRecorder.isTypeSupported(mimeType)
      ) || '';
    }

    async startRecording() {
      // Prevent duplicate prompts or recorder instances, including while the
      // permission prompt is still pending.
      if (this.isStarting ||
          (this.mediaRecorder &&
           (this.mediaRecorder.state === 'recording' ||
            this.mediaRecorder.state === 'paused'))) {
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.showError('Microphone access is not supported in this browser. Use HTTPS or localhost.');
        return;
      }

      if (typeof MediaRecorder === 'undefined') {
        this.showError('Audio recording is not supported in this browser.');
        return;
      }

      this.isStarting = true;
      let stream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const mimeType = this.getSupportedMimeType();
        const recorderOptions = mimeType ? { mimeType } : undefined;
        const recorder = new MediaRecorder(stream, recorderOptions);

        this.mediaRecorder = recorder;
        this.chunks = [];

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            this.chunks.push(event.data);
          }
        };

        recorder.onerror = (event) => {
          const message = event.error && event.error.message
            ? event.error.message
            : 'The browser reported an audio recording error.';
          this.showError(message);
          this.removeStageOverlay();
        };

        recorder.onstop = () => this.saveFinishedRecording(recorder);
        recorder.start();
        this.startTime = Date.now();
        this.addStageOverlay();
      } catch (error) {
        // If recorder creation/start fails after permission is granted, do not
        // leave the microphone stream active.
        if (stream) stream.getTracks().forEach((track) => track.stop());
        this.mediaRecorder = null;
        this.removeStageOverlay();
        this.showError(this.getErrorMessage(error));
      } finally {
        this.isStarting = false;
      }
    }

    stopRecording() {
      if (!this.mediaRecorder ||
          (this.mediaRecorder.state !== 'recording' &&
           this.mediaRecorder.state !== 'paused')) {
        return;
      }

      // onstop is installed when recording starts. This keeps finalization in
      // one place and avoids replacing the callback on repeated stop requests.
      this.mediaRecorder.stop();
    }

    saveFinishedRecording(recorder) {
      // The event handler passes the specific recorder that emitted "stop",
      // preventing an older event from finalizing a newer recording session.
      if (this.mediaRecorder !== recorder) {
        if (recorder.stream) recorder.stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const mimeType = recorder.mimeType || 'application/octet-stream';
      const blob = new Blob(this.chunks, { type: mimeType });
      this.chunks = [];

      // Release the microphone immediately after the browser finalizes data.
      if (recorder.stream) {
        recorder.stream.getTracks().forEach((track) => track.stop());
      }
      this.mediaRecorder = null;
      this.removeStageOverlay();

      if (blob.size === 0) {
        this.showError('No audio data was recorded. Try recording again.');
        return;
      }

      // The extension exposes playback of the latest take, so release the
      // previous URL before replacing it to avoid retaining browser resources.
      this.releaseLastRecording();

      this.audioUrl = URL.createObjectURL(blob);
      this.audioElement = new Audio(this.audioUrl);
      this.recordings = [{ blob, audio: this.audioElement, audioUrl: this.audioUrl }];
    }

    async playLastRecording() {
      if (!this.audioElement) {
        this.showError('There is no recording to play yet.');
        return;
      }

      try {
        this.audioElement.currentTime = 0;
        await this.audioElement.play();
      } catch (error) {
        this.showError('Could not play the recording: ' +
          this.getErrorMessage(error));
      }
    }

    stopPlayback() {
      if (!this.audioElement) return;

      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }

    releaseLastRecording() {
      if (this.audioElement) this.audioElement.pause();
      if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);

      this.audioElement = null;
      this.audioUrl = null;
      this.recordings = [];
    }

    addStageOverlay() {
      if (this.stageOverlay) return;

      const overlay = document.createElement('div');
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      Object.assign(overlay.style, {
        position: 'absolute',
        top: CONFIG.overlayTop,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '10px 20px',
        background: CONFIG.overlayBackground,
        color: '#fff',
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        fontWeight: 'bold',
        borderRadius: '8px',
        textAlign: 'center',
        zIndex: CONFIG.overlayZIndex
      });

      // DOM methods avoid HTML injection and make UI elements easy to target.
      const label = document.createElement('div');
      label.className = 'mic-recorder-status';
      label.textContent = 'Recording: 0s';

      const meterTrack = document.createElement('div');
      meterTrack.className = 'mic-recorder-meter-track';
      Object.assign(meterTrack.style, {
        marginTop: '5px',
        width: '200px',
        height: '10px',
        background: CONFIG.overlayMeterBackground,
        borderRadius: '5px',
        overflow: 'hidden'
      });

      const meterFill = document.createElement('div');
      meterFill.className = 'mic-recorder-meter-fill';
      Object.assign(meterFill.style, {
        height: '100%',
        width: '0%',
        background: CONFIG.overlayMeterForeground,
        borderRadius: '5px'
      });

      meterTrack.appendChild(meterFill);
      overlay.append(label, meterTrack);
      document.body.appendChild(overlay);

      this.stageOverlay = overlay;
      this.overlayLabel = label;
      this.overlayMeterFill = meterFill;

      this.timerInterval = setInterval(() => {
        // A stop event may have removed the overlay between interval ticks.
        if (!this.overlayLabel || !this.overlayMeterFill || !this.startTime) return;

        const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        this.overlayLabel.textContent = `Recording: ${elapsedSeconds}s`;

        const scaleSeconds = Number(CONFIG.overlayMeterSeconds);
        if (scaleSeconds > 0) {
          const progress = Math.min((elapsedSeconds / scaleSeconds) * 100, 100);
          this.overlayMeterFill.style.width = `${progress}%`;
        } else {
          this.overlayMeterFill.style.width = '0%';
        }
      }, 250);
    }

    removeStageOverlay() {
      if (this.stageOverlay && this.stageOverlay.parentNode) {
        this.stageOverlay.parentNode.removeChild(this.stageOverlay);
      }

      if (this.timerInterval !== null) clearInterval(this.timerInterval);

      this.stageOverlay = null;
      this.overlayLabel = null;
      this.overlayMeterFill = null;
      this.timerInterval = null;
      this.startTime = null;
    }

    showError(message) {
      // Error feedback must not crash the extension in restricted embeds.
      if (typeof alert === 'function') {
        alert('Microphone Recorder: ' + message);
      } else {
        console.error('Microphone Recorder:', message);
      }
    }

    getErrorMessage(error) {
      if (!error) return 'Unknown error.';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        return 'Microphone permission was denied. Allow microphone access and try again.';
      }
      if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        return 'No microphone was found.';
      }
      return error.message || String(error);
    }

    // Stop an active recording and playback when TurboWarp stop-all is clicked.
    handleStopAll() {
      this.stopRecording();
      this.stopPlayback();
    }
  }

  Scratch.extensions.register(new MicRecorder(Scratch.vm && Scratch.vm.runtime));
})(Scratch);
