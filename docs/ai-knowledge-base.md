# Relay AI and Knowledge Architecture

## Service boundary

The Python AI service is a FastAPI application. It exposes versioned routes for AI status, incident intelligence, conversation analysis, tenant-scoped document workflows, and multi-agent task lifecycle operations. Internal endpoints use bearer authentication. Tenant-scoped operations additionally resolve a Relay user identity to a tenant record.

## Retrieval-augmented generation

The document workflow is composed of distinct stages:

1. **Ingestion** — validate document metadata and content, resolve tenant ownership, and persist the document record.
2. **Chunking** — split source content into bounded retrieval units while retaining document identity and source metadata.
3. **Embedding** — produce vectors using the configured embedding implementation.
4. **Persistence** — store chunk text, metadata, and vector representations in PostgreSQL with pgvector.
5. **Retrieval** — embed a query and rank candidate chunks within the resolved tenant.
6. **Context construction** — assemble selected evidence with source references and a bounded context budget.
7. **Generation** — invoke the configured model provider and produce a response grounded in retrieved content.
8. **Citation serialization** — return source metadata associated with the retrieved evidence.

Tenant filtering is performed at the retrieval boundary. A user identity header is not an authorization credential; the service bearer token authenticates the internal caller.

## Provider abstraction

The service declares LiteLLM and LangGraph dependencies and isolates provider selection behind provider/factory modules. This creates a boundary between workflow logic and model-provider configuration. Model name, provider endpoint, credentials, timeout, and output validation are runtime configuration concerns.

## Incident intelligence

The incident domain persists incident lifecycle state and evidence. Investigation workflows produce structured traces and support explicit approval before execution of remediation actions. The API separates investigate, approve, execute, and recover operations so that proposed actions and authorized execution are distinct steps.

## Conversation analysis

Conversation analysis accepts transcript content and produces structured analysis artifacts such as summaries, decisions, and action items. It should be treated as derived content; the original conversation remains the source record.

## Multi-agent execution

The multi-agent API persists task records and exposes lifecycle state, progress, results, error codes, and timestamps. A dedicated worker coordinates execution through agent and provider abstractions. Internal lease/worker fields are excluded from the task response model.

## Persistence and migrations

SQLAlchemy async, asyncpg, Alembic, and pgvector support the Python service's relational data layer. Migration files establish schema evolution for tenant mapping, documents, incidents, embeddings, and multi-agent tasks. Migration ordering is part of the service release contract.

## Security and quality properties

- Authenticate internal callers independently from tenant identity.
- Resolve tenant ownership before querying documents or chunks.
- Keep retrieval and model context tenant-scoped.
- Treat document text and model outputs as untrusted.
- Validate tool calls and structured model outputs.
- Bound chunk count, retrieval depth, prompt size, token usage, provider concurrency, and workflow timeout.
- Preserve source references so generated answers can expose evidence.
