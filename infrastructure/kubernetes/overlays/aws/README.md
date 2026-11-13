# Relay Kubernetes AWS Overlay

## Purpose

The AWS overlay composes the shared Kubernetes base with AWS-specific ingress, storage, resource configuration, and workload adjustments. It is rendered with Kustomize from `infrastructure/kubernetes/overlays/aws`.

## Composition

The overlay references the common application and infrastructure workloads and supplies AWS-oriented resource definitions for frontend, gateway, backend, NestJS, Go services, Python AI, workers, MongoDB, PostgreSQL, Redis, RabbitMQ, and recording storage.

## AWS integration points

- ECR image repositories and image references.
- AWS Load Balancer Controller ingress.
- ACM certificate and DNS configuration.
- EBS-backed storage class for persistent volumes.
- EKS Pod Identity service accounts for scoped AWS access.
- External Secrets Operator integration with Secrets Manager.
- S3 recording storage and object-level IAM permissions.

## Configuration

Review ConfigMaps, Secret references, image tags, resource requests/limits, service accounts, ingress annotations, storage classes, and namespace selection before applying. Ensure every external secret key referenced by a workload exists in the synchronized Secret.

## Validation

```bash
kubectl kustomize infrastructure/kubernetes/overlays/aws
```

Validate Terraform separately with `terraform fmt -check`, `terraform init`, `terraform validate`, and a reviewed plan in the target AWS account. Rendering validates composition; it does not provision or verify AWS resources.

## Deployment

Apply only after account, network, IAM, registry, secret, storage, and ingress prerequisites have been provisioned and reviewed. Capture rollout status, service endpoints, readiness, logs, and smoke-test evidence for the release record.
