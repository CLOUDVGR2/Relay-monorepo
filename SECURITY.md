# Relay Security Policy

## Security scope

This policy applies to the Relay source repository, browser and mobile applications, API services, AI workflows, workers, deployment manifests, CI configuration, and supporting infrastructure.

## Reporting

Report suspected vulnerabilities privately to the repository owner or the designated security contact configured for the project. Include:
- affected component and version/commit;
- concise reproduction steps;
- security impact and required attacker privileges;
- relevant sanitized logs or request examples;
- suggested mitigation, if known.

Do not publish exploit details, credentials, personal data, or proof-of-concept payloads that expose other users before coordinated review.

## Security architecture

Relay applies defense in depth across:
- authentication at API and realtime boundaries;
- resource-level and tenant-scoped authorization;
- schema and payload validation;
- trusted-origin and reverse-proxy handling;
- internal bearer authentication for service-to-service APIs;
- secret separation from source and client bundles;
- bounded request, model, and worker execution;
- safe error responses and structured operational telemetry;
- dependency, container, secret, and infrastructure scanning.

Private networking is not an authorization mechanism. Every service receiving user or internal data must validate the identity and authority appropriate to its contract.

## Credential handling

Use unique, high-entropy credentials per environment and per service purpose. Store deployed secrets in a managed secret facility, restrict access by workload identity or equivalent least-privilege policy, and rotate credentials after suspected exposure. Do not include secret values in documentation, issue trackers, screenshots, logs, or build artifacts.

## Supported versions and disclosure

Security fixes should target the current maintained branch and current release artifacts. Coordinate disclosure timing with the project owner. A remediation is complete only after the code/configuration change, regression coverage, and affected deployment artifacts have been reviewed.
