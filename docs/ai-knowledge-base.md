# Relay AI and Knowledge Architecture

## 1. Scope

The Python AI service is a separately deployed FastAPI application. It owns AI-specific processing and persistence for document retrieval, grounded answers, conversation analysis, incident intelligence, and multi-agent task execution. Express and NestJS expose authenticated product-facing facades; internal bearer authentication protects the Python service boundary.

## 2. Component map

| Module | Responsibility |
|---|---|
| `app/rag/chunking.py` | Split document content into retrieval passages and metadata offsets |
| `app/rag/ingestion.py` | Validate and persist documents/chunks and obtain embeddings |
| `app/rag/embeddings.py` | Select embedding client/provider independently from generation |
| `app/rag/retrieval.py` | Semantic and keyword candidate retrieval, reciprocal-rank fusion, overlap handling |
| `app/rag/generation.py` | Ollama- or LiteLLM-backed answer generation |
| `app/rag/answering.py` | Evidence assembly, model-response parsing, citation validation and narrow deterministic rule |
| `app/rag/routes.py` | Ingest, search, answer, list and detail HTTP endpoints |
| `app/agentops/` | Incident workflows, providers/tools and transcript analysis |
| `app/multi_agent/` | Task contracts, agents, coordinator, provider adapters, persistence and worker |
| `app/recordings/` | Object retrieval, transcription, repository and recording worker |

The API process, multi-agent worker and recording worker are separate runtime processes in Compose. Do not run all long-running workloads inside a user-facing HTTP worker.

## 3. Retrieval-augmented generation lifecycle

### Ingestion

1. Express validates title/content/source URI and calls the internal Python document endpoint.
2. Python verifies its internal bearer credential and validates the Relay user identity.
3. The service resolves the uploader's AI tenant.
4. Content is chunked; the service obtains vectors from the configured embedding provider.
5. Document and chunk records, metadata, search vectors and embeddings are stored in PostgreSQL.
6. The response exposes document status and metadata, not model/provider secrets.

The current Express document facade allows title up to 500 characters, content up to 1,000,000 characters, and optional source URI up to 2,048 characters. Treat those as request limits, not recommended document sizes.

### Retrieval

The current retrieval implementation:

1. embeds the normalized query;
2. executes vector similarity over non-null embeddings;
3. executes PostgreSQL full-text search using `plainto_tsquery('english', ...)` against generated `tsvector` content;
4. collects a bounded candidate set for each path;
5. merges ranks with reciprocal-rank fusion (RRF);
6. sorts by fused score;
7. prefers non-overlapping passages and fills remaining slots with deferred candidates when required.

The current embedding dimension is 768. Model changes that alter dimension or vector semantics require re-embedding and migration planning; a dimension-compatible model change can still degrade similarity quality and must be evaluated.

### Answer generation and citation controls

The answerer supplies evidence metadata and passage content to the configured generator. The model response must be JSON with an `answer` and `cited_chunk_ids`. The service validates response shape and filters citation IDs to those actually retrieved. If no retrieved evidence or no valid cited IDs remain, the service abstains.

Citation validation proves that a citation came from the retrieved set. It does not prove that every sentence in the answer is entailed by the cited content. Evaluation should therefore include fact-level grounding checks, abstention quality, relevance and adversarial prompt-injection cases.

### Deterministic operating-hours rule

The current answer layer includes a narrow deterministic extraction rule for explicit operating-hour schedules. For a question asking when an entity closes on a single weekday, it identifies a matching weekday row in an operating-hours section and returns that day's final clock time (or `closed`). It does not treat class/event schedules as closing-time data. Conflicting extracted values produce a conflict response. Questions about class start times do not enter this rule and are delegated to generation.

This safeguard addresses a specific category of ambiguity; it is not a general knowledge parser or a guarantee against hallucination in other domains. Regression tests cover Thursday closing, Saturday closing and Thursday class start behavior.

## 4. Provider separation

Embedding and generation providers are independent selection points:

- `EMBEDDING_PROVIDER` supports `ollama` and `litellm`; when unset, the embedding implementation preserves compatibility with existing AI provider configuration and defaults.
- `AI_PROVIDER` selects the answer generation integration; `litellm` selects LiteLLM generation, otherwise the default path is Ollama.
- The Ollama generation client defaults to `qwen2.5:3b-instruct`, reads `OLLAMA_BASE_URL`, applies a bounded timeout and requests non-streamed JSON-compatible chat output.
- LiteLLM generation reads `LITELLM_MODEL`, `AI_PROVIDER_API_KEY`, `LITELLM_API_BASE` and `LITELLM_TIMEOUT`.
- Embedding configuration includes provider-specific model/base/dimension/timeout settings.

