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
    blockIconURI: "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22128%22 height=%22128%22 viewBox=%220 0 128 128%22%3E%3Cdefs%3E%3ClinearGradient id=%22b%22 x1=%220%22 y1=%220%22 x2=%221%22 y2=%221%22%3E%3Cstop stop-color=%22%239577FF%22/%3E%3Cstop offset=%221%22 stop-color=%22%236242CC%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect x=%223%22 y=%223%22 width=%22122%22 height=%22122%22 rx=%2228%22 fill=%22url(%23b)%22/%3E%3Cg stroke=%22%23FFFFFF%22 stroke-width=%225%22 stroke-linecap=%22round%22%3E%3Cpath d=%22M24 64V59 M36 64V40 M48 64V28 M60 64V48 M72 64V22 M84 64V44 M96 64V34 M108 64V54%22/%3E%3Cpath d=%22M24 64V69 M36 64V88 M48 64V100 M60 64V80 M72 64V106 M84 64V84 M96 64V94 M108 64V74%22/%3E%3C/g%3E%3C/svg%3E",
    menuIconURI: "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22128%22 height=%22128%22 viewBox=%220 0 128 128%22%3E%3Cdefs%3E%3ClinearGradient id=%22b%22 x1=%220%22 y1=%220%22 x2=%221%22 y2=%221%22%3E%3Cstop stop-color=%22%239577FF%22/%3E%3Cstop offset=%221%22 stop-color=%22%236242CC%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect x=%223%22 y=%223%22 width=%22122%22 height=%22122%22 rx=%2228%22 fill=%22url(%23b)%22/%3E%3Cg stroke=%22%23FFFFFF%22 stroke-width=%225%22 stroke-linecap=%22round%22%3E%3Cpath d=%22M24 64V59 M36 64V40 M48 64V28 M60 64V48 M72 64V22 M84 64V44 M96 64V34 M108 64V54%22/%3E%3Cpath d=%22M24 64V69 M36 64V88 M48 64V100 M60 64V80 M72 64V106 M84 64V84 M96 64V94 M108 64V74%22/%3E%3C/g%3E%3C/svg%3E",
    extensionColor: '#7656E8',
    extensionColorDark: '#6242CC',
    extensionColorDarker: '#4A2BA8',

    // The recording indicator is a live waveform, not a progress meter, so
    // the recording length is not capped at 60 seconds.
    overlayTop: '24px',
    overlayZIndex: '9999',
    overlayBackground: 'linear-gradient(135deg, rgba(31, 28, 65, 0.97), rgba(47, 35, 93, 0.96))',
    overlayAccent: '#B9A5FF',
    overlayBorder: 'rgba(190, 169, 255, 0.35)',
    overlayGlow: 'rgba(130, 100, 255, 0.25)',

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
      this.waveformCanvas = null;
      this.waveformAnimationFrame = null;
      this.waveformAnalyser = null;
      this.waveformSource = null;
      this.waveformAudioContext = null;
      this.startTime = null;

      // Speech-recognition state is kept separate from audio recording.
      this.speechRecognition = null;
      this.speechTranscriptText = '';
      this.speechStatus = 'idle';
      this.transcriptEditor = null;
      this.transcriptStatusLabel = null;
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
            opcode: 'startSpeechToText',
            blockType: Scratch.BlockType.COMMAND,
            text: 'start speech to text'
          },
          {
            opcode: 'stopSpeechToText',
            blockType: Scratch.BlockType.COMMAND,
            text: 'stop speech to text'
          },
          {
            opcode: 'speechTranscript',
            blockType: Scratch.BlockType.REPORTER,
            text: 'transcribed speech'
          },
          {
            opcode: 'showTranscriptEditor',
            blockType: Scratch.BlockType.COMMAND,
            text: 'open transcript text field'
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
     * Start live speech transcription using the browser's SpeechRecognition
     * implementation. Recognition availability is browser-dependent.
     */
    startSpeechToText() {
      const SpeechRecognitionConstructor =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognitionConstructor) {
        this.speechStatus = 'unsupported';
        this.showError('Speech-to-text is not supported in this browser. Try a browser that provides Web Speech recognition.');
        return;
      }

      if (this.speechRecognition) {
        // Ignore duplicate start blocks while a recognition session is active.
        if (this.speechStatus === 'listening') return;
        this.stopSpeechToText();
      }

      try {
        const recognition = new SpeechRecognitionConstructor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-US';

        this.speechTranscriptText = '';
        this.speechStatus = 'listening';
        this.speechRecognition = recognition;

        recognition.onresult = (event) => {
          let finalized = '';
          let interim = '';
          for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i];
            const transcript = result[0] ? result[0].transcript : '';
            if (result.isFinal) finalized += transcript;
            else interim += transcript;
          }

          // Keep final recognized text stable while allowing the reporter and
          // copyable editor to show the current, provisional words too.
          this.speechTranscriptText = (finalized + interim).trim();
          this.updateTranscriptEditor();
        };

        recognition.onerror = (event) => {
          this.speechStatus = 'error';
          const message = event.error === 'not-allowed'
            ? 'Speech recognition permission was denied.'
            : event.error === 'no-speech'
              ? 'No speech was detected. Start speech-to-text and speak into the microphone.'
              : 'Speech recognition error: ' + (event.error || 'unknown error');
          this.updateTranscriptEditor(message);
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
            this.showError(message);
          }
        };

        recognition.onend = () => {
          this.speechStatus = 'stopped';
          this.speechRecognition = null;
          this.updateTranscriptEditor();
        };

        this.updateTranscriptEditor();
        recognition.start();
      } catch (error) {
        this.speechStatus = 'error';
        this.speechRecognition = null;
        this.showError('Could not start speech recognition: ' + this.getErrorMessage(error));
        this.updateTranscriptEditor();
      }
    }

    /** Stop listening but retain the transcript for editing/copying. */
    stopSpeechToText() {
      const recognition = this.speechRecognition;
      if (!recognition) {
        if (this.speechStatus === 'listening') this.speechStatus = 'stopped';
        this.updateTranscriptEditor();
        return;
      }

      this.speechStatus = 'stopping';
      this.updateTranscriptEditor('Finishing transcription…');
      try {
        recognition.stop();
      } catch (error) {
        this.speechRecognition = null;
        this.speechStatus = 'stopped';
        this.updateTranscriptEditor();
      }
    }

    /** Reporter value: current transcript, including recognized interim words. */
    speechTranscript() {
      return this.speechTranscriptText || '';
    }

    /**
     * Open a small editor where the user can review, edit, select, and copy the
     * transcript. This is intentionally a DOM text field rather than alert().
     */
    showTranscriptEditor() {
      if (this.transcriptEditor && this.transcriptEditor.isConnected) {
        this.transcriptEditor.style.display = 'block';
        const textArea = this.transcriptEditor.querySelector('textarea');
        if (textArea) textArea.focus();
        this.updateTranscriptEditor();
        return;
      }

      const panel = document.createElement('section');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Speech transcript');
      Object.assign(panel.style, {
        position: 'fixed',
        right: '20px',
        bottom: '20px',
        width: 'min(420px, calc(100vw - 40px))',
        boxSizing: 'border-box',
        padding: '16px',
        color: '#FFFFFF',
        background: 'linear-gradient(145deg, rgba(31, 28, 65, 0.98), rgba(47, 35, 93, 0.98))',
        border: '1px solid ' + CONFIG.overlayBorder,
        borderRadius: '16px',
        boxShadow: '0 16px 48px rgba(12, 7, 35, 0.4)',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        zIndex: String(Number(CONFIG.overlayZIndex) + 1)
      });

      const top = document.createElement('div');
      Object.assign(top.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '10px'
      });

      const heading = document.createElement('div');
      heading.textContent = 'SPEECH TRANSCRIPT';
      Object.assign(heading.style, {
        fontSize: '12px',
        fontWeight: '800',
        letterSpacing: '1.1px',
        color: '#DED5FF'
      });

      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Close transcript editor');
      Object.assign(close.style, {
        border: '0',
        borderRadius: '8px',
        padding: '2px 9px',
        color: '#FFFFFF',
        background: 'rgba(255, 255, 255, 0.12)',
        fontSize: '22px',
        cursor: 'pointer'
      });
      close.addEventListener('click', () => {
        panel.style.display = 'none';
      });

      top.append(heading, close);

      const textArea = document.createElement('textarea');
      textArea.setAttribute('aria-label', 'Recognized speech text');
      textArea.placeholder = 'Your recognized words will appear here…';
      textArea.spellcheck = true;
      Object.assign(textArea.style, {
        display: 'block',
        width: '100%',
        minHeight: '140px',
        boxSizing: 'border-box',
        resize: 'vertical',
        padding: '12px',
        border: '1px solid rgba(190, 169, 255, 0.3)',
        borderRadius: '10px',
        outline: 'none',
        color: '#FFFFFF',
        background: 'rgba(14, 11, 35, 0.7)',
        fontFamily: 'inherit',
        fontSize: '14px',
        lineHeight: '1.5'
      });
      textArea.value = this.speechTranscriptText;
      textArea.addEventListener('input', () => {
        // Edits in the text field become the transcript reporter value too.
        this.speechTranscriptText = textArea.value;
      });

      const status = document.createElement('div');
      Object.assign(status.style, {
        minHeight: '18px',
        marginTop: '8px',
        color: '#C7BDF0',
        fontSize: '12px'
      });

      const actions = document.createElement('div');
      Object.assign(actions.style, {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        marginTop: '10px'
      });

      const makeButton = (label, primary, onClick) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        Object.assign(button.style, {
          border: primary ? '1px solid rgba(221, 213, 255, 0.55)' : '1px solid rgba(190, 169, 255, 0.25)',
          borderRadius: '9px',
          padding: '9px 12px',
          color: '#FFFFFF',
          background: primary ? 'linear-gradient(135deg, #7656E8, #6242CC)' : 'rgba(255, 255, 255, 0.08)',
          fontSize: '12px',
          fontWeight: '700',
          cursor: 'pointer'
        });
        button.addEventListener('click', onClick);
        return button;
      };

      actions.append(
        makeButton('Copy text', true, async () => {
          this.speechTranscriptText = textArea.value;
          try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
              await navigator.clipboard.writeText(textArea.value);
            } else {
              textArea.focus();
              textArea.select();
              const copied = document.execCommand('copy');
              if (!copied) throw new Error('Clipboard access is unavailable');
            }
            status.textContent = 'Copied to clipboard';
          } catch (error) {
            textArea.focus();
            textArea.select();
            status.textContent = 'Text selected. Press Copy/Select All in your browser to copy it.';
          }
        }),
        makeButton('Select all', false, () => {
          textArea.focus();
          textArea.select();
          status.textContent = 'All transcript text selected';
        }),
        makeButton('Clear', false, () => {
          textArea.value = '';
          this.speechTranscriptText = '';
          status.textContent = 'Transcript cleared';
        })
      );

      panel.append(top, textArea, status, actions);
      document.body.appendChild(panel);
      this.transcriptEditor = panel;
      this.transcriptStatusLabel = status;
      this.updateTranscriptEditor();
      textArea.focus();
    }

    /** Keep the editor synchronized with recognition until the user edits it. */
    updateTranscriptEditor(statusMessage) {
      if (!this.transcriptEditor || !this.transcriptEditor.isConnected) return;
      const textArea = this.transcriptEditor.querySelector('textarea');
      if (textArea && document.activeElement !== textArea) {
        textArea.value = this.speechTranscriptText;
      }
      if (this.transcriptStatusLabel) {
        if (statusMessage) {
          this.transcriptStatusLabel.textContent = statusMessage;
        } else if (this.speechStatus === 'listening') {
          this.transcriptStatusLabel.textContent = 'Listening… speak, then run “stop speech to text”.';
        } else if (this.speechStatus === 'stopping') {
          this.transcriptStatusLabel.textContent = 'Finishing transcription…';
        } else if (this.speechStatus === 'unsupported') {
          this.transcriptStatusLabel.textContent = 'Speech recognition is not supported here.';
        } else if (this.speechStatus === 'error') {
          this.transcriptStatusLabel.textContent = 'Speech recognition stopped with an error.';
        } else if (this.speechTranscriptText) {
          this.transcriptStatusLabel.textContent = 'Transcript ready to edit or copy.';
        } else {
          this.transcriptStatusLabel.textContent = 'Press start speech to text and begin speaking.';
        }
      }
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

      // Floating recording card: compact, readable, and visually distinct from
      // Scratch's stage while keeping all drawing local to this extension.
      const overlay = document.createElement('div');
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      Object.assign(overlay.style, {
        position: 'fixed',
        top: CONFIG.overlayTop,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(360px, calc(100vw - 32px))',
        boxSizing: 'border-box',
        padding: '14px 16px 12px',
        background: CONFIG.overlayBackground,
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        border: '1px solid ' + CONFIG.overlayBorder,
        borderRadius: '16px',
        boxShadow: '0 12px 38px rgba(12, 7, 35, 0.32), 0 0 28px ' + CONFIG.overlayGlow,
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        zIndex: CONFIG.overlayZIndex,
        overflow: 'hidden'
      });

      const header = document.createElement('div');
      Object.assign(header.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '10px'
      });

      const titleGroup = document.createElement('div');
      Object.assign(titleGroup.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        minWidth: '0'
      });

      const liveDot = document.createElement('span');
      Object.assign(liveDot.style, {
        display: 'inline-block',
        width: '9px',
        height: '9px',
        flex: '0 0 9px',
        borderRadius: '50%',
        background: '#FF668B',
        boxShadow: '0 0 0 4px rgba(255, 102, 139, 0.15), 0 0 12px rgba(255, 102, 139, 0.7)'
      });

      const title = document.createElement('div');
      title.textContent = 'MICROPHONE STUDIO';
      Object.assign(title.style, {
        fontSize: '11px',
        fontWeight: '800',
        letterSpacing: '1.25px',
        color: '#DED5FF'
      });

      const badge = document.createElement('span');
      badge.textContent = 'LIVE';
      Object.assign(badge.style, {
        flex: '0 0 auto',
        padding: '4px 7px',
        borderRadius: '6px',
        background: 'rgba(255, 102, 139, 0.16)',
        border: '1px solid rgba(255, 126, 160, 0.32)',
        color: '#FFB6CB',
        fontSize: '9px',
        fontWeight: '800',
        letterSpacing: '1px'
      });

      titleGroup.append(liveDot, title);
      header.append(titleGroup, badge);

      const waveformCanvas = document.createElement('canvas');
      waveformCanvas.width = 640;
      waveformCanvas.height = 112;
      waveformCanvas.setAttribute('aria-label', 'Live microphone waveform');
      Object.assign(waveformCanvas.style, {
        display: 'block',
        width: '100%',
        height: '56px',
        borderRadius: '10px',
        background: 'linear-gradient(180deg, rgba(18, 14, 44, 0.72), rgba(35, 26, 70, 0.72))',
        border: '1px solid rgba(196, 178, 255, 0.12)',
        boxSizing: 'border-box'
      });

      const footer = document.createElement('div');
      Object.assign(footer.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginTop: '11px'
      });

      const status = document.createElement('div');
      status.textContent = 'Recording in progress';
      Object.assign(status.style, {
        minWidth: '0',
        color: '#C7BDF0',
        fontSize: '12px',
        fontWeight: '600'
      });

      const elapsed = document.createElement('div');
      elapsed.textContent = '00:00';
      Object.assign(elapsed.style, {
        color: '#FFFFFF',
        fontSize: '20px',
        lineHeight: '1.1',
        fontWeight: '750',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.3px'
      });

      footer.append(status, elapsed);
      overlay.append(header, waveformCanvas, footer);
      document.body.appendChild(overlay);

      this.stageOverlay = overlay;
      this.overlayLabel = elapsed;
      this.overlayMeterFill = null;
      this.waveformCanvas = waveformCanvas;
      this.startWaveform();

      this.timerInterval = setInterval(() => {
        if (!this.overlayLabel || !this.startTime) return;
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - this.startTime) / 1000));
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        this.overlayLabel.textContent =
          String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
      }, 250);
    }

    startWaveform() {
      const canvas = this.waveformCanvas;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      // Feed actual microphone samples into an analyser when Web Audio is
      // available; the fallback still draws a subtle idle waveform.
      try {
        const stream = this.mediaRecorder && this.mediaRecorder.stream;
        const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
        if (stream && AudioContextConstructor) {
          const audioContext = new AudioContextConstructor();
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 1024;
          analyser.smoothingTimeConstant = 0.78;
          const source = audioContext.createMediaStreamSource(stream);
          source.connect(analyser);
          this.waveformAudioContext = audioContext;
          this.waveformAnalyser = analyser;
          this.waveformSource = source;
        }
      } catch (error) {
        // Waveform is a visual enhancement; recording should continue if the
        // browser refuses a second Web Audio connection.
        console.warn('Microphone Recorder: waveform unavailable', error);
      }

      const samples = this.waveformAnalyser ? new Uint8Array(this.waveformAnalyser.fftSize) : null;
      const draw = () => {
        if (!this.waveformCanvas || !this.waveformCanvas.isConnected) return;
        const width = canvas.width;
        const height = canvas.height;
        context.clearRect(0, 0, width, height);

        // Fine center guide, like a small audio-editor timeline.
        context.strokeStyle = 'rgba(207, 195, 255, 0.15)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(0, height / 2);
        context.lineTo(width, height / 2);
        context.stroke();

        if (this.waveformAnalyser && samples) {
          this.waveformAnalyser.getByteTimeDomainData(samples);
        }

        const mid = height / 2;
        const amplitude = this.waveformAnalyser ? 1 : 0.07;
        const points = this.waveformAnalyser ? samples.length : 128;
        const step = width / points;
        context.beginPath();
        for (let i = 0; i < points; i++) {
          let value;
          if (this.waveformAnalyser) {
            value = (samples[i] - 128) / 128;
          } else {
            value = Math.sin((i * 0.24) + (Date.now() / 220)) * 0.16;
          }
          const x = i * step;
          const y = mid + value * mid * amplitude;
          if (i === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.lineWidth = 3;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        const gradient = context.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, '#6BE4FF');
        gradient.addColorStop(0.52, '#B9A5FF');
        gradient.addColorStop(1, '#F2A6FF');
        context.strokeStyle = gradient;
        context.shadowColor = 'rgba(174, 140, 255, 0.42)';
        context.shadowBlur = 9;
        context.stroke();
        context.shadowBlur = 0;

        this.waveformAnimationFrame = requestAnimationFrame(draw);
      };

      this.waveformAnimationFrame = requestAnimationFrame(draw);
    }

    removeStageOverlay() {
      if (this.stageOverlay && this.stageOverlay.parentNode) {
        this.stageOverlay.parentNode.removeChild(this.stageOverlay);
      }

      if (this.timerInterval !== null) clearInterval(this.timerInterval);

      this.stageOverlay = null;
      this.overlayLabel = null;
      this.overlayMeterFill = null;
      this.waveformCanvas = null;
      if (this.waveformAnimationFrame !== null) {
        cancelAnimationFrame(this.waveformAnimationFrame);
      }
      this.waveformAnimationFrame = null;
      this.waveformAnalyser = null;
      this.waveformSource = null;
      if (this.waveformAudioContext) {
        this.waveformAudioContext.close().catch(() => {});
      }
      this.waveformAudioContext = null;
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
