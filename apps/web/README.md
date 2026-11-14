# Relay Web Application

## Purpose and runtime

Relay Web is the browser-facing React single-page application built with Vite. It presents collaboration, work, AI and operational surfaces and consumes server-owned APIs. The production container builds the Vite bundle and serves it from NGINX on container port `8080`.

## Application structure

| Path | Responsibility |
|---|---|
| `src/App.jsx` | Route and top-level application composition |
| `src/pages/` | Authentication, chat, profile, AI assistant, jobs, analytics, infrastructure and operational workspace pages |
| `src/components/` | Navigation, chat, message composition, shell and reusable UI |
| `src/store/` | Authentication, theme and chat state |
| `src/lib/` | HTTP client and shared utilities |
| `src/styles/`, `src/index.css` | Design tokens, accessibility rules and global styles |
| `e2e/` | Browser-level scenario entry points |

## Request routing

In the local/production container topology, NGINX serves static assets and proxies `/api/**`, `/socket.io/**`, `/graphql`, `/calls/**`, `/jobs/**`, `/docs/**` and selected health/diagnostic paths. The Go Gateway then applies its own allowlist and forwards to Express or NestJS. See `nginx.conf` and `services/api-gateway/server.go` together.

Browser authentication follows the configured cookie/session contract. Client-side route guards improve UX only; Express/Nest authorization is authoritative. Keep credentialed CORS origins aligned with `CLIENT_URL`.

## AI answer presentation

The normal Knowledge Base answer flow calls the grounded answer endpoint. It displays the answer and uploader attribution when provided. Retrieval citations remain in the API response for evidence validation and support, but the default answer UI does not render retrieval diagnostics or a supporting-passage panel.

## Design and accessibility

Prefer existing components and tokens. Every interactive state should include loading/empty/error handling, keyboard behavior, accessible name/role, visible focus, responsive layout and text/contrast support. Do not rely on client-side state for access control.

## Development and verification

```bash
pnpm --dir apps/web dev
pnpm --dir apps/web run lint
pnpm --dir apps/web run test
pnpm --dir apps/web run build
pnpm --dir apps/web run test:e2e
```

The current GitHub Actions Web CI runs install, lint, tests and production build for configured `main` branch push/PR events. Check `.github/workflows/web-ci.yml` for exact branch/filter behavior.