The actual provider/model depends on the runtime environment. Do not state a single production model unless deployment configuration proves it.

## 5. Tenant and shared-corpus behavior

The AI service has a Relay-user-to-tenant mapping. Document ingestion, list and direct document lookup are tenant-scoped. Current search and answer endpoints intentionally invoke retrieval without a tenant filter, making the document corpus searchable by all authenticated Relay users who reach the Express/Nest facade. The uploader ID is carried with the retrieved evidence and Express resolves it to a user display name for attribution.

This is shared-corpus behavior, not ACL enforcement. The current retrieval query does not apply organization, group, classification, project, or per-document visibility filters. Do not use the corpus for sensitive or customer-isolated data until that access model is designed and enforced in vector and full-text retrieval.

Incident and multi-agent records remain tenant-scoped. Do not infer that shared document retrieval changes those domains.

## 6. Incident intelligence

The Python incident domain stores tenant-associated incidents and evidence records. The currently implemented create scenario is `api-latency-spike-v1`; it initializes a synthetic API-latency incident/evidence set. The lifecycle separates:

1. incident creation;
2. investigation;
3. approval;
4. remediation execution;
5. recovery.

Creating an incident does not execute remediation. Review the supported actions and authorization checks before integrating real infrastructure changes. The workflow should be treated as a controlled operational simulation/automation boundary unless an environment explicitly configures and verifies production tool adapters.

## 7. Conversation analysis

The internal conversation-analysis endpoint accepts 1–100 messages with a maximum aggregate transcript size of 50,000 characters. The NestJS service validates transcript count, sender/text length and aggregate size before calling Python. Output is structured as a summary, decisions, and action items with optional owner and due-date values. Treat generated action items as suggestions until a user or downstream workflow validates them.

## 8. Multi-agent execution

The multi-agent API validates prompt length, max steps and timeout, then creates a durable task for asynchronous execution. Task records include status, bounded progress, result, error code, attempt count and lifecycle timestamps. Worker internals include claim/lease identifiers and expiration data that are excluded from the public response. Redis coordinates leases/progress and PostgreSQL is the task record of truth.

Provider adapters and the coordinator define agent behavior. A task may fail due to invalid input, provider errors, timeout, lease loss or persistence errors. Consumers should poll the public task state and handle terminal failure; they must not assume a `201` response means the task is complete.

## 9. Persistence and migration

AI models are defined in `app/models/`; schema migrations are in `migrations/versions/`. Current models include tenant, document, document chunk, incident/evidence and multi-agent task. SQLAlchemy async sessions are created through `app/db/session.py`. Use Alembic for schema evolution; preserve the document/chunk composite tenant constraint and embedding dimension compatibility.

## 10. Security and quality requirements

- Internal bearer validation is required for protected AI endpoints.
- Relay identity headers are untrusted until validated and are not a substitute for bearer authentication.
- Document content and generated output are untrusted data.
- Model output must pass strict schema and citation-ID checks.
- Shared Knowledge Base retrieval requires explicit data-sharing governance.
- Use bounded prompts, input sizes, top-k, steps, timeout and concurrency.
- Do not log raw document content, prompts, transcripts, model credentials or signed storage URLs by default.

## 11. Quality evaluation matrix

| Dimension | Evaluation approach | Failure signal |
|---|---|---|
| Ingestion integrity | Confirm expected document/chunk counts and tenant IDs | Missing/duplicate chunks or wrong owner |
| Embedding integrity | Validate model/dimension and embedding presence | Null, wrong-dimension or model-version drift |
| Retrieval relevance | Curated query set with relevant passages and ranking metrics | Relevant facts not retrieved or unrelated top results |
| Grounding | Claim-to-citation support review and automated factual assertions | Unsupported claim or citation mismatch |
| Abstention | Questions with absent/ambiguous evidence | Confident unsupported answer |
| Access isolation | Cross-user tests for all tenant-scoped domains; shared retrieval tests for intended visibility | Data returned outside approved policy |
| Robustness | Provider timeout, malformed JSON, empty vector, database failure | Unbounded hangs or malformed public response |
| Security | Prompt injection, document poisoning, cross-document leakage | Instructions from evidence executed or data disclosed |
| Cost/latency | Token, embedding, provider and wall-clock instrumentation | Unbounded spend or unpredictable tail latency |

## 12. Source references

`services/ai-service/app/rag/`, `app/agentops/`, `app/multi_agent/`, `app/recordings/`, `app/core/security.py`, `app/schemas/`, `app/models/`, `migrations/versions/`, and the corresponding `tests/` suites are authoritative.
