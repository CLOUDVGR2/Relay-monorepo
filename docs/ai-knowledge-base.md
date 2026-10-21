# Relay — Product and Technical Knowledge Base

## 1. Overview

Relay is a full-stack application that provides real-time messaging and an AI assistant grounded in a user's available documents.

The repository contains a React frontend, an Express API, Go services, and a Python AI service. The AI service implements retrieval-augmented generation (RAG), allowing answers to be based on ingested documents instead of relying solely on a language model's general knowledge.

This document describes the verified local implementation. It is not a claim that every component has been deployed to production.

## 2. Application Architecture

### Frontend

The frontend is a React application built with Vite. The application includes an AI assistant page at `/ai`.

The AI assistant sends questions to the Express API and displays the returned answer and source citations. It requests five results by default.

### Express API

The Express API provides the application-facing AI answer endpoint:

- `POST /api/ai/answer`

The endpoint requires an authenticated user, validates the question and retrieval count, applies origin checks and rate limiting, and forwards the request to the Python AI service.

The Express API obtains the user identity from the authenticated request rather than trusting a user ID supplied in the question payload.

The AI service's internal authentication token is configured on the server and is not intended to be exposed to the browser.

### Python AI service

The Python AI service is built with FastAPI. Its document API uses the `/v1/documents` route prefix.

The verified document operations are:

- `POST /v1/documents` — ingest a document.
- `POST /v1/documents/search` — retrieve relevant document chunks.
- `POST /v1/documents/answer` — generate an answer with citations.
- `GET /v1/documents` — list documents for the current tenant.
- `GET /v1/documents/{document_id}` — retrieve document metadata.

These endpoints require internal Bearer-token authentication and a `X-Relay-User-Id` header. The service resolves that identity to a tenant and scopes document operations to that tenant.

## 3. Document Ingestion

A document contains:

- `title`: a required title of up to 500 characters.
- `content`: required text of up to 1,000,000 characters.
- `source_uri`: an optional source reference of up to 2,048 characters.

The ingestion pipeline splits document text into overlapping chunks, generates an embedding for each chunk, and persists the document and its chunks in PostgreSQL.

The current ingestion defaults are:

- Chunk size: 1,200 characters.
- Chunk overlap: 150 characters.
- Embedding dimensions: 768.

The implementation uses an Ollama embedding client by default. The database stores document metadata, chunk content, embeddings, and metadata describing chunk positions.

Ingestion is tenant-scoped. Documents should be created through an authenticated application workflow that derives the user identity from the authenticated session.

## 4. Retrieval and Answer Generation

The document search endpoint accepts a query and an optional `top_k` value. The supported range for `top_k` is 1 through 20, with a default of 5.

The retrieval pipeline searches document chunks using vector and full-text search components. Retrieved chunks provide evidence for the answer-generation pipeline.

The answer endpoint accepts:

- `question`: a non-empty question of up to 2,000 characters.
- `top_k`: the number of retrieval results to request, from 1 through 20.

The response contains an `answer` string and a `citations` array. Citation metadata identifies the source document and retrieved chunk, including its title, document ID, chunk ID, chunk index, and available text offsets.

When available evidence is insufficient, the assistant is designed to abstain rather than present an unsupported answer as established fact.

## 5. Authentication and Tenant Isolation

The Express AI endpoint requires the application's authenticated session.

The Python document API independently checks its internal Bearer token. It also receives the Relay user ID through `X-Relay-User-Id`.

Document listing, retrieval, search, and answering resolve the user's tenant and use tenant-scoped database operations. The internal token must remain server-side and must never be embedded in frontend code, documentation examples containing real credentials, or public source control.

## 6. Local AI Dependencies

The local RAG implementation uses:

- PostgreSQL with pgvector for document and embedding storage.
- Ollama for local embedding and answer-generation model requests.
- FastAPI for the Python AI HTTP API.
- Express as the authenticated application-facing gateway.

The configured embedding vector dimension is 768. The embedding model and any generation model must be configured consistently with the implementation and deployment environment.

## 7. Current Limitations and Verification

The existence of an endpoint does not prove that the complete workflow has been validated in a running environment.

Before relying on an answer, verify that:

1. The intended document was successfully ingested.
2. Search returns relevant chunks from that document.
3. The answer includes citations to the retrieved source.
4. A user cannot retrieve another tenant's documents.
5. Missing AI dependencies and upstream failures are handled safely.

Production deployment, monitoring, backup and restore procedures, and operational service-level objectives require separate verification.
