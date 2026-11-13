# Code Commenting Standard

## Purpose

Comments explain intent, invariants, security assumptions, lifecycle constraints, and non-obvious implementation choices. They complement executable names and types; they do not duplicate the code.

## Required practices

- Explain why a security check or authorization boundary exists.
- Document concurrency, retry, idempotency, and shutdown invariants.
- Describe non-obvious data transformations and compatibility constraints.
- Keep public API and event comments aligned with generated documentation.
- Use language-native documentation conventions for exported Go symbols, Python modules, and TypeScript public contracts.
- Update comments in the same change as behavior.

## Avoid

- Narrating obvious statements.
- Leaving stale TODOs or references to removed behavior.
- Embedding credentials, private data, or environment-specific secrets.
- Claiming guarantees that the implementation does not enforce.
- Using comments as a substitute for validation or tests.

## Review check

A reviewer should be able to distinguish the contract, invariant, and rationale from the implementation itself. If a comment becomes inaccurate after a refactor, remove or update it.
