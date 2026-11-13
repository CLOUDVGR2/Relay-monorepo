# External Secrets Operator

ESO is installed separately from the Relay application overlay. The chart
version is pinned to `2.15.0`; the controller ServiceAccount must remain
`external-secrets` in namespace `external-secrets` to match the Terraform
EKS Pod Identity association.

## Install or upgrade ESO

From the repository root, after the EKS cluster and Pod Identity association
exist:

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm repo update external-secrets

helm upgrade --install external-secrets external-secrets/external-secrets \
  --version 2.15.0 \
  --namespace external-secrets \
  --create-namespace \
  --values infrastructure/kubernetes/infra/external-secrets/helm-values.yaml \
  --wait
```

## Synchronize Relay secrets

After the ESO CRDs and controller are ready, apply the namespaced resources:

```bash
kubectl apply -k infrastructure/kubernetes/infra/external-secrets
```

The SecretStore uses the controller's default AWS SDK credential chain.
It intentionally does not configure static credentials or a separate
ServiceAccount JWT authentication reference; AWS access is expected through
the EKS Pod Identity association.

The seven Secrets Manager values must be JSON objects whose properties match
the `remoteRef.property` entries in `external-secrets.yaml`. Their names use
the `relay/dev/` prefix and must match the Terraform IAM policy's secret ARN
patterns.

Verify synchronization before deploying or restarting application workloads:

```bash
kubectl get secretstore -n relay
kubectl get externalsecrets -n relay
kubectl get secrets -n relay
```

Do not commit secret values to this repository. Confirm shared token and
database credential consistency across the consuming services before rollout.
