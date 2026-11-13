# Relay — AWS Deployment Checklist

> **Status:** Preparation checklist only. Do not deploy until placeholders, security settings, and infrastructure prerequisites have been reviewed. Creating this document does not create AWS resources.

## 1. Scope and cost controls

- [ ] Confirm the AWS account, Region, environment, and deployment owner.
- [ ] Review expected EKS, load balancer, NAT/networking, storage, database, logging, and data-transfer costs.
- [ ] Configure an AWS Budget and billing alerts.
- [ ] Confirm authorization before provisioning any resources.
- [ ] Define resource tags, retention requirements, and a cleanup plan.

## 2. Identity and infrastructure

- [ ] Use an approved IAM role or federation; avoid long-lived access keys.
- [ ] Apply least-privilege permissions to deployment and workload identities.
- [ ] Design the VPC, subnets, routing, security groups, and cluster access.
- [ ] Provision and validate the EKS cluster and required node capacity.
- [ ] Install and configure the AWS Load Balancer Controller with appropriate IAM permissions.
- [ ] Confirm the required storage driver and StorageClass are available.

## 3. Images and application configuration

- [ ] Build and test all required application images.
- [ ] Push versioned images to ECR and verify image pull permissions.
- [ ] Replace `AWS_ACCOUNT_ID`, `AWS_REGION`, and `REPLACE_WITH_IMAGE_TAG` placeholders.
- [ ] Configure `APP_DOMAIN` and `ACM_CERTIFICATE_ARN` for the intended environment.
- [ ] Replace the example domain and every `REPLACE_WITH_` placeholder.
- [ ] Configure application URLs, CORS, and service endpoints for the deployed environment.
- [ ] Replace local-only `host.docker.internal` AI configuration with an endpoint reachable from EKS.
- [ ] Verify the AI endpoint authentication, network access, TLS, and provider/model configuration.
- [ ] Confirm frontend API routing. The current Ingress routes `/` to the frontend; API paths must be deliberately configured and tested.

## 4. Secrets and data protection

- [ ] Create required Kubernetes Secrets through an approved secure process or integrate AWS Secrets Manager with an approved synchronization mechanism.
- [ ] If using ESO, install a reviewed release and configure its AWS provider, EKS Pod Identity, and `external-secrets` ServiceAccount.
- [ ] Review the optional Terraform ESO IAM role and Pod Identity association; verify access is limited to the seven intended `relay/dev/` secret records.
- [ ] Create and review ESO `SecretStore`/`ClusterSecretStore` and `ExternalSecret` manifests; verify all seven existing Kubernetes Secret names and required keys synchronize correctly.
- [ ] Test secret rotation and application reload behavior; review customer-managed KMS permissions separately if applicable.
- [ ] Supply the required keys for `backend-secret`, `go-api-secret`, `nest-api-secret`, `python-ai-secret`, `mongodb-secret`, `postgres-secret`, and `rabbitmq-secret`.
- [ ] Never commit real credentials, tokens, private keys, or populated environment files.
- [ ] Confirm encryption at rest and in transit where supported.
- [ ] Decide whether MongoDB, PostgreSQL, Redis, and RabbitMQ will run in-cluster or use managed services.
- [ ] Verify PVC sizes, StorageClass, backup schedules, restore procedures, and recovery objectives.
- [ ] Restrict database and message-broker access to required workloads only.

## 5. Ingress, DNS, and TLS

- [ ] Request or validate the ACM certificate in the Region required by the load balancer.
- [ ] Configure DNS for the application domain.
- [ ] Validate ALB scheme, listeners, target type, health checks, and security-group rules.
- [ ] Confirm HTTP-to-HTTPS redirection and certificate coverage.
- [ ] Review public exposure and ensure internal services are not inadvertently exposed.
- [ ] Test frontend and API routes after routing rules are configured.

## 6. Kubernetes readiness and security

- [ ] Render both overlays successfully:
  - `kubectl kustomize infrastructure/kubernetes/overlays/local`
  - `kubectl kustomize infrastructure/kubernetes/overlays/aws`
- [ ] Review the rendered AWS manifests for placeholder values, image references, namespaces, and configuration.
- [ ] Confirm CPU/memory requests and limits, probes, autoscaling, and replica counts are appropriate.
- [ ] Confirm persistent workloads can schedule and attach storage.
- [ ] Review pod security, service accounts, RBAC, network policies, and container image vulnerabilities.
- [ ] Confirm logs, metrics, alerts, and audit visibility are available.

## 7. Deployment and verification

- [ ] Review the final change set and obtain the required deployment approval.
- [ ] Apply manifests only to the intended cluster and namespace.
- [ ] Check rollout status for each Deployment and StatefulSet.
- [ ] Check pod events, logs, health probes, PVC binding, and service endpoints.
- [ ] Run smoke tests for sign-in, core API requests, messaging/worker processing, database access, and AI features.
- [ ] Verify HTTPS, CORS, API routing, and expected failure behavior.
- [ ] Confirm monitoring and alerts detect application and infrastructure failures.

## 8. Rollback and operations

- [ ] Record the last known-good image tags and deployment revision.
- [ ] Document rollback steps and responsible operators.
- [ ] Test backup restoration and document recovery procedures.
- [ ] Define patching, image rebuild, secret rotation, and certificate renewal processes.
- [ ] Review costs and remove unused resources only under an approved cleanup plan.

## Stop conditions

**Do not deploy** if any example domain or `REPLACE_WITH_` placeholder remains, secrets are missing, API routing is unverified, the AI endpoint is unreachable, storage/backup decisions are unresolved, or the deployment target has not been approved.
