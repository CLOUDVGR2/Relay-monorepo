# Relay Frontend

Relay uses React and Vite for its browser-based chat and operational interface.

## Source map

- `src/main.jsx` — application entry point.
- `src/App.jsx` — top-level application composition.
- `src/pages/` — page-level workflows, including chat, AI, analytics, infrastructure, jobs, and account views.
- `src/components/` — reusable interface, chat, navigation, and operational components.
- `src/lib/axios.js` — shared HTTP client.
- `src/constants/` — frontend constants.
- `src/index.css` — global styles.

Confirm routes, API contracts, and available features in the current source; this directory map is not a guarantee that every integration is enabled in every environment.

## Requirements and development

Install a compatible Node.js release and npm, then run from the repository root:

```bash
npm install --prefix apps/web
npm run dev --prefix apps/web
```

Use the local URL printed by Vite. Configure API origins using the existing project configuration. Values exposed to browser code are public: never place private credentials or server secrets in frontend environment variables.

## Build and quality checks

Run from the repository root:

```bash
npm run build --prefix apps/web
npm run lint --prefix apps/web
npm run test:web
npm run test:e2e:web
npm run preview --prefix apps/web
```

- `build` creates the production bundle.
- `lint` runs ESLint.
- `test:web` invokes the web package’s `test` script, which runs the configured Vitest suite.
- `test:e2e:web` invokes the web package’s `test:e2e` script and runs the configured Playwright suite and may require browser binaries and supporting services.
- `preview` serves the built bundle locally for inspection; it is not a production hosting service.

A script existing in `package.json` does not mean it has passed. Record the command, exit status, and test summary for each verification run.

## Engineering practices

- Keep components focused and state transitions predictable.
- Represent loading, empty, success, and error states explicitly.
- Clean up event listeners and real-time subscriptions when no longer needed.
- Handle request timeouts, expired sessions, failed connections, and stale data.
- Treat API responses as untrusted input. Enforce authorization and tenant isolation on the server, not only in the UI.
- Use semantic HTML, accessible names, visible keyboard focus, readable contrast, and clear error feedback.
- Measure performance before applying memoization, caching, or code-splitting optimizations.
- Never log credentials, session tokens, private messages, or sensitive API responses.

For real-time interactions, do not assume reconnection restores application state or that sending an event proves durable processing.

## Troubleshooting

- **Vite fails to start:** inspect the first error, Node.js compatibility, dependencies, and port availability.
- **API requests fail:** check configured URLs, backend health, CORS, network access, and authentication.
- **Real-time updates stop:** inspect browser network tools, WebSocket configuration, and server logs.
- **Build or tests fail:** run the relevant command independently and verify its environment prerequisites.

Redact secrets and personal data from diagnostic output.

## Related documentation

- [Repository overview](../../README.md)
- [Architecture](../../docs/architecture.md)
- [Implementation and verification status](../../docs/implementation-status.md)
- [Engineering standards](../../docs/engineering-standards.md)
- [Production guide](../../docs/production-guide.md)
- [Security and operations](../../docs/security-and-operations.md)

## Readiness note

This guide describes development workflows, not production certification. Accessibility, security, performance, integration, and deployment readiness require separate evidence from the target environment.
