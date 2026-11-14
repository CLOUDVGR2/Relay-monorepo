# Relay Product and Experience Architecture

## 1. Experience model

Relay presents a shared collaboration and operations workspace through a React browser application and an Expo/React Native mobile application. The clients reuse server-owned APIs and identity while adapting navigation, local state, and media behavior to each runtime.

## 2. Information architecture

### Collaboration

- Authentication and profile flows.
- User discovery and conversation selection.
- Message history, composition, read state and edits.
- Realtime connection state and notifications.

### Calls and communication

- Call lifecycle and participant actions.
- Native media/recording integration.
- Consent and upload status reflected from the backend.
- Recording recovery and processing status separate from the call-end action.

### Work management

- Task creation/list/update and checklist interactions.
- Task links and related activity.
- Job submission/history as a distinct asynchronous domain.

### Intelligence

- AI assistant and document-backed questions.
- Incident response/intelligence surfaces.
- Conversation analysis and multi-agent task progress.
- Uploader attribution on cross-user Knowledge Base answers.

### Operations

- Analytics, infrastructure and operational workspace pages.
- Execution history, service readiness and metrics views where configured.

The existence of a page does not imply that every operational metric is backed by a production telemetry pipeline. Check its API and state source.

## 3. Web application architecture

`apps/web/src/App.jsx` composes routing and application shell. `src/pages/` contains experience pages; `src/components/` contains collaboration and operational components; `src/store/` contains authentication, theme and chat state; `src/lib/` contains shared client utilities; `src/styles/` and `src/index.css` define tokens and accessibility rules.

The production Dockerfile builds Vite assets and serves them from NGINX. NGINX serves the SPA fallback and forwards configured routes to the Go Gateway or selected diagnostic endpoints. The API contract remains owned by Express/Nest, not by the SPA.

### Interaction-state expectations

Every async surface should have explicit idle/loading/success/empty/error behavior. Mutations should prevent duplicate submissions where appropriate, preserve actionable error context without leaking internals, and reconcile state with server responses. Realtime UI should distinguish disconnected/reconnecting states from an empty conversation.

## 4. Mobile application architecture

`apps/mobile/src/screens/` contains the primary product screens. `src/lib/api.ts` centralizes HTTP and token behavior; `graphql.ts` and `realtime.ts` own their respective transports. Call media, audio recording, upload and recovery live in dedicated hooks/libraries. The offline message cache is a bounded local data concern rather than a replacement for server persistence.

Native UI must account for keyboard, permission, foreground/background, connectivity, device storage and audio-session lifecycle. Physical-device tests are necessary for camera/microphone permissions, WebRTC/media route behavior, push token registration and recording recovery.

## 5. Design-system responsibilities

- Reuse existing components and theme tokens.
- Keep typography, spacing, colors and interaction affordances consistent.
- Use semantic controls, accessible labels and live regions for state changes.
- Make keyboard/focus navigation and reduced-motion preferences part of acceptance criteria.
- Preserve color contrast in light/dark themes and communicate status with text/icons in addition to color.
- Prefer responsive layouts and progressive disclosure over dense screens.

## 6. Accessibility and inclusive interaction

Accessibility is an engineering contract, not a visual polish phase. Validate:

- accessible names/roles for controls;
- predictable focus order and visible focus;
- keyboard-only operation on web;
- VoiceOver/TalkBack labels and announcements on mobile;
- readable error and validation messages;
- contrast and text scaling;
- motion sensitivity and audio-only alternatives where applicable.

A test suite that checks component render and click behavior is useful but does not establish conformance to a WCAG level or mobile accessibility certification.

## 7. AI interaction patterns

The standard AI answer experience should show the user's question, the answer and uploader attribution when returned. Retrieval diagnostics and passage-level evidence are internal/operational material, not the normal user-facing answer presentation. The backend still retains citations for grounding, traceability and support investigation.

The interface should distinguish a missing answer, a retrieval/provider failure, and a model abstention. The absence of a displayed supporting-source card does not mean evidence was not retrieved or validated.

## 8. UX quality gates

| Area | Acceptance questions |
|---|---|
| Navigation | Can users identify their current domain and return without losing work? |
| Feedback | Are loading, success, empty, retry and error states clear? |
| Form quality | Are constraints explained before submission and validation actionable? |
| Realtime | Does connection loss/recovery avoid duplicate or stale messages? |
| Calls | Are permission, consent, media connection, upload and processing states distinct? |
| AI | Is uncertainty communicated and uploader attribution accurate? |
| Accessibility | Can keyboard and assistive-technology users complete core workflows? |
| Performance | Are assets, lists, message history, charts and media operations bounded? |

## 9. Change management

A visual or interaction change should identify affected routes, state stores, API contracts, responsive breakpoints, accessibility impact and regression tests. Reuse design tokens instead of adding one-off CSS values. Cross-client behaviors should be compared explicitly rather than assumed identical.
