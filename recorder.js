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
    extensionDescription: 'Record audio from your microphone and play back your latest take in TurboWarp.',
    // Inline SVG data URIs keep the icon portable when the extension is loaded
    // directly from a URL. PNG previews and editable SVG sources live in /assets.
    blockIconURI: "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22128%22 height=%22128%22 viewBox=%220 0 128 128%22%3E%3Crect x=%223%22 y=%223%22 width=%22122%22 height=%22122%22 rx=%2228%22 fill=%22%234BBEFF%22/%3E%3Cg fill=%22none%22 stroke=%22%23E0F6FF%22 stroke-width=%224%22 stroke-linecap=%22round%22%3E%3Cpath d=%22M28 48 Q14 64 28 80%22/%3E%3Cpath d=%22M100 48 Q114 64 100 80%22/%3E%3Cpath d=%22M38 39 Q18 64 38 89%22/%3E%3Cpath d=%22M90 39 Q110 64 90 89%22/%3E%3C/g%3E%3Cg fill=%22%23FFFFFF%22%3E%3Crect x=%2252%22 y=%2224%22 width=%2224%22 height=%2254%22 rx=%2212%22/%3E%3Ccircle cx=%2264%22 cy=%2239%22 r=%223%22 fill=%22%232990EB%22/%3E%3Ccircle cx=%2264%22 cy=%2250%22 r=%223%22 fill=%22%232990EB%22/%3E%3Ccircle cx=%2264%22 cy=%2261%22 r=%223%22 fill=%22%232990EB%22/%3E%3Cpath d=%22M44 51 V60 A20 20 0 0 0 84 60 V51%22 fill=%22none%22 stroke=%22%23FFFFFF%22 stroke-width=%225%22 stroke-linecap=%22round%22/%3E%3Cpath d=%22M64 80 V95 M51 96 H77%22 stroke=%22%23FFFFFF%22 stroke-width=%225%22 stroke-linecap=%22round%22/%3E%3C/g%3E%3C/svg%3E",
    menuIconURI: "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22128%22 height=%22128%22 viewBox=%220 0 128 128%22%3E%3Crect x=%223%22 y=%223%22 width=%22122%22 height=%22122%22 rx=%2228%22 fill=%22%234BBEFF%22/%3E%3Cg fill=%22none%22 stroke=%22%23E0F6FF%22 stroke-width=%224%22 stroke-linecap=%22round%22%3E%3Cpath d=%22M28 48 Q14 64 28 80%22/%3E%3Cpath d=%22M100 48 Q114 64 100 80%22/%3E%3Cpath d=%22M38 39 Q18 64 38 89%22/%3E%3Cpath d=%22M90 39 Q110 64 90 89%22/%3E%3C/g%3E%3Cg fill=%22%23FFFFFF%22%3E%3Crect x=%2252%22 y=%2224%22 width=%2224%22 height=%2254%22 rx=%2212%22/%3E%3Ccircle cx=%2264%22 cy=%2239%22 r=%223%22 fill=%22%232990EB%22/%3E%3Ccircle cx=%2264%22 cy=%2250%22 r=%223%22 fill=%22%232990EB%22/%3E%3Ccircle cx=%2264%22 cy=%2261%22 r=%223%22 fill=%22%232990EB%22/%3E%3Cpath d=%22M44 51 V60 A20 20 0 0 0 84 60 V51%22 fill=%22none%22 stroke=%22%23FFFFFF%22 stroke-width=%225%22 stroke-linecap=%22round%22/%3E%3Cpath d=%22M64 80 V95 M51 96 H77%22 stroke=%22%23FFFFFF%22 stroke-width=%225%22 stroke-linecap=%22round%22/%3E%3C/g%3E%3C/svg%3E",
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
        description: CONFIG.extensionDescription,
        docsURI: 'https://github.com/rubiidev18alt/Microphone-Turbowarp-Extension',
        blockIconURI: CONFIG.blockIconURI,
        menuIconURI: CONFIG.menuIconURI,
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
          },
          {
            opcode: 'requestMicrophonePermission',
            blockType: Scratch.BlockType.COMMAND,
            text: 'request microphone permission'
          },
          {
            opcode: 'isRecording',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'is recording?'
          },
          {
            opcode: 'saveLastRecordingAsSound',
            blockType: Scratch.BlockType.COMMAND,
            text: 'save last recording as sound'
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

    /**
     * Ask for permission only when a user runs the block. Browsers do not
     * reliably show permission prompts during extension registration.
     * If permission is granted, stop the short-lived stream so the mic is not
     * left active; subsequent recording requests the device again as needed.
     */
    async requestMicrophonePermission() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.showError('Microphone access is unavailable. Use a supported browser on HTTPS or localhost.');
        return;
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.permissionGranted = true;
      } catch (error) {
        this.permissionGranted = false;
        this.showError(this.getErrorMessage(error));
      } finally {
        if (stream) stream.getTracks().forEach((track) => track.stop());
      }
    }

    /**
     * Boolean reporter. It reflects active capture, not whether permission was
     * granted previously or whether the last take exists.
     */
    isRecording() {
      return Boolean(this.mediaRecorder && this.mediaRecorder.state === 'recording');
    }

    /**
     * Store the latest take in the current sprite's Sounds list.
     *
     * This uses TurboWarp's unsandboxed VM APIs. It deliberately rejects the
     * Stage/backdrop target: Scratch backdrops cannot own sounds.
     */
    async saveLastRecordingAsSound(args, util) {
      if (!this.audioUrl || !this.recordings.length) {
        this.showError('Record something first, then save it as a sound.');
        return;
      }

      const target = util && util.target;
      if (!target || target.isStage) {
        this.showError('Select a sprite to save the recording as a sound. The Stage/backdrop cannot own sounds.');
        return;
      }

      const runtime = this.runtime;
      if (!runtime || !runtime.storage || !runtime.storage.AssetType || !target.sprite) {
        this.showError('This TurboWarp version does not expose the sound storage API needed by this block.');
        return;
      }

      try {
        const response = await fetch(this.audioUrl);
        if (!response.ok) throw new Error('Could not read the recorded audio.');
        const buffer = await response.arrayBuffer();
        const mimeType = this.recordings[this.recordings.length - 1].blob.type || 'audio/webm';
        // Decode the recorded bytes first, then convert to a broadly supported
        // PCM WAV asset so the saved project sound is usable outside this session.
        if (!runtime.audioEngine || typeof runtime.audioEngine.decodeSoundPlayer !== 'function') {
          throw new Error('The audio engine is unavailable in this TurboWarp version.');
        }
        const player = await runtime.audioEngine.decodeSoundPlayer({
          data: {buffer, type: mimeType}
        });
        const storage = runtime.storage;
        const dataFormat = 'wav';
        const format = storage.DataFormat && storage.DataFormat.WAV ? storage.DataFormat.WAV : 'wav';
        const wavBytes = this.audioBufferToWav(player.buffer);
        const asset = storage.createAsset(
          storage.AssetType.Sound,
          format,
          null,
          wavBytes,
          storage.AssetType
        );

        const wavBuffer = wavBytes.buffer.slice(wavBytes.byteOffset, wavBytes.byteOffset + wavBytes.byteLength);
        const storedPlayer = await runtime.audioEngine.decodeSoundPlayer({
          data: {buffer: wavBuffer, type: 'audio/wav'},
          format: 'wav',
          assetId: asset.assetId,
          md5: asset.assetId + '.wav'
        });

        const sound = {
          name: 'Microphone recording',
          assetId: asset.assetId,
          dataFormat,
          format: '',
          rate: storedPlayer.buffer.sampleRate,
          sampleCount: storedPlayer.buffer.length,
          md5: asset.assetId + '.' + dataFormat,
          asset,
          soundId: storedPlayer.id
        };

        if (typeof target.addSound !== 'function' ||
            !target.sprite.soundBank ||
            typeof target.sprite.soundBank.addSoundPlayer !== 'function') {
          if (storedPlayer && typeof storedPlayer.dispose === 'function') storedPlayer.dispose();
          throw new Error('This TurboWarp version cannot add a sound to the selected sprite.');
        }
        // Register a player decoded from the exact WAV bytes stored in the asset.
        target.sprite.soundBank.addSoundPlayer(storedPlayer);
        target.addSound(sound);
      } catch (error) {
        this.showError('Could not save the recording as a sprite sound: ' + this.getErrorMessage(error));
      }
    }


    /**
     * Convert a decoded AudioBuffer to PCM WAV. Scratch project sounds use
     * portable asset formats; simply labeling a WebM blob as a sound asset
     * would create an invalid sound for some player/editor paths.
     */
    audioBufferToWav(audioBuffer) {
      const channelCount = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const frameCount = audioBuffer.length;
      const bytesPerSample = 2;
      const dataSize = frameCount * channelCount * bytesPerSample;
      const wav = new ArrayBuffer(44 + dataSize);
      const view = new DataView(wav);
      const writeText = (offset, value) => {
        for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
      };

      writeText(0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true);
      writeText(8, 'WAVE');
      writeText(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, channelCount, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
      view.setUint16(32, channelCount * bytesPerSample, true);
      view.setUint16(34, 16, true);
      writeText(36, 'data');
      view.setUint32(40, dataSize, true);

      let offset = 44;
      for (let frame = 0; frame < frameCount; frame++) {
        for (let channel = 0; channel < channelCount; channel++) {
          const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[frame]));
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
          offset += bytesPerSample;
        }
      }
      return new Uint8Array(wav);
    }

    async saveLastRecordingAsSound(args, util) {
      if (!this.audioUrl || !this.recordings.length) {
        this.showError('Record something first, then save it as a sound.');
        return;
      }

      const target = util && util.target;
      if (!target || target.isStage) {
        this.showError('Select a sprite to save the recording as a sound. The Stage/backdrop cannot own sounds.');
        return;
      }

      const runtime = this.runtime;
      if (!runtime || !runtime.storage || !runtime.storage.AssetType || !target.sprite) {
        this.showError('This TurboWarp version does not expose the sound storage API needed by this block.');
        return;
      }

      try {
        const response = await fetch(this.audioUrl);
        if (!response.ok) throw new Error('Could not read the recorded audio.');
        const buffer = await response.arrayBuffer();
        const mimeType = this.recordings[this.recordings.length - 1].blob.type || 'audio/webm';
        // Decode the recorded bytes first, then convert to a broadly supported
        // PCM WAV asset so the saved project sound is usable outside this session.
        if (!runtime.audioEngine || typeof runtime.audioEngine.decodeSoundPlayer !== 'function') {
          throw new Error('The audio engine is unavailable in this TurboWarp version.');
        }
        const player = await runtime.audioEngine.decodeSoundPlayer({
          data: {buffer, type: mimeType}
        });
        const storage = runtime.storage;
        const dataFormat = 'wav';
        const format = storage.DataFormat && storage.DataFormat.WAV ? storage.DataFormat.WAV : 'wav';
        const wavBytes = this.audioBufferToWav(player.buffer);
        const asset = storage.createAsset(
          storage.AssetType.Sound,
          format,
          null,
          wavBytes,
          storage.AssetType
        );

        const storedPlayer = await runtime.audioEngine.decodeSoundPlayer({
          data: {buffer: wavBytes.buffer, type: 'audio/wav'},
          format: 'wav',
          assetId: asset.assetId,
          md5: asset.assetId + '.wav'
        });

        const sound = {
          name: 'Microphone recording',
          assetId: asset.assetId,
          dataFormat,
          format: '',
          rate: storedPlayer.buffer.sampleRate,
          sampleCount: storedPlayer.buffer.length,
          md5: asset.assetId + '.' + dataFormat,
          asset,
          soundId: storedPlayer.id
        };

        if (typeof target.addSound !== 'function' ||
            !target.sprite.soundBank ||
            typeof target.sprite.soundBank.addSoundPlayer !== 'function') {
          if (storedPlayer && typeof storedPlayer.dispose === 'function') storedPlayer.dispose();
          throw new Error('This TurboWarp version cannot add a sound to the selected sprite.');
        }
        // Register a player decoded from the exact WAV bytes stored in the asset.
        target.sprite.soundBank.addSoundPlayer(storedPlayer);
        target.addSound(sound);
      } catch (error) {
        this.showError('Could not save the recording as a sprite sound: ' + this.getErrorMessage(error));
      }
    }


    /**
     * Convert a decoded AudioBuffer to PCM WAV. Scratch project sounds use
     * portable asset formats; simply labeling a WebM blob as a sound asset
     * would create an invalid sound for some player/editor paths.
     */
    audioBufferToWav(audioBuffer) {
      const channelCount = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const frameCount = audioBuffer.length;
      const bytesPerSample = 2;
      const dataSize = frameCount * channelCount * bytesPerSample;
      const wav = new ArrayBuffer(44 + dataSize);
      const view = new DataView(wav);
      const writeText = (offset, value) => {
        for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
      };

      writeText(0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true);
      writeText(8, 'WAVE');
      writeText(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, channelCount, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
      view.setUint16(32, channelCount * bytesPerSample, true);
      view.setUint16(34, 16, true);
      writeText(36, 'data');
      view.setUint32(40, dataSize, true);

      let offset = 44;
      for (let frame = 0; frame < frameCount; frame++) {
        for (let channel = 0; channel < channelCount; channel++) {
          const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[frame]));
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
          offset += bytesPerSample;
        }
      }
      return new Uint8Array(wav);
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
