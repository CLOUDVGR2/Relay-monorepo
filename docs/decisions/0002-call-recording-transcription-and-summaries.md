# ADR 0002: Call recording, transcription, and summaries

- **Status:** Accepted
- **Date:** 2026-11-02
- **Owners:** Relay engineering
- **Related:** ADR 0001; `docs/mobile-architecture.md`

## Context

Relay Android audio calls need automatic capture of both participants, transcription, an AI-generated summary, and playback from call history.

Verified constraints: Android uses `react-native-webrtc` 124.0.8 and Jitsi WebRTC 124.0.0. The WebRTC audio device module exposes local microphone samples. The decoded remote PCM is available in the Jitsi playback thread after `nativeGetPlayoutData`; the current React Native integration exposes no equivalent public remote PCM callback. `expo-speech` is already installed. The AI service has text-analysis capability but no configured speech-to-text provider or private audio-storage pipeline.

## Decision

### Android capture

- Initialize a custom `JavaAudioDeviceModule` before React Native loads and capture local PCM through `SamplesReadyCallback`.
- Patch the pinned Jitsi WebRTC playback implementation to capture decoded remote PCM immediately after `nativeGetPlayoutData`, before speaker-mute handling.
- Keep local and remote tracks separate, retain sample-rate/channel metadata, and timestamp against a shared monotonic clock.
- Use bounded, non-blocking audio handoff and asynchronous disk writes. Surface queue overflow, missing tracks, disk exhaustion, and native initialization failures as explicit capture errors.
- Own recording lifecycle independently of PeerConnection instances so reconnects do not silently terminate recording. Finalize once when the call ends or capture becomes unrecoverable.

### Call lifecycle and storage

- Start automatically for eligible active audio calls after local media is established, including accept, restored-call, and rejoin paths.
- Show persistent recording/capture status. Do not add a per-call recording toggle or decline control. Never claim complete capture if either required track failed.
- Upload finalized artifacts through authenticated, call-scoped APIs with bounded retry, integrity verification, and idempotency.
- Store recordings in private storage behind an adapter; do not use public media URLs or the existing image-hosting integration.
- Authorize recording, transcript, summary, and playback access server-side against call participation.

### Processing and UI

- Persist recording metadata and processing status.
- Enqueue processing durably and idempotently after call end and audio finalization; do not transcribe inside the synchronous call-ending request.
- Use a dedicated speech-to-text adapter, preserving track/speaker attribution and timing. Mock output must never be represented as a real transcript.
- Generate summaries using the existing AI text-analysis capability, treating transcript content as untrusted input.
- Persist transcript, summary, provider/model metadata, and terminal errors. Use bounded retries and recoverable worker leases.
- Expose call-history summary/transcript views, processing and failure states, and safe retry.
- Use `expo-speech` for on-device summary playback with stop controls.

## Alternatives considered

- Microphone-only capture: rejected because it omits remote audio.
- A second Android `AudioRecord`: rejected because it competes with WebRTC microphone ownership and audio routing.
- Public WebRTC track sinks or `MediaRecorder`: rejected because the current integration does not expose a reliable remote decoded-PCM path through them.
- Cloudinary: rejected because the existing integration is for images and does not provide the required private recording controls.
- Synchronous transcription during call end: rejected because inference latency and outages must not block call lifecycle.
- Existing Go welcome worker: rejected because its processor and timeout model do not suit long-running audio processing.

## Consequences

- The WebRTC dependency must be reproducibly patched while preserving JNI libraries and supported ABIs.
- Capture synchronization, reconnects, mute behavior, route changes, and app lifecycle require physical-device validation.
- A real speech-to-text provider and credentials are required for real transcripts. Missing configuration must produce an actionable failure, never fabricated output.
- Private storage, retention/deletion, upload limits, queue capacity, and worker concurrency require explicit configuration.
- Logs must not contain raw audio, transcripts, summaries, credentials, or signed storage URLs.
- Existing call signaling and unrelated uncommitted work must remain intact.

## Verification

Not yet verified. Release evidence must cover native build/D8 and supported ABIs; physical-device dual-track capture and synchronization; reconnect, mute, route, background, disk, queue, and upload failures; participant authorization; job idempotency and lease recovery; real-provider transcription and summary integration; mobile processing/error/retry/playback UI; and a local Gradle/ADB end-to-end run.
