# External Secrets Operator Integration

## Purpose

The Kubernetes External Secrets Operator resources connect a Kubernetes namespace to AWS Secrets Manager through a SecretStore and workload identity. The operator synchronizes selected remote secret values into Kubernetes Secret objects consumed by Relay workloads.

## Resource set

- `external-secrets.yaml` — operator installation/configuration resources.
- `secret-store.yaml` — provider and authentication configuration.
- `helm-values.yaml` — Helm values for operator deployment.
- `kustomization.yaml` — resource composition.

## Identity model

The AWS role trust policy is scoped to the External Secrets service account, namespace, EKS cluster, and source account. The role policy should grant only `secretsmanager:GetSecretValue` and `secretsmanager:DescribeSecret` for the Relay secret namespace.

## Integration sequence

1. Install the Pod Identity Agent and External Secrets Operator.
2. Create the matching EKS Pod Identity association.
3. Configure the approved Secrets Manager secret naming scheme.
4. Apply the SecretStore and ExternalSecret resources.
5. Verify synchronization status without printing secret values.
6. Confirm consuming workloads reference the expected Kubernetes Secret keys.

Secret values are never committed to this repository. Review IAM scope, secret refresh behavior, and rotation impact before deployment.
