# Relay Platform Overview

## Purpose
Relay is a multi-service platform that provides API routing, application services, background processing, and AI-powered document question answering.

## Services
The Go API Gateway routes requests to the Express API, Nest API, Jobs API, and Python AI Service.

The gateway is published locally at 127.0.0.1:8090.

The Express API handles application requests and forwards grounded AI answer requests to the Python AI Service.

The Nest API provides backend application functionality.

The Jobs API and Jobs Worker support background job processing.

## AI Service
The Python AI Service uses FastAPI to expose document ingestion, document search, and grounded question-answering endpoints.

POST /v1/documents ingests a document.
GET /v1/documents lists documents belonging to the current tenant.
POST /v1/documents/search retrieves relevant document chunks.
POST /v1/documents/answer generates an answer based on retrieved evidence.

Internal document requests use the X-Relay-User-Id header to identify the Relay user and tenant.

## Document Ingestion
During ingestion, document content is stored and divided into searchable chunks. The system generates embeddings for semantic search and maintains a full-text search representation.

Document search combines semantic similarity and PostgreSQL full-text search. Retrieval is scoped to the current tenant.

## Grounded Answers and Citations
The AI Service retrieves evidence before generating a grounded answer. The generated citation identifiers are validated against the chunks actually retrieved.

Only validated source chunks are returned as citations. If no evidence is available or no valid citations are generated, the service returns an abstention response rather than inventing sources.

Citation information can include the document title, source URI, document ID, chunk ID, and supporting content.

## Troubleshooting
When an AI answer contains no citations:
1. Confirm that document ingestion succeeded.
2. Confirm that the document appears in the document list.
3. Confirm that document chunks were created.
4. Check that the request uses the expected tenant.
5. Test document search using words from the document.
6. Inspect the generated citation identifiers if search returns evidence but the answer has no citations.

A successful HTTP response does not by itself prove that documents were indexed or that evidence was retrieved.

## Example Questions
- Which services does the Relay API Gateway route requests to?
- Which endpoint generates grounded AI answers?
- How does the AI Service retrieve relevant document chunks?
- How does Relay prevent fabricated citations?
- What should an engineer check when citations are missing?
