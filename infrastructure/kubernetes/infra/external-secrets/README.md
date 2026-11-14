# External Secrets Operator — AWS Secrets Manager Integration

## Purpose and trust boundary

This directory defines an External Secrets Operator (ESO) integration for synchronizing selected AWS Secrets Manager values into Kubernetes Secrets in the `relay` namespace. It is a template requiring a deployed ESO controller, a valid AWS identity, an installed CRD version compatible with `external-secrets.io/v1`, and approved IAM policy. The manifests do not prove those prerequisites exist in a live cluster.

## Resource inventory

| File | Responsibility |
|---|---|
| `external-secrets.yaml` | ExternalSecret resources and remote key/property mappings |
| `secret-store.yaml` | namespaced SecretStore for AWS Secrets Manager and region |
| `helm-values.yaml` | ESO chart values, including CRD installation and service account name |
| `kustomization.yaml` | composition of the resources |

## Secret mapping contract

The current manifests reference `relay/dev/` paths for the following logical secrets:

| Kubernetes target | Secret Manager entry | Current mapped data keys |
|---|---|---|
| `backend-secret` | `relay/dev/backend-secret` | Mongo URI, JWT secret, Python AI token |
| `go-api-secret` | `relay/dev/go-api-secret` | internal API token |
| `rabbitmq-secret` | `relay/dev/rabbitmq-secret` | username, password |
| `nest-api-secret` | `relay/dev/nest-api-secret` | Mongo URI, database URL, JWT secret, internal API token, Python AI token |
| `python-ai-secret` | `relay/dev/python-ai-secret` | database URL, Python AI token, OpenAI API key |
| `mongodb-secret` | `relay/dev/mongodb-secret` | username, password |
| `postgres-secret` | `relay/dev/postgres-secret` | password |

The exact property names must match the JSON/structured secret values in Secrets Manager and the keys consumed by each Deployment. Before changing a mapping, search the Kubernetes workload environment references and service `.env.example` files. Avoid copying one service's secret object into another service unless the shared credential is intentional and documented.

## Identity requirements

The Terraform tree contains an optional EKS Pod Identity role/policy for the External Secrets service account. Its trust condition is expected to restrict the AWS account, cluster, namespace, and service account. Operators must verify:

- the Pod Identity association points to the intended namespace/service account;
- the IAM policy grants read access only to the required secret paths and KMS keys;
- the `SecretStore` region matches the secret location;
- the ESO controller and CRDs are installed at a compatible version;
- the target namespace and remote secret paths are correct.

Do not place static AWS access keys in the `SecretStore` manifest.

## Rotation and lifecycle

The current ExternalSecret resources specify a one-hour refresh interval and target ownership/deletion policies. Validate provider refresh behavior, consumer reload behavior, and rollout requirements for rotated credentials. A Kubernetes Secret changing does not guarantee an application process reloads its environment variables; restart or hot-reload behavior must be tested for each consumer.

## Validation workflow

1. Render the relevant Kustomize composition.
2. Run schema validation with the ESO CRDs available to the validator.
3. Inspect every remote key/property and target secret name.
4. Apply to an isolated namespace/environment.
5. Confirm ExternalSecret readiness and target Secret key names without printing values.
6. Test pod identity by verifying the intended role, then validate least-privilege access.
7. Rotate a non-production secret and confirm application recovery.
8. Verify audit events and alerting for sync failures.

Never use `kubectl get secret -o yaml` in a shared terminal or attach decoded values to a ticket. Capture only metadata and readiness status.
