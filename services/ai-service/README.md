# Relay Python AI Service

**Runtime:** Python / FastAPI
**Role:** internal AI, retrieval, evidence-grounded response, agent operations, and selected background workers.

## 1. Responsibility and boundaries

The service is an internal backend, not a public browser/mobile API. In the normal application path, Express or Nest receives an authenticated request and calls the Python service using the configured internal token plus `X-Relay-User-Id`. The public route allowlist is owned by the Go Gateway.

The AI service contains distinct domains:

| Package | Responsibility |
|---|---|
| `app/rag/` | document ingestion, chunking, embedding, hybrid retrieval, grounded answers |
| `app/agentops/` | incident records, investigation, approval/execution/recovery workflow |
| `app/multi_agent/` | task coordination, agents, worker and progress publication |
| `app/api/` | shared/versioned service status endpoints |
| `app/models/` | SQLAlchemy persistence models |
| `app/schemas/` | request/response contracts |
| `app/db/` | async database session and lifecycle |
| `migrations/` | Alembic schema evolution |

Call-recording processing is packaged as a separate worker image/runtime (see `Dockerfile.recording-worker` and the recording-worker requirements file).

## 2. Request security

Versioned internal routes are protected by `require_internal_token`. User-scoped routes also receive a Relay identity header. Internal service authentication answers “which service may call this endpoint”; the Relay identity header answers “on whose behalf is the operation being performed.” These are separate controls and must both be validated.

Never expose the internal token to a browser/mobile client. Never use a caller-supplied user ID without a trusted upstream authentication boundary. Do not log prompts, transcript content, full document content, or tokens by default.

## 3. Knowledge Base behavior

### Ingestion and ownership

`POST /v1/documents` validates a document payload, resolves the uploader's Relay tenant, chunks content, generates embeddings, and persists document/chunk records. The document-management APIs (`GET /v1/documents` and `GET /v1/documents/{id}`) remain tenant-scoped.

### Shared retrieval

The current search/answer path calls hybrid retrieval without a tenant UUID filter. It can retrieve across documents stored under different Relay tenants. Uploader identity is carried with retrieved evidence and resolved by Express to a Relay profile name. This is **shared Knowledge Base visibility for authenticated users**, not document-level ACL authorization. Do not interpret uploader attribution as a privacy boundary. Product/security owners must confirm policy, consent, retention, and user expectations before broad production use.

### Retrieval and answer quality

- Embeddings must match the configured 768-dimension retrieval contract.
- Retrieval combines pgvector cosine similarity and PostgreSQL full-text search.
- Reciprocal-rank fusion merges candidates and reduces overlapping passages.
- Generation receives retrieved evidence, emits a JSON answer and cited chunk IDs, and the service validates that cited IDs belong to the candidate set.
- Missing evidence or unverified citations leads to an abstention response.
- A narrow deterministic rule handles weekday closing-time questions from explicit operating-hours evidence. Other question types continue through the configured answer generator.

### Provider configuration

Generation and embedding providers are configured separately. The default generation configuration in the supplied example uses LiteLLM with a local Ollama model (`ollama_chat/qwen2.5:3b-instruct`). The embedding path uses a configured 768-dimensional provider/model. Production configuration must explicitly set provider, base URL, model, credentials, deadlines, token limits, and quota controls.

## 4. Other AI workflows

- **AgentOps:** incident create/list/detail, investigation, approval, execution, and recovery operations; execution support is constrained to implemented action types and should not be represented as unrestricted remediation automation.
- **Conversation analysis:** bounded transcript analysis through protected service endpoints.
- **Multi-agent tasks:** bounded prompt, step count, and runtime controls; background execution uses a separate worker process and progress events.

Review the specific schema and route implementation before integrating a new operation. Do not infer a general-purpose agent capability from the existence of the coordinator.

## 5. Local development

From the service directory:

```bash
cd services/ai-service
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env  # populate local-only values; never commit secrets
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The exact application entrypoint and environment settings should be checked against the current Dockerfile and `app/main.py`. For full integration testing, use the root Compose topology so PostgreSQL/pgvector and other dependencies are reachable.

Tests:

```bash
.venv/bin/python -m pytest tests/ -v
```

The root `test:ai-service` script expects `.venv/bin/python` at this location.

## 6. Schema evolution

Use Alembic revisions in `migrations/versions/`. See [the migration guide](migrations/README). Review migration SQL and downgrade behavior; destructive changes require an explicit recovery/forward-fix plan.

## 7. Operational checklist

- [ ] Internal service token is present and rotated through secret management.
- [ ] Relay user identity comes only from trusted upstream auth middleware.
- [ ] PostgreSQL is reachable and required extensions/migrations are present.
- [ ] Embedding and generation providers are reachable with bounded timeouts.
- [ ] Model/embedding dimensions agree with persisted vectors.
- [ ] Retrieval empty-rate, latency, citation validity, and abstention are monitored.
- [ ] Shared corpus visibility and data-sharing policy are approved.
- [ ] Worker processes are deployed and monitored independently from the API.

## Related documents

- [AI Knowledge Base guide](../../docs/ai-knowledge-base.md)
- [AI API reference](../../docs/ai-api-reference.md)
- [AI operations](../../docs/ai-platform-operations.md)
- [Data architecture](../../docs/data-architecture.md)
