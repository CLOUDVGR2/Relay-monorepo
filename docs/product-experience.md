# Relay Product and Experience Architecture

## Experience model

Relay presents collaboration and operational intelligence through two client experiences:
- a React browser application optimized for workspace navigation, messaging, AI interaction, and operational views;
- an Expo / React Native application designed for native access to collaboration, calls, tasks, notifications, and AI assistance.

The experiences share server-owned domain contracts while adapting interaction patterns to browser and mobile platform conventions.

## Information architecture

### Collaboration
Authentication, user discovery, conversations, message history, realtime updates, and notification preferences form the primary collaboration surface.

### Work
Tasks, checklists, task links, job history, and asynchronous workflow progress support user work coordination.

### Intelligence
The AI assistant, document knowledge, conversation analysis, incident intelligence, and multi-agent task views expose model-assisted workflows as distinct product capabilities.

### Operations
The web workspace organizes platform overview, intelligence, AI runs, infrastructure, jobs/workflows, analytics, and knowledge. Operational interfaces distinguish health signals, workflow state, and analytical summaries.

## Web design system

The web application uses shared primitives in `apps/web/src/components/ui/`, design tokens in `src/styles/tokens.css`, and global accessibility behavior in `src/styles/accessibility.css`.

The shared component set includes buttons, inputs, cards, badges, and supporting UI primitives. Components expose consistent variants, loading states, labels, helper text, error descriptions, and semantic container options.

Design tokens centralize spacing, radii, focus-ring treatment, and transition timing. DaisyUI/Tailwind provide the styling foundation and theme system.

## Accessibility and interaction quality

The codebase includes:
- visible keyboard focus styles;
- skip-link and visually-hidden utilities;
- touch-target sizing with coarse-pointer behavior;
- reduced-motion preferences;
- responsive overflow safeguards;
- semantic labels and described-by relationships in form controls;
- loading and disabled states in shared buttons.

These are implementation foundations intended to support accessible interaction. Conformance claims require automated and manual testing across representative pages, assistive technologies, and input modes.

## Mobile interaction architecture

Native screens are separated by domain. Shared screen/UI components and navigation types provide consistent structure. The call experience uses a dedicated media hook and incoming-call overlay; network and realtime clients are centralized to avoid duplicating authentication and connection policy across screens.

Native interaction design must account for permission prompts, app foreground/background transitions, network changes, audio focus, device-specific WebRTC behavior, and recoverable upload state.

## UX state model

Interactive screens should model at least:
- initial/loading state;
- populated state;
- empty state;
- validation state;
- recoverable network/dependency error;
- authorization/session-expired state;
- asynchronous in-progress and completed states.

For long-running AI, upload, and job operations, expose durable progress and status rather than relying on a single transient request lifecycle.

## Design-system evolution

New UI should reuse tokens and primitives, preserve keyboard/touch accessibility, support responsive layouts, and include component tests. Product-level changes should be validated in the context of navigation, loading behavior, error recovery, and real API contracts.
