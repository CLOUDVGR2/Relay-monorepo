# Relay Python AI Service

## Responsibility

The Python service is the AI and automation runtime. It exposes FastAPI endpoints for service status, tenant-scoped document intelligence, incident investigation, conversation analysis, and multi-agent task lifecycle operations. It also contains dedicated worker modules for multi-agent execution and call-recording processing.

## Module architecture

| Package | Responsibility |
|---|---|
| `app/api/v1/` | Versioned status and service endpoints |
| `app/rag/` | Ingestion, chunking, embeddings, retrieval, answer generation |
| `app/agentops/` | Incident workflows, investigation, provider adapters, tools |
| `app/multi_agent/` | Durable tasks, coordinator, agents, provider factory, worker |
| `app/recordings/` | Recording repository, storage, transcription, AI client, worker |
| `app/db/` | Async database sessions, base metadata, SSL configuration |
| `app/models/` | Tenant, document, incident, and multi-agent persistence models |
| `app/core/` | Configuration, internal authentication, OpenAPI conventions |
| `migrations/` | Alembic schema evolution |
| `tests/` | API, workflow, provider, persistence, security, and worker tests |

## Data and provider stack

The dependency manifest includes FastAPI, SQLAlchemy async, asyncpg, Alembic, pgvector, Redis, LangGraph, LiteLLM, and MCP. PostgreSQL is the relational persistence layer; pgvector supports semantic similarity retrieval. Provider configuration is isolated from domain workflow modules.

## Security model

Protected routes require internal bearer authentication. Tenant-aware document, incident, and multi-agent operations additionally require `X-Relay-User-Id`, which resolves a Relay user to a tenant workspace. Tenant filtering is applied before retrieval. The identity header does not replace caller authentication.

## Development

```bash
cd services/ai-service
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -v
uvicorn app.main:app --reload
```

Apply Alembic migrations using the environment-specific database URL and the repository's migration configuration.
