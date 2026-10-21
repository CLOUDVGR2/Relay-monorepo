# Security Policy

## Scope

Relay includes a browser client, multiple API services, an API gateway, asynchronous job processing, AI/RAG workflows, databases, message transport, container configuration, and Kubernetes manifests. A vulnerability in any of these layers may affect the overall system.

## Reporting a vulnerability

Do not publish exploitable details, credentials, tokens, personal data, or a proof of concept against a live system in a public issue.

Use the repository hosting platform's private vulnerability-reporting mechanism when available. If no private mechanism is configured, contact the repository maintainers through a private channel and provide:
- affected service/path and version or commit;
- impact and plausible attack prerequisites;
- minimal reproduction steps or a safe proof of concept;
- logs or screenshots with secrets and personal data removed;
- any known mitigations.

Do not include real credentials, customer content, production connection strings, or unredacted tokens in the report.

## Response expectations

Maintainers should acknowledge receipt, validate the report, establish severity and affected versions, coordinate a fix, and agree on disclosure timing with the reporter. Do not promise a response SLA unless maintainers have explicitly adopted one.

## Security engineering principles

- Enforce authorization at trusted service boundaries.
- Keep secrets out of source control, browser bundles, logs, and CI output.
- Use least-privilege credentials and isolate environments.
- Validate request bodies, files, queue messages, model outputs and tool inputs.
- Bound resource use and external calls.
- Test dependency failure, duplicate messages, and authentication/authorization failures.
- Keep dependencies and base images updated according to risk.
- Protect AI retrieval with authorization filtering before model context assembly.
- Treat Kubernetes Secret base64 values as encoded rather than encrypted.
- Record residual risk and avoid claims of security certification without independent evidence.

## Supported versions and disclosure

No formal support window or vulnerability-disclosure SLA is currently asserted by this repository. Maintainers should publish one when release and maintenance ownership are established.
