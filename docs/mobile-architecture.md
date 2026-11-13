# Relay Mobile Architecture

## Runtime and framework

The native client is an Expo application implemented with React Native and TypeScript. Its package manifest includes Expo SDK 57, React Native 0.86, React Navigation, Expo SecureStore, SQLite, Notifications, FileSystem, Speech, and `react-native-webrtc`.

The app is organized around screen modules, navigation types, reusable UI components, call/media hooks, and shared networking libraries.

## Screen domains

- Authentication and account access.
- Conversations and message history.
- Calls and incoming-call presentation.
- AI assistant and multi-agent task workflows.
- Task management.
- Activity inbox and notification preferences.

## HTTP networking

`src/lib/api.ts` creates a shared Axios client. The base URL is read from `EXPO_PUBLIC_API_URL`, normalized without a trailing slash, and extended with `/api` by callers through the shared base URL. The client uses a 12-second timeout, JSON headers, and an in-memory bearer token. Native requests disable browser credential cookies.

The response interceptor routes HTTP 401 responses to the registered unauthorized handler. Network failures and timeouts are normalized into user-readable messages.

For physical devices, the API hostname must be reachable from the device network. A device's `localhost` points to the device, not the development workstation. The public API origin must be served by a reachable gateway or host port-forward.

## Realtime transport

`src/lib/realtime.ts` creates a Socket.IO client using the API origin and supplies the native access token in the handshake `auth` object. Reconnection is enabled with a capped delay. The configured transport is polling, and development logs expose connection lifecycle diagnostics without requiring message payload logging.

## Calls and recording

The mobile call experience is coordinated by `hooks/useCallMedia.ts`, `components/IncomingCallOverlay.tsx`, and `screens/CallsScreen.tsx`. Audio capture and recording utilities are isolated under `src/lib/`. Recording recovery and upload API concerns are separated into dedicated modules.

Call authorization is server-owned. Client-side consent and media state must not be treated as a substitute for server verification. Recording upload completion is finalized by the NestJS API and downstream processing services.

## Local persistence and privacy

The client includes an offline message cache and recording recovery support. SecureStore is available for sensitive native key/value data; SQLite provides structured local persistence. Persistent local data should be scoped to the authenticated account and cleared or invalidated at the authentication boundary.

## Build and verification

```bash
pnpm --dir apps/mobile typecheck
pnpm --dir apps/mobile lint
pnpm dev:mobile
```

Native builds and device behavior should be verified on the target OS and device class. Expo bundler reachability and API reachability are separate network paths.
