# Relay Native Mobile Application

## Overview

Relay Mobile is an Expo and React Native client for Android and iOS. It provides native access to collaboration, messaging, calls, tasks, AI assistance, notifications, and activity workflows while reusing server-owned domain APIs.

## Source map

| Path | Responsibility |
|---|---|
| `App.tsx` | Native application entry |
| `src/screens/` | Authentication, conversations, calls, tasks, AI, notifications, activity |
| `src/components/` | Shared screen and incoming-call UI |
| `src/hooks/useCallMedia.ts` | Call media lifecycle and recording coordination |
| `src/lib/api.ts` | Shared Axios API client and auth handling |
| `src/lib/realtime.ts` | Socket.IO lifecycle |
| `src/lib/graphql.ts` | GraphQL client operations |
| `src/lib/call-audio-recorder.ts` | Native audio recording |
| `src/lib/call-recording-api.ts` | Recording upload API |
| `src/lib/call-recording-recovery.ts` | Local recovery workflow |
| `src/lib/offline-message-cache.ts` | Local message cache |
| `src/navigation/` | Navigation types |
| `src/theme/` | Theme tokens |

## API configuration

Create `apps/mobile/.env` with:

```dotenv
EXPO_PUBLIC_API_URL=http://<reachable-host>:8090/api
```

The configured URL must be reachable from the physical device. The Expo bundler and API gateway are separate network endpoints. A successful Metro connection does not prove API reachability.

The app uses bearer authentication for native HTTP requests. Do not place server-side secrets in `EXPO_PUBLIC_*` variables.

## Development

```bash
pnpm install
pnpm dev:mobile
```

For an Android development build, ensure the device has USB debugging enabled and the matching development client installed. Use the Expo CLI's device selection or Android launch command after confirming the API URL and host network route.

## Verification

```bash
pnpm typecheck:mobile
pnpm --dir apps/mobile lint
```

Validate native permissions, notifications, WebRTC behavior, recording lifecycle, background/foreground transitions, and upload recovery on physical devices for the supported OS versions.
