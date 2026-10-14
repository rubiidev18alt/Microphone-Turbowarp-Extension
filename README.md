# Microphone TurboWarp Extension

A microphone recording extension for TurboWarp.

## Use

Load `recorder.js` as an unsandboxed TurboWarp extension. The extension requests
microphone permission when **start microphone recording** is run. Browser
permission prompts and audio recording support depend on the browser and the
page's security context (HTTPS or localhost is generally required).

## Customize it

Most common changes are grouped near the top of `recorder.js` in the
`CONFIG` object:

| Setting | What it changes |
| --- | --- |
| `extensionName` | Extension name shown in the palette |
| `extensionColor`, `extensionColorDark`, `extensionColorDarker` | Block colors |
| `overlayTop`, `overlayZIndex`, `overlayBackground` | Recording indicator position and appearance |
| `overlayMeterSeconds` | Seconds represented by the visual meter; **not** a recording limit |
| `preferredMimeTypes` | Order of audio formats to try when the browser supports them |

The main class is split into small methods so it is easier to modify:

- `getInfo()` — extension metadata and block labels.
- `getSupportedMimeType()` — browser-compatible audio format selection.
- `startRecording()` / `stopRecording()` — microphone lifecycle.
- `saveFinishedRecording()` — finalizes audio and releases the microphone.
- `playLastRecording()` / `stopPlayback()` — playback controls.
- `addStageOverlay()` / `removeStageOverlay()` — recording indicator UI.
- `showError()` / `getErrorMessage()` — user-facing error reporting.

### Guidelines for contributors and AI coding tools

1. Keep UI, recording, and playback logic in their existing focused methods.
2. Put commonly customized values in `CONFIG` rather than scattering literals.
3. Preserve microphone-track cleanup on success and failure.
4. When changing recorded audio storage, also manage its object URL with
   `URL.revokeObjectURL()` to avoid retaining browser resources.
5. Do not describe the overlay meter as a hard recording limit unless you add
   and test actual stop-after-duration logic.

## License

This project is licensed under Creative Commons Attribution-NonCommercial 4.0
International (CC BY-NC 4.0). See [LICENSE](LICENSE). Non-commercial use only;
preserve attribution and indicate modifications.
