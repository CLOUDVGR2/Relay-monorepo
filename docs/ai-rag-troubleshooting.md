# Relay RAG Troubleshooting Guide

## AI service unavailable
1. Confirm the Express API is running and reachable on its configured local port.
2. Check the Python AI readiness endpoint `/readyz`.
3. Check Python AI logs for upstream failures.
4. Confirm the Python container can reach the configured Ollama base URL.
5. Confirm the required embedding and generation models are available.
6. Retry only after identifying the failing dependency.

## Authentication required
- Confirm the browser is signed in.
- Confirm the session cookie is being sent to the Express API.
- Check that the route is protected and the session is valid.
- Do not paste cookies, bearer tokens, or environment secrets into bug reports.

## Origin blocked
- Check the Express `CLIENT_URL` configuration.
- Use the configured frontend origin.
- Do not disable origin checks as a troubleshooting shortcut.

## Document ingestion fails
- Verify title and content are non-empty.
- Verify title is no longer than 500 characters.
- Verify content is no longer than 1,000,000 characters.
- Verify `source_uri`, when supplied, is no longer than 2,048 characters.
- Check the Express response status and Python service logs.
- A successful create response should contain a document ID and title.

## Answer has no useful citations
- Confirm the document was successfully ingested.
- Ask a precise question whose answer appears explicitly in the source.
- Check that the answer response includes a `citations` array.
- Inspect the source title and chunk metadata in the UI.
- If the answer says evidence is insufficient, verify that the document belongs to the current account and that the relevant content was actually ingested.
- Do not repeatedly ingest the same document just because one answer was poor.

## Timeouts and rate limits
- HTTP 429 indicates a rate limit; wait before retrying.
- HTTP 504 indicates the upstream operation timed out.
- HTTP 502 or 503 indicates an upstream or service failure.
- Use server logs to diagnose the underlying issue instead of exposing internal errors to users.
