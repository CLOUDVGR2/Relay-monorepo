# Relay Web Application

## Runtime

The browser application is a React 19 single-page application built with Vite. React Router provides navigation, Zustand stores manage selected client state, and the UI uses a shared component system and design tokens.

## Application structure

- `src/App.jsx` — route and application composition.
- `src/pages/` — authentication, chat, profile, AI, jobs, analytics, infrastructure, and operational workspace pages.
- `src/components/` — navigation, conversation, message composition, chat header, operational shell, and reusable UI components.
- `src/store/` — authentication, theme, and chat state.
- `src/lib/` — API client and shared utilities.
- `src/styles/` and `src/index.css` — global styling, tokens, and accessibility rules.
- `src/constants/` — application constants.
- `e2e/` — browser-level authentication scenario.

## API integration

The web application consumes the Relay HTTP and GraphQL contracts and uses Socket.IO for realtime updates. Browser authentication follows the server cookie/session contract. Client-side route guards and state are usability features; server authorization remains authoritative.

The production container uses the web Dockerfile and NGINX configuration. The NGINX layer serves static assets and proxies configured API paths according to `apps/web/nginx.conf`.

## Design system

The UI is organized around shared primitives, consistent tokens, accessible form controls, navigation patterns, empty/loading states, and responsive layouts. Prefer existing primitives and design tokens over page-specific visual rules.

## Development and verification

```bash
pnpm --dir apps/web dev
pnpm --dir apps/web run build
pnpm --dir apps/web run test
pnpm --dir apps/web run test:e2e
```

The Playwright suite uses `playwright.config.js`; Vitest and Testing Library cover component and page behavior. Verify API integration against the intended local or deployed gateway origin.
