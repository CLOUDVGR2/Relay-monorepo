# AWS Deployment Engineering Checklist

## Account and regional foundation

- Confirm AWS account ID, Region, EKS cluster name, VPC/subnet selection, and resource naming.
- Establish IAM boundaries for Terraform, CI publication, EKS workloads, and human operators.
- Define environment tags, budget alerts, log retention, and resource ownership.

## Container registry

Terraform defines ECR repositories for frontend, backend, API gateway, Go API/worker, NestJS API, Python AI, recording worker, Redis, RabbitMQ, MongoDB, and PostgreSQL. Review repository lifecycle, immutable tag policy, scanning, encryption, and image retention before use.

## EKS and workload identity

- Install the EKS Pod Identity Agent and required CSI drivers.
- Configure service accounts and Pod Identity associations.
- Apply least-privilege policies for recording object storage, External Secrets, and load-balancer management.
- Confirm namespace and service-account names match the trust policy conditions.

## Secrets

External Secrets Operator resources describe synchronization from AWS Secrets Manager. Confirm the secret naming convention, IAM resource scope, SecretStore identity, target Kubernetes Secret names, and refresh policy. Never store plaintext secret values in Terraform variables committed to source.

## Storage

The Terraform module can define a private S3 recording bucket with public access blocked and server-side encryption enabled. Validate lifecycle/retention, versioning, KMS requirements, object ownership, access logging, and recovery before production use. The AWS overlay includes EBS-backed storage configuration for stateful components; validate storage class, topology, and backup policy.

## Networking and ingress

- Configure AWS Load Balancer Controller and its IAM role.
- Provide domain records and ACM certificate ARN.
- Validate ingress path rules, target health checks, TLS policy, and security groups.
- Restrict database and broker access to application workloads.
- Verify external API routes match the gateway allowlist.

## Application release

- Build and publish images for the selected architecture.
- Configure image repositories/tags and runtime environment.
- Apply Kustomize AWS overlay.
- Verify rollout status, readiness, logs, metrics, and service discovery.
- Exercise authentication, messaging, calls, tasks, AI retrieval, and worker flows.

## Data protection and operations

- Define database backup, point-in-time recovery, object retention, and restore validation.
- Configure Prometheus scraping and alerting for the deployed topology.
- Establish incident ownership, credential rotation, and rollback procedures.
- Capture actual deployment evidence and resource inventory.

Terraform and Kubernetes manifests define deployment intent. They do not create AWS resources until an authorized operator initializes, plans, reviews, and applies them in the target account.
