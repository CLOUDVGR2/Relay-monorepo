# ADR 0002: Call Recording, Transcription, and Summaries

- **Status:** Accepted
- **Scope:** native media capture, consent, call lifecycle, object storage, and asynchronous processing
- **Decision owners:** calls/media domain, mobile, and AI processing maintainers

## Context

Call recording crosses the device media runtime, participant consent, call state, upload transport, durable object storage, and downstream transcription/analysis. These stages have different latency and failure semantics. A call can end while local recording finalization, transfer, metadata validation, storage, or asynchronous processing is still incomplete.

## Decision

Separate the workflow into explicit stages:

1. The NestJS call domain manages call lifecycle and participant recording consent.
2. An internal media-session authorization endpoint provides the server-owned recording authorization decision.
3. The native client captures local audio and coordinates recovery with the call lifecycle.
4. NestJS recording-upload APIs create/refresh upload sessions and validate completion metadata.
5. The recording storage adapter abstracts the configured S3-compatible object storage.
6. A dedicated Python recording worker retrieves stored audio and performs transcription/analysis workflows.
7. Recording metadata, tracks, transcript, summary, and processing state are persisted independently of the client UI.

## Alternatives

- **Synchronous transcription in the call API:** rejected because model processing duration and resource usage should not occupy the interactive request path.
- **Persist media only on the device:** rejected because it does not provide durable server-side processing or cross-device access.
- **Treat call termination as recording completion:** rejected because capture finalization, upload completion, object persistence, and processing are distinct stages.
- **Authorize solely in the client:** rejected because consent and recording permission must be enforced by the server-owned domain boundary.

## Consequences

### Benefits

- call lifecycle remains responsive while media processing proceeds asynchronously;
- retries can target the failed stage rather than restarting the entire call;
- consent and server authorization are explicit;
- object storage and processing workers can scale independently.

### Trade-offs

- clients must handle local recovery and upload retry state;
- APIs need idempotent completion and lifecycle transitions;
- partial failures require durable status and operator visibility;
- media security, retention, deletion, and access control require additional governance.

## Security and privacy

Recording requires participant consent and server authorization. Object access must be scoped; worker roles should have only required permissions. Avoid logging audio, transcript, signed URLs, tokens, or sensitive call metadata. Retention, deletion, user access, legal hold, and jurisdictional requirements must be defined by product/legal/security owners before production use.

## Verification

Implementation references include `apps/mobile/src/lib/` and hooks, `services/nest-api/src/conversations/`, and `services/ai-service/app/recordings/`. Relevant tests cover call state, upload, storage, transcription, and recording-worker behavior. Review exact test scope before treating a production path as proven.

## Revisit conditions

Revisit if the recording provider, media architecture, consent model, storage policy, transcription pipeline, or regulatory obligations change materially.
