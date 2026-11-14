# Code Commenting and Technical Documentation Standard

## 1. Purpose

Comments explain intent, invariants, safety boundaries and non-obvious trade-offs. They should not paraphrase code or become a stale second implementation.

## 2. Required practices

- Explain **why** an invariant exists when the code alone cannot show it.
- Document security boundaries, ownership predicates, lease/fencing rules, message acknowledgement order and retry semantics.
- Explain non-obvious units, limits and timeout budgets.
- Use language that distinguishes required behavior from best-effort behavior.
- Keep comments near the code they govern.
- Update comments and API docs in the same change as the implementation.
- Prefer typed names and self-describing functions over explanatory comments for obvious operations.

## 3. API and schema documentation

- Document route ownership, authentication mode, input constraints, status/error responses and pagination.
- Identify whether a route is public, internal or diagnostic.
- Do not expose secret environment values or internal credential examples.
- Mark defaults and bounds from executable validation rather than copying unverified assumptions.

## 4. Avoid

- Comments that simply restate a line.
- Claims that a route is public without checking Gateway/NGINX exposure.
- Claims of thread safety, idempotency, durability or security without code/test support.
- Provider secrets, personal data and production identifiers.
- TODOs without owner/context or obsolete comments left after a refactor.

## 5. Review checklist

- Does the comment explain a non-obvious decision or invariant?
- Is it still true for the current implementation?
- Does the API documentation match the actual route/DTO/schema?
- Does the document distinguish implementation from deployment and operational evidence?
