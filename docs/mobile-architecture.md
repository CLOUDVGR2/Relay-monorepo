# Relay Mobile Architecture

## 1. Runtime model

Relay Mobile is an Expo/React Native TypeScript application targeting Android and iOS. The current source tree is organized around screens, shared UI components, hooks, transport libraries, navigation types and theme tokens. The Compose `mobile` service runs the Expo development server; it is not a production-distributed native application binary.

## 2. Source ownership

| Path | Responsibility |
|---|---|
| `App.tsx` | Native application entry and composition |
| `src/screens/` | Authentication, conversation, call, task, AI, activity and notification screens |
| `src/components/` | Shared screen primitives and incoming-call overlay |
| `src/hooks/useCallMedia.ts` | Media-session and call/recording lifecycle coordination |
| `src/lib/api.ts` | Axios API client and bearer token handling |
| `src/lib/graphql.ts` | GraphQL transport and operations |
| `src/lib/realtime.ts` | Socket.IO connection lifecycle |
| `src/lib/offline-message-cache.ts` | Local message caching |
| `src/lib/call-audio-recorder.ts` | Native audio capture integration |
| `src/lib/call-recording-api.ts` | Recording upload API operations |
| `src/lib/call-recording-recovery.ts` | Local recovery state and retry workflow |
| `src/navigation/` | Navigation types |
| `src/theme/` | Theme/color tokens |

## 3. Network configuration

The API origin is configured through `EXPO_PUBLIC_API_URL`, for example:

```dotenv
EXPO_PUBLIC_API_URL=http://<host-reachable-address>:8090/api
```

Typical local development origins differ:

| Runtime | Host alias commonly used |
|---|---|
| iOS simulator | `localhost` on the host machine |
| Android emulator | `10.0.2.2` for host loopback |
| Physical device | Host LAN IP or HTTPS development endpoint |

Use the actual device/simulator networking environment. An Expo bundler connection does not prove the API host can be reached. Do not include server secrets in `EXPO_PUBLIC_*` values.

## 4. Authentication

Native HTTP requests use the bearer-token mode supported by Express and NestJS. `api.ts` centralizes token attachment and API error handling. Keep token handling centralized; do not duplicate credentials in screen state or log authorization headers. Logout/session expiry must clear local authentication state and respect the server's account/session semantics.

GraphQL and Socket.IO have independent transport entry points. Validate the authenticated identity and authorization context for all three transports.

## 5. Realtime behavior

`realtime.ts` manages Socket.IO lifecycle. Reconnection, stale session IDs, handshake authentication, user-room routing and event deduplication should be validated separately from HTTP tests. The UI should distinguish connection loss from an empty conversation or missing data.

## 6. Calls and recording

The native media flow spans:

1. server-owned call state and participant authorization;
2. consent-aware media-session authorization;
3. local media acquisition and audio route lifecycle;
4. local recording capture;
5. upload session creation/refresh and file transfer;
6. completion metadata validation;
7. local recovery when upload or finalization fails;
8. asynchronous server-side transcription/analysis.

“Call ended” does not mean “recording uploaded” or “recording processed.” UI states should reflect the server lifecycle rather than infer completion from a button press. Test app background/foreground, process termination, device storage pressure, permission denial, network interruption and retry.

## 7. Local persistence and privacy

The local message cache and recording-recovery state improve resilience, but their retention and protection should be reviewed. Avoid persisting credentials or raw audio outside an approved secure lifecycle. Clear user-scoped caches on logout/account switch. Validate SQLite/secure-storage behavior on physical devices and OS upgrades.

## 8. Development and verification

```bash
pnpm install
pnpm dev:mobile
pnpm typecheck:mobile
pnpm --dir apps/mobile lint
```

The Expo Metro port, device connection and API origin are separate. For release readiness, add platform-specific Android/iOS build, signing, permission, push-notification, WebRTC, offline and recording-recovery evidence. Typecheck and lint do not replace device validation.
