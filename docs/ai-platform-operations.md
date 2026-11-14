# AI Platform Operations

## 1. Runtime components

| Workload | Compose service | Purpose |
|---|---|---|
| FastAPI | `ai-service` | Health/status and internal AI HTTP APIs |
| Multi-agent process | `multi-agent-worker` | Asynchronous task coordination/execution |
| Recording process | `recording-worker` | Recording transcription and analysis |
| Persistence | `postgres`, `redis`, `rustfs` | AI records/vectors, coordination, objects |
| Caller/facades | `express-api`, `nest-api` | User authentication and product-facing HTTP boundaries |

Workers are not children of the FastAPI process. Monitor and restart them independently.

## 2. Configuration inventory

The exact required/optional values are defined by `compose.yaml`, `services/ai-service/.env.example`, and `app/core/config.py`. Important configuration families include:

| Family | Environment variables (examples from source/manifests) | Operational concern |
|---|---|---|
| Database | `DATABASE_URL` | Connection pool, SSL and migration compatibility |
| Internal auth | `PYTHON_AI_INTERNAL_TOKEN` | Service credential distribution/rotation |
| Cache/coordination | `REDIS_URL` | Worker lease, progress and transient state |
| Generation | `AI_PROVIDER`, `OLLAMA_BASE_URL`, `OLLAMA_GENERATION_MODEL`, `OLLAMA_GENERATION_TIMEOUT`, `LITELLM_MODEL`, `LITELLM_TIMEOUT`, `AI_PROVIDER_API_KEY`, `LITELLM_API_BASE` | Provider availability, latency and data policy |
| Embeddings | `EMBEDDING_PROVIDER`, `LITELLM_EMBEDDING_MODEL`, embedding API base/timeout/dimension settings | Vector compatibility and re-embedding policy |
| Multi-agent | `MULTI_AGENT_PROVIDER`, `MULTI_AGENT_MODEL`, `MULTI_AGENT_TIMEOUT_SECONDS`, `LOG_LEVEL` | Execution bounds and provider selection |
| Recording | `CALL_RECORDING_STORAGE_ENDPOINT`, bucket/region/access key settings, `WHISPER_MODEL_SIZE`, `WHISPER_DEVICE`, `WHISPER_COMPUTE_TYPE`, CPU threads and lease/heartbeat/retry settings | Object access, audio model resource consumption and job recovery |
| Browser origin | `CLIENT_URL` | Credentialed CORS allowlist |

Do not copy actual secret values into operational documentation, issue trackers or logs.

## 3. Health and readiness

- `GET /healthz`: application liveness; suitable for process/container checks.
- `GET /readyz`: dependency readiness according to the AI service implementation.
- `GET /v1/ai/status`: provider/configuration status, protected by internal bearer authentication.
- `GET /internal/metrics`: protected process-local HTTP request counters, errors and bounded latency samples.

The Compose healthcheck uses `/openapi.json` as a process response check; that healthcheck is not equivalent to dependency readiness. Use `/readyz` for service-specific readiness and inspect dependency health separately.

## 4. Document ingestion diagnostics

1. Confirm Express `/api/ai/documents` receives an authenticated request.
2. Confirm Express has `PYTHON_AI_INTERNAL_TOKEN` and the correct Python base URL.
3. Confirm the Python service receives the internal bearer and valid Relay identity header.
4. Check ingestion logs for document processing/embedding errors without logging raw document content.
5. Verify document status, chunk count, tenant mapping and embedding count in PostgreSQL.
6. Confirm vector dimension and embedding provider configuration.

An HTTP 201/complete document status must be corroborated with nonzero chunks and embeddings before assuming the document is searchable.

## 5. Search and answer diagnostics

Separate failures into stages:

| Stage | Evidence | Diagnostic question |
|---|---|---|
| Client → Express | Browser Network panel or mobile API error | Did the authenticated answer request reach Express? |
| Express → Python | Express logs and HTTP status | Did internal URL/token configuration work? |
| Tenant context | Redacted Relay identity / tenant lookup result | Is the expected identity being forwarded? |
| Query embedding | Embedding service logs/error | Can the configured embedding provider return the expected 768 dimensions? |
| Retrieval SQL | Result count, candidate metadata | Do vector and keyword queries return appropriate evidence? |
| Generation | Provider response/timeout class | Did the generator produce valid JSON in time? |
| Citation validation | Retrieved IDs vs cited IDs | Are returned citations among the retrieved chunks? |
| Uploader attribution | Express user lookup by citation uploader IDs | Does every source map to a profile display name? |

The mobile and web product clients should normally call the grounded answer endpoint. A separate diagnostic search request is not required for an ordinary answer flow.

## 6. Shared Knowledge Base operations

In the current implementation, upload/list/detail paths remain user-tenant scoped while answer/search use shared cross-tenant retrieval. Verify that users understand the shared corpus and that data submitted is suitable for broad authenticated visibility. Uploader attribution is informational only. There is no hidden ACL in the retrieval query.

When a document is reported missing:

- verify the uploader identity and tenant record;
- verify the document and chunk rows;
- verify embeddings and search vectors;
- compare a generic semantic query and exact keyword query;
- inspect the answer citation content, not only the generated answer;
- distinguish retrieval miss from generation misinterpretation.

Do not “fix” visibility by disabling every tenant predicate globally. Only search/answer are cross-tenant in the current product behavior.

## 7. Incident intelligence diagnostics

Confirm tenant mapping, incident lifecycle status, evidence record creation, investigation output, approval state and action execution. Creation initializes a supported scenario but does not execute remediation. Treat approval/execution boundaries as security-sensitive. Inspect provider/tool configuration and reject unsafe or unsupported actions.

## 8. Multi-agent diagnostics

Inspect task status, progress phase/steps, attempt count, error code, created/started/finished timestamps, worker health, Redis lease and PostgreSQL row. Distinguish queued, running, completed and failed. Avoid manually editing internal lease/fencing data. A stale lease should be handled by the worker's documented recovery path; any manual intervention requires evidence and an idempotency check.

## 9. Recording worker diagnostics

Trace in order: recording consent, media-session authorization, upload-session creation/refresh, client upload, completion request, object verification, database processing state, worker claim/heartbeat, object retrieval, transcription, analysis and final state. A call-end event alone does not prove successful upload or processing. Check model cache and device/compute configuration for resource exhaustion.

## 10. Provider and capacity controls

Bound query top-k, content size, transcript size, multi-agent step count and timeouts. Track model/provider latency and error rate, embedding failures, request concurrency, token/compute use and queue age. Choose hosted versus local inference based on data-handling policy, quality, latency, capacity and cost. Avoid unbounded retries or concurrent worker scaling beyond database/provider capacity.

## 11. Security controls

- Keep Python APIs internal; do not publish port 8000 publicly unless a separately approved access layer is present.
- Rotate internal bearer tokens and use independent credentials per service/environment where supported.
- Validate Relay identity IDs and tenant scope.
- Protect database and object-store credentials through deployment secret systems.
- Avoid logging prompts, transcripts, document content, auth headers and signed URLs.
- Review shared-retrieval scope before ingesting sensitive content.
