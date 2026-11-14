# Relay Native Mobile Application

## Purpose

Relay Mobile is an Expo / React Native TypeScript client for Android and iOS. It presents authenticated collaboration, calls, tasks, notifications, activity and AI assistance while delegating identity, authorization and durable business state to Relay services.

## Architecture map

| Path | Responsibility |
|---|---|
| `App.tsx` | Application entry |
| `src/screens/` | Product screens |
| `src/components/` | Shared UI and incoming-call presentation |
| `src/hooks/useCallMedia.ts` | Call media/session and recording coordination |
| `src/lib/api.ts` | Shared authenticated HTTP client |
| `src/lib/graphql.ts` | GraphQL transport |
| `src/lib/realtime.ts` | Socket.IO lifecycle |
| `src/lib/offline-message-cache.ts` | Local message cache |
| `src/lib/call-audio-recorder.ts` | Audio capture |
| `src/lib/call-recording-api.ts` | Recording upload API |
| `src/lib/call-recording-recovery.ts` | Local upload/finalization recovery |
| `src/navigation/` | Navigation types |
| `src/theme/` | Shared visual tokens |

## API configuration

Create `apps/mobile/.env` with a device-reachable API origin:

```dotenv
EXPO_PUBLIC_API_URL=http://<reachable-host>:8090/api
```

Use `localhost` only when the simulator can resolve it to the development host. Android emulators commonly use `10.0.2.2`; physical devices require a host LAN address or HTTPS endpoint reachable over the network. Never put internal service tokens or server credentials in an `EXPO_PUBLIC_*` variable.

## Authentication and transport

Native API requests use bearer authentication through the shared Axios client. GraphQL and Socket.IO are separate transports and must be tested separately. Do not create per-screen token stores or log auth headers. Server middleware remains responsible for authorization even if the client hides an operation.

## Calls and recording

Call lifecycle, participant consent, media authorization, recording upload and asynchronous transcription are different stages. The mobile client must surface consent, permission, upload, retry and recovery state without treating call termination as recording completion. Test Android/iOS permissions, background/foreground, interrupted network, app process death, audio route changes and storage constraints on devices.

## Development and verification

```bash
pnpm install
pnpm dev:mobile
pnpm typecheck:mobile
pnpm --dir apps/mobile lint
```

The Compose `mobile` workload starts Expo Metro for development. It does not replace signed Android/iOS release builds, store submission, device test matrices or native lifecycle verification.
