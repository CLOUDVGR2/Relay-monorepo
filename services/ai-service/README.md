# Python AI Service

## Purpose

The Python service exposes FastAPI endpoints for AI-assisted workflows and retrieval-augmented generation (RAG). Its declared dependencies include SQLAlchemy async, Alembic, asyncpg, pgvector, LangGraph, LiteLLM and MCP.

## Primary engineering concerns

- document ingestion and parsing;
- chunking and embedding generation;
- vector persistence and retrieval;
- context assembly and answer generation;
- model/provider selection and failure handling;
- migration and index lifecycle;
- authorization filtering and data isolation.

The dependency manifest alone does not prove that every workflow is enabled or production-ready. Use the source routes, schemas, migrations and tests as the implementation authority.

## Configuration

See `.env.example` and `requirements.txt`. Compose configures PostgreSQL connectivity, an internal service token, provider/model settings, and an optional host Ollama endpoint. Keep provider keys and internal tokens server-side. Do not place them in frontend build variables.

## Development

Create the service virtual environment, install runtime and development requirements, then run tests using the repository's configured pytest settings. The root `npm run test:ai-service` command expects the interpreter at `services/ai-service/.venv/bin/python`.

```bash
cd services/ai-service
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -v
```

## Security and quality gates

Enforce authorization before retrieval content enters model context. Treat user files, retrieved text, model responses and tool outputs as untrusted. Bound ingestion size, chunk count, token budgets, provider concurrency and timeouts. Test provider failure, rate limiting, empty retrieval, stale indexes, malformed output, cancellation and migration recovery. Record model, embedding, prompt and index versions needed to reproduce retrieval behavior.
