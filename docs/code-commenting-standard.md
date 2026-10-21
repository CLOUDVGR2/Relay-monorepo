# Code Commenting Standard

Relay comments are part of the maintenance interface. They should explain intent, invariants, constraints, and non-obvious trade-offs—not narrate syntax that the code already makes clear.

## Required practices

- Give non-trivial modules a short file-level summary when the responsibility is not obvious from the name and directory.
- Explain **why** a decision exists when changing it could break correctness, security, compatibility, or operations.
- Document public APIs, exported Go identifiers, non-obvious types, and configuration with the conventions of the language and framework.
- Explain concurrency, retry, idempotency, transaction, ordering, caching, and resource-lifetime invariants close to the code that enforces them.
- In tests, make the scenario or regression being protected clear when the test name alone is insufficient.
- Keep comments accurate as behavior changes. A stale comment is a defect.

## Avoid

- Line-by-line narration (`i++ // increment i`).
- Restating a function or variable name in prose without adding context.
- TODOs without a reason, owner, issue reference, or explicit disposition.
- Claims such as “secure,” “exactly once,” “production ready,” or “thread safe” unless the code and tests justify them.
- Large commented-out code blocks; use version control for history.

## Language conventions

- Go: use Go doc comments for packages and exported declarations; run `gofmt` on changed Go files.
- Python: use module, class, and public-function docstrings where they add useful API context; follow existing type-hint conventions.
- JavaScript/TypeScript/React: use concise JSDoc for public or complex module contracts and JSX comments only where needed in markup.
- SQL: explain migration intent and any compatibility or locking assumptions.
- Shell and CI scripts: document non-obvious safety checks, required environment, and destructive operations.

## Review check

A reviewer should be able to answer: what invariant does this comment protect, what could go wrong if it were ignored, and is the statement still true? If a comment cannot answer at least one of those questions, simplify or remove it.
