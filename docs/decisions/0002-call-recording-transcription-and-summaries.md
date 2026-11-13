# ADR 0002: Call Recording, Transcription, and Summaries

- **Status:** Accepted
- **Scope:** Native media capture, recording authorization, object storage, and asynchronous processing

## Context

Call recording spans device media capture, participant consent, call lifecycle state, upload transport, durable object storage, and downstream transcription/analysis. These concerns have different runtime and failure semantics.

## Decision

Separate the workflow into explicit stages:
1. The NestJS call domain manages call lifecycle and participant recording consent.
2. An internal media-session authorization endpoint provides the server-owned authorization decision.
3. The native client captures local audio and coordinates local recovery with the call lifecycle.
4. The NestJS recording upload API creates/refreshes upload sessions and validates completion metadata.
5. The recording storage adapter abstracts S3-compatible object storage.
6. A dedicated Python recording worker retrieves stored audio and performs transcription/analysis workflows.
7. Recording metadata and processing state are persisted independently of the client UI.

## Consequences

The design separates realtime call state from durable media processing. Upload completion, object existence, metadata validation, worker execution, transcription, and summary generation are distinct lifecycle stages. Retry behavior must be idempotent and observable. Recording access requires explicit consent and scoped storage permissions.

## Alternatives

- Synchronous transcription in the call API: rejected because model processing duration and resource usage should not occupy the interactive request path.
- Persisting media only on the device: rejected because it does not provide durable server-side processing or cross-device retrieval.
- Treating call termination as recording completion: rejected because upload and server-side completion are separate operations.

## Verification

Relevant implementation is under `apps/mobile/src/lib/`, `apps/mobile/src/hooks/`, `services/nest-api/src/conversations/`, and `services/ai-service/app/recordings/`. Service tests cover call, upload, storage, transcription, and recording worker behavior.
