# Relay Mobile

React Native companion for Relay, built with Expo. This initial mobile slice shares the existing Express API and account database with the React/Vite web app; it does not create a separate mobile backend or duplicate domain logic.

## Implemented workflows

- Sign in and sign up against the existing Relay account system.
- Restore an authenticated session from device secure storage.
- Browse other Relay users and see Socket.IO presence.
- Open a conversation, load a bounded recent page, fetch older pages with a stable cursor, send text messages, and receive real-time incoming messages.
- Ask the existing AI/RAG endpoint questions and view returned source citations.
- Log out locally and remove the device credential.

The mobile app is not yet a complete parity implementation of every web route (infrastructure, analytics, agent workspace, job administration, settings, image upload, and all profile workflows remain separate follow-up work). Each feature should be connected only to a verified API contract and server-side authorization policy.

## Requirements

- Node.js/npm compatible with the repository's tooling.
- iOS Simulator/Xcode for iOS simulator workflows, Android Studio/emulator for Android, or Expo Go where the selected Expo SDK and dependencies support it.
- The Express API reachable from the device, MongoDB and Redis as configured, and the Python AI service configured for AI answers.

## Configure API connectivity

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Set `EXPO_PUBLIC_API_URL` to the full API base URL ending in `/api`:

- iOS Simulator: `http://localhost:5001/api`
- Android Emulator: `http://10.0.2.2:5001/api`
- Physical device: a reachable LAN IP during local development, or an HTTPS API URL in deployed environments.

`localhost` on a physical phone refers to the phone, not the developer's laptop. Ensure the backend is bound to a reachable interface and local firewall rules allow access. Never put credentials or server secrets in `EXPO_PUBLIC_*` variables; Expo embeds these values in the client bundle. Production API traffic must use HTTPS.

## Install and run

From the repository root:

```bash
npm install --prefix apps/mobile
npm run dev:mobile
```

Then use Expo's terminal prompts to open a simulator or scan the development QR code. Alternatively:

```bash
npm run android --prefix apps/mobile
npm run ios --prefix apps/mobile
```

The device and API must be on mutually reachable networks. A native app does not use the browser's same-origin proxy, so it calls the configured API origin directly.

## Authentication and session model

- Browser authentication remains based on the existing HTTP-only `jwt` cookie.
- Native login/signup endpoints (`POST /api/auth/mobile/login` and `/api/auth/mobile/signup`) return a bearer token in addition to the existing public user fields.
- The app stores the token with `expo-secure-store`, attaches it as `Authorization: Bearer …` to HTTP calls, and passes it through Socket.IO's `auth.token` handshake field. It never puts the token in a URL or logs it.
- The Express authentication middleware verifies bearer tokens and cookies through the same JWT verifier. The Socket.IO handshake validates the same token before associating a user identity.
- The AI route permits originless requests only when a bearer credential is present; browser cookie requests continue to use the configured origin policy. Bearer authentication remains subject to server-side authorization and rate limits.
- Current JWTs expire after seven days and are stateless. Logging out deletes the token from this device but does **not** revoke a copied token before its expiry. This is a known limitation inherited from the current JWT design, not a revocation guarantee. A production identity roadmap should add short-lived access tokens, rotating refresh tokens, token-family reuse detection, and server-side revocation before treating mobile sessions as enterprise-grade.

## Reliability, privacy, and performance notes

- HTTP requests have a bounded 12-second client timeout; the AI endpoint can take longer than this and may time out on mobile. If the backend's AI latency routinely exceeds this budget, implement an explicit async/polling contract rather than silently increasing every request timeout.
- Message and AI history are currently held in memory for the current screen/session; the app does not persist private conversation content to local storage.
- Socket reconnection is enabled. On reconnect, use the HTTP history endpoint as the source of truth; transient socket delivery is not a durable queue.
- Lists are rendered with `FlatList`, conversation history is cursor-paginated in batches of 50 (API maximum 100), request concurrency is bounded per screen, message bodies are capped at the server's 5,000-character limit, and AI questions are capped at 2,000 characters.
- Image attachments, offline message queueing, background notifications, biometric gating, deep links to individual conversations, and encrypted local content cache are not implemented.

## Validation

```bash
npm run typecheck:mobile
```

This command requires dependencies installed and checks the TypeScript surface. Before a release, also run Expo prebuild/build for both platforms, exercise authentication against a real staging API, verify the token lifecycle and AI origin policy, test reconnect and duplicate-message scenarios, run accessibility checks on physical devices, and profile startup time, JS heap, memory warnings, and battery/network use. A successful TypeScript check is not a store-build or production-readiness sign-off.

## Related documentation

- [Monorepo overview](../../README.md)
- [Mobile architecture and security](../../docs/mobile-architecture.md)
- [Express API](../../services/express-api/README.md)
