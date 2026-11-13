# AI Platform Operations

## Runtime components

The AI platform comprises the FastAPI request service, PostgreSQL/pgvector persistence, Redis coordination, configured model providers, a multi-agent worker, and a recording worker. The HTTP service and workers share domain modules but run as separate processes with distinct resource and lifecycle profiles.

## Operational diagnostics

### Service startup
Verify required configuration, database connectivity, migration revision, provider configuration, and internal token availability. Health endpoints distinguish process health from database readiness.

### Document ingestion
Trace request validation, tenant resolution, document persistence, chunk creation, embedding provider execution, vector persistence, and final document status. Preserve document and tenant identifiers in structured logs while avoiding source text.

### Retrieval and answers
Inspect query embedding, tenant filter, top-k selection, relevance scores, context budget, provider latency, and citation serialization. Retrieval quality and generation quality are separate dimensions.

### Incident workflows
Correlate incident identifier, investigation trace, provider execution, approval state, action hash, execution result, and recovery state. Human approval is a separate control from investigation.

### Multi-agent execution
Inspect durable task status, phase, attempt count, worker heartbeat, lease/claim behavior, provider result, and final task record. Task status is the authoritative client-facing lifecycle.

### Recording processing
Trace recording metadata, object key, storage read, audio validation, transcription model/device configuration, transcript persistence, and AI analysis. Keep raw media and transcript access restricted.

## Provider and capacity controls

Set provider-specific deadlines, concurrency, retry policy, and token budgets. Record model and embedding identifiers. Use explicit provider fallback policy; do not silently redirect sensitive data to a provider with different handling terms.

## Security controls

Internal bearer authentication protects service endpoints. Tenant identity is resolved independently and applied before data retrieval. Treat source documents, transcript content, model output, and tool responses as untrusted.
