# AWS Deployment Engineering Checklist

This checklist is an execution aid for a reviewed deployment. The existence of Terraform/Kustomize files is not a deployment approval. Mark each item only when evidence is attached to the change or release record.

## 1. Account, region, and governance

- [ ] Confirm AWS account ID, region, EKS cluster name, environment, and naming convention.
- [ ] Confirm cost center, resource owner tags, budget alarms, and chargeback policy.
- [ ] Establish separate human, CI, Terraform, cluster, and workload identities.
- [ ] Review SCPs, permission boundaries, break-glass access, CloudTrail, and audit retention.
- [ ] Select data-residency and retention requirements with security/legal owners.

## 2. Terraform foundation

- [ ] Pin Terraform and provider versions; initialize from the approved lock file.
- [ ] Configure a remote, encrypted, access-controlled state backend with locking.
- [ ] Review all `create_*` feature flags and their costs.
- [ ] Validate VPC CIDRs, non-overlapping public/private subnets, and AZ count.
- [ ] Decide NAT gateway topology and VPC endpoints; model ongoing costs.
- [ ] Review EKS cluster endpoint access, node groups, version, encryption, and upgrade policy.
- [ ] Run `terraform fmt -check -recursive`, `terraform validate`, and the configured tests.
- [ ] Produce and review a saved plan; verify intended create/update/destroy actions.
- [ ] Obtain change approval before apply.

## 3. Container registry and supply chain

Terraform defines ECR repository resources for application and selected supporting services. Review the current `main.tf` repository set before use.

- [ ] Publish each required image to the target account and region.
- [ ] Use immutable release tags or digests; prohibit `latest` for controlled production releases.
- [ ] Enable scanning, encryption, lifecycle rules, and image retention.
- [ ] Retain SBOM/provenance and map each image to a source commit.
- [ ] Verify architecture compatibility and startup/healthcheck behavior.
- [ ] Confirm image pull identity and registry/network access.

## 4. EKS and workload identity

- [ ] Confirm control-plane and node security posture.
- [ ] Apply namespace, RBAC, service accounts, Pod Security standards, and network policies.
- [ ] Configure EKS Pod Identity or another approved workload identity mechanism.
- [ ] Validate trust policies bind account, cluster, namespace, and service account as intended.
- [ ] Ensure no long-lived cloud access keys are embedded in workloads.
- [ ] Define node disruption, upgrades, autoscaling, and capacity buffers.

## 5. Secrets Manager and External Secrets

- [ ] Install a supported External Secrets Operator version.
- [ ] Configure the SecretStore region, identity, and namespace.
- [ ] Confirm remote secret names and expected key names for each service.
- [ ] Validate refresh interval, ownership, deletion policy, and failure alerts.
- [ ] Confirm secrets appear only in the intended namespace and workloads.
- [ ] Test rotation and consumer reload behavior.
- [ ] Audit secret read permissions and CloudTrail events.

## 6. Ingress and edge security

- [ ] Install and version the AWS Load Balancer Controller.
- [ ] Select internet-facing vs internal ALB deliberately.
- [ ] Attach approved TLS certificates and security policy.
- [ ] Validate path routing, redirects, SPA fallback, and API prefix behavior.
- [ ] Test Socket.IO/WebSocket upgrade, idle timeout, and drain behavior.
- [ ] Configure WAF/rate protections where required by threat review.
- [ ] Restrict metrics, internal health, docs, AI, broker, database, and worker endpoints.
- [ ] Review Gateway trusted-proxy configuration and forwarding headers.

## 7. Persistence and data services

- [ ] Decide which repositories' MongoDB/PostgreSQL/Redis/RabbitMQ deployments remain in-cluster and which move to managed services.
- [ ] Confirm storage class, encryption, volume binding, expansion, snapshots, and multi-AZ behavior.
- [ ] Validate PostgreSQL extensions and version compatibility (`pgvector` is used by RAG).
- [ ] Confirm MongoDB replica/backup strategy and authentication.
- [ ] Define Redis persistence/failover consistent with its cache, coordination, and status roles.
- [ ] Define RabbitMQ durable topology, quorum/replication, disk alarm, and recovery.
- [ ] Test backups and restore into a clean environment.

## 8. Recording object storage

- [ ] Confirm unique bucket name and region.
- [ ] Enable encryption, public-access blocking, bucket policy, and versioning if required.
- [ ] Restrict object operations to intended Nest/recording worker roles.
- [ ] Configure retention, lifecycle, legal hold, deletion, and cross-region strategy if required.
- [ ] Test upload, completion, processing, and denied unauthorized object access.

## 9. Application configuration

- [ ] Set public client origins and API base URLs.
- [ ] Configure auth/session secrets and allowed origins.
- [ ] Configure service-to-service internal tokens independently from user JWTs.
- [ ] Set database, cache, broker, and object-store endpoints.
- [ ] Set AI generation and embedding provider/model/limits explicitly.
- [ ] Verify cross-user Knowledge Base sharing has been approved and disclosed.
- [ ] Validate all health/readiness endpoints and dependency ordering.

## 10. Observability and operations

- [ ] Install metrics collection and secure dashboards.
- [ ] Configure logs, redaction, retention, and correlation.
- [ ] Validate probes, alerts, and escalation delivery.
- [ ] Set service-specific SLOs and queue-age thresholds.
- [ ] Test incident response and recovery runbooks.
- [ ] Verify capacity under representative load and failure conditions.

## 11. Final release acceptance

- [ ] Render and review the exact AWS overlay.
- [ ] Run Kubernetes schema and policy validation.
- [ ] Record manifest digest, image digests, source commit, and migration versions.
- [ ] Run smoke tests for auth, messaging, realtime, calls, tasks, jobs, recording, AI, and web/mobile entrypoints as applicable.
- [ ] Complete security, privacy, performance, DR, and go/no-go reviews.
- [ ] Record operator, deployment window, rollback owner, and approval.

## Related documents

- [AWS deployment architecture](architecture/aws-deployment.md)
- [AWS overlay](../infrastructure/kubernetes/overlays/aws/README.md)
- [Production readiness gates](production-readiness-gates.md)
