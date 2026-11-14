# Relay Security Policy

## 1. Scope

This policy covers security issues in the Relay source repository, including browser/mobile clients, APIs, workers, infrastructure definitions, CI workflows, dependencies and documentation. It applies to the repository snapshot and the deployed environments maintained from it.

## 2. Reporting a vulnerability

Do not disclose suspected vulnerabilities in a public issue, pull request, discussion or social post before maintainers have had an opportunity to assess the report.

Use GitHub's private vulnerability reporting / security advisory mechanism for this repository when it is enabled. If private reporting is unavailable, contact the repository maintainers through an existing private organizational channel and request a confidential security contact. Do not invent or guess a security email address.

A useful report includes:

- affected repository path, service and commit/version;
- impact and attacker prerequisites;
- minimal reproduction steps or proof of concept;
- affected data, users or trust boundary;
- suggested mitigation, if known;
- whether the issue is known to be exploited.

Do not attach real user data, credentials, tokens, cookies, private keys, customer documents or production recordings. Use synthetic examples and redact identifiers.

## 3. Coordinated disclosure

The maintainer and reporter should coordinate triage, severity, mitigation, fix validation and disclosure timing. No response or remediation SLA is asserted by this repository. Critical issues should be handled through the private channel as soon as practicable.

## 4. Security architecture areas

The repository includes:

- Express browser-cookie and native bearer authentication;
- NestJS HTTP and GraphQL authentication guards;
- Python internal bearer authentication and Relay identity context;
- internal bearer authentication for Go Jobs API job operations;
- CORS allowlists, Helmet/security headers, request limits and selected rate limiters;
- Gateway trusted-proxy CIDR handling and route allowlisting;
- External Secrets Operator and AWS Secrets Manager integration assets;
- secret scanning, dependency audit and filesystem/configuration security workflows.

These controls are implementation evidence, not an independent security certification. See [Threat Model](docs/security/threat-model.md) and [Security and Operations](docs/security-and-operations.md).

## 5. Credential and data handling

- Never commit populated `.env` files, tokens, API keys, passwords, private keys or signing material.
- Never place server-side secrets in `EXPO_PUBLIC_*` variables or browser bundles.
- Do not log authorization headers, session cookies, raw prompts, transcripts, private documents or signed object-storage URLs.
- Use synthetic test identities and data.
- Treat shared Knowledge Base retrieval as broad authenticated visibility: uploaded documents are searchable by other authenticated users in the current implementation.
- Protect object storage and database access at the deployment boundary.

## 6. Supported versions and disclosure status

The repository does not define a published long-term support matrix or a vulnerability response SLA. Report the branch, commit SHA, container image digest and deployment environment where the issue was observed. Maintainers determine affected versions and disclosure timing during triage.
