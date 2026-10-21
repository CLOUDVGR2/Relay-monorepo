# Relay AI and Document API Reference

## Public Express API

### `POST /api/ai/answer`
Requires an authenticated Relay session and a trusted browser origin. The route applies AI answer rate limiting and forwards the request to the Python AI service.

Request fields:
- `question`: non-empty string, maximum 2,000 characters.
- `top_k`: integer from 1 through 20; the frontend currently requests 5.

Successful response fields:
- `answer`: string.
- `citations`: array of citation objects.

The Express route validates the upstream response. Invalid upstream response data is treated as a bad gateway. Upstream timeouts can produce HTTP 504; temporary upstream failures can produce HTTP 502 or 503. Invalid input maps to HTTP 400, and rate limiting can return HTTP 429.

### `POST /api/ai/documents`
Requires an authenticated Relay session and a trusted browser origin. It applies a dedicated document-ingestion rate limiter.

Request fields:
- `title`: trimmed, non-empty string, maximum 500 characters.
- `content`: non-empty string, maximum 1,000,000 characters.
- `source_uri`: optional string, maximum 2,048 characters.

A successful upstream response must contain string fields `id` and `title`. Ingestion requests have a 120-second upstream timeout. Do not expose the internal Python service token to the browser.

## Python Internal Document API

The Python document router uses prefix `/v1/documents`. Its routes require a valid internal Bearer token and use `X-Relay-User-Id` to scope operations to a tenant.

### `POST /v1/documents`
Creates and ingests a document. Returns HTTP 201 with document metadata when successful.

### `POST /v1/documents/search`
Request: `query` (non-empty, maximum 2,000 characters) and `top_k` (1–20, default 5). Returns the query and retrieved chunk results, including source metadata and scores.

### `POST /v1/documents/answer`
Request: `question` (non-empty, maximum 2,000 characters) and `top_k` (1–20, default 5). Returns `answer` and `citations`.

Citation fields include `chunk_id`, `document_id`, `title`, `source_uri`, `chunk_index`, `start`, and `end`.

### `GET /v1/documents`
Lists documents for the supplied user/tenant. Supports `limit` from 1 to 100 (default 20) and non-negative `offset` (default 0).

### `GET /v1/documents/{document_id}`
Returns document metadata only when the document belongs to the supplied tenant; otherwise returns 404.

## Security Notes
- The Python document router applies internal-token authentication to its routes.
- The internal token is configured server-side and must not be sent to the frontend.
- The Express API passes the authenticated Relay user ID to Python.
- Keep upstream error messages safe; do not return credentials or secrets.
