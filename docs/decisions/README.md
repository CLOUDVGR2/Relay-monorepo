# Architecture Decision Records

Architecture Decision Records (ADRs) preserve decisions that are expensive to rediscover: service boundaries, data ownership, external contracts, security semantics, persistence, and operational behavior. ADRs are not implementation tutorials and should remain concise enough to review while retaining trade-offs.

## Decision index

| ADR | Decision | Status |
|---|---|---|
| [0001 — Canonical monorepo boundaries](0001-canonical-monorepo-boundaries.md) | one repository with pnpm workspace and independent Go/Python toolchains | Accepted |
| [0002 — Call recording, transcription, and summaries](0002-call-recording-transcription-and-summaries.md) | staged call/consent/upload/storage/worker processing | Accepted |

## Lifecycle

- **Proposed:** alternatives and consequences are under review.
- **Accepted:** the decision is approved and should guide implementation.
- **Superseded:** another ADR replaces all or part of the decision; keep the original for history.
- **Deprecated:** the decision is no longer recommended but not necessarily replaced.

Do not rewrite an accepted ADR to hide a historical decision. Append a clearly marked implementation/status note or create a superseding ADR when the system materially changes.

## When to write an ADR

Create one for a durable cross-service decision, a new external contract, a data-sharing/security boundary, a migration that changes ownership, a major dependency/provider choice, or a significant trade-off with long-term operational consequences. Local refactors and routine bug fixes generally do not require an ADR.

## Required sections

Use [the ADR template](0000-template.md): status, date, owners, context, decision, alternatives, consequences, verification, and related decisions. A decision must say what is selected and what is not selected. Include implementation evidence and known gaps; do not equate a diagram with deployment proof.

## Review checklist

- Is the problem and system context clear?
- Are constraints and affected stakeholders named?
- Are credible alternatives considered?
- Are security, privacy, cost, reliability, and operations consequences stated?
- Are migration and rollback implications documented?
- Are implementation and test references current?
- Is the status explicit and is supersession linked?
