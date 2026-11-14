# Relay Kubernetes AWS Overlay

## Purpose and scope

This Kustomize overlay composes the shared Relay workloads with AWS-oriented images, ingress, storage-class, and autoscaling patches. It is a deployment template. Placeholder account IDs, regions, and image tags must be rendered before deployment; the checked-in tree is not evidence of an active EKS environment.

## Composition

The `kustomization.yaml` applies the `relay` namespace and includes workload/configuration resources for:

- MongoDB, PostgreSQL, Redis, and RabbitMQ;
- Express backend and frontend;
- Go API Gateway, Go Jobs API, and Go Jobs Worker;
- NestJS API;
- Python AI service and multi-agent worker;
- recording worker and recording-storage identity/PVC resources;
- AWS ingress, gp3 storage class, and backend HPA patch.

Review the actual Kustomize resource list before assuming a component is included. External Secrets Operator is described under `infrastructure/kubernetes/infra/external-secrets/` and may be applied as a separate infrastructure layer.

## Image substitution

The overlay contains placeholder registry references such as `AWS_ACCOUNT_ID.dkr.ecr.AWS_REGION.amazonaws.com` and `REPLACE_WITH_IMAGE_TAG`. It also pins selected supporting image tags in the overlay. Before deployment:

1. build, test, scan, and publish the required images;
2. identify the ECR account and region;
3. replace application placeholders using the supplied rendering process or approved equivalent;
4. use immutable tags/digests tied to a commit;
5. inspect the rendered output and verify every image is valid;
6. confirm no placeholder remains.

The example environment file is a template, not a secret store. Do not commit populated account-sensitive or credential-bearing copies.

## AWS integration points

- ALB ingress and AWS Load Balancer Controller annotations;
- gp3 StorageClass and PersistentVolumeClaims where included;
- ECR images for application and selected supporting components;
- EKS Pod Identity service accounts for recording-storage access;
- External Secrets Operator and AWS Secrets Manager;
- HPA patch for the backend workload.

## Security and operations review

Before applying:

- verify ALB internet-facing/internal scheme and TLS certificate;
- verify ingress path behavior matches Gateway allowlist and frontend NGINX routes;
- restrict databases, broker, AI service, worker, and metrics to private network paths;
- configure NetworkPolicy/security groups and egress restrictions;
- verify workload IAM bindings and SecretStore access;
- validate persistent storage, backups, restore, encryption, and deletion policy;
- review resource requests/limits, HPA metrics, disruption budgets, and node capacity;
- confirm health probes and startup ordering;
- validate log/metric collection and alert routing.

## Render and validate

From the repository root:

```bash
kubectl kustomize infrastructure/kubernetes/overlays/aws
```

Use the workflow-pinned `kubectl`/`kubeconform` versions or the current approved toolchain to validate the rendered result. Inspect the full output before applying:

```bash
kubectl kustomize infrastructure/kubernetes/overlays/aws > /tmp/relay-aws-rendered.yaml
# Review /tmp/relay-aws-rendered.yaml and run the configured schema/policy validators.
```

Do not apply placeholders. Do not apply a rendered manifest until account, namespace, image, secret, ingress, storage, and approval reviews are complete.

## Related references

- [AWS architecture](../../../../docs/architecture/aws-deployment.md)
- [AWS checklist](../../../../docs/aws-deployment-checklist.md)
- [External Secrets](../../infra/external-secrets/README.md)
