# AWS Kubernetes Overlay

This overlay prepares Relay for a future deployment to Amazon EKS. It is separate from the local Minikube configuration and does not create AWS resources.

## Overview

The AWS overlay includes application and infrastructure Kubernetes manifests, AWS-specific configuration, Amazon ECR image references, an AWS Application Load Balancer Ingress, and backend Horizontal Pod Autoscaler configuration. It includes the Go API gateway deployment, service, and image mapping. Review the rendered Ingress rules and gateway health probes before deployment; local Compose routing should not be assumed to match the EKS configuration.

The local overlay remains available at `infrastructure/kubernetes/overlays/local`.

## Prerequisites

Before deploying to AWS, configure:

- An Amazon EKS cluster and access through `kubectl`.
- Amazon ECR repositories for each application image.
- The correct AWS account ID, AWS Region, and image tags.
- AWS Load Balancer Controller installed and configured.
- An ACM certificate in the same Region as the load balancer.
- A domain name and DNS record pointing to the load balancer.
- Persistent storage support, such as the Amazon EBS CSI driver.
- Secure application secrets supplied outside this repository.
- An AI model endpoint accessible from the EKS cluster.

## Configure Before Deployment

Replace all example values and placeholders in the AWS overlay before deployment:

- `AWS_ACCOUNT_ID`
- `AWS_REGION`
- `REPLACE_WITH_IMAGE_TAG`
- `REPLACE_WITH_ACM_CERTIFICATE_ARN`
- `relay.example.com`

Update frontend URLs and CORS configuration to match your actual domain.

The Python AI configuration currently references `host.docker.internal`, which is intended for local development. Replace it with an AI endpoint reachable from the EKS cluster.

## Deployment Configuration Template

The `deployment.env.example` file documents non-secret settings for a future AWS deployment. It is a reference template only; Kustomize does not automatically load it.

Before deployment, use these values to configure `infrastructure/kubernetes/overlays/aws/kustomization.yaml` and `ingress.yaml`, or connect them through a reviewed deployment script or CI/CD workflow. Keep account-specific values and credentials out of committed manifests. Do not put passwords, tokens, or API keys in this template.

The `AI_ENDPOINT_URL` value is a reminder to configure an AI endpoint reachable from EKS; update the Python AI ConfigMap accordingly. Do not deploy while any `REPLACE_WITH_` placeholders or the example domain remain.

## Container Images

Build and push the application images to ECR before deployment. Confirm that `infrastructure/kubernetes/overlays/aws/kustomization.yaml` uses the correct account, Region, repository names, and image tags.

Required application images:

- `relay-frontend`
- `relay-backend`
- `relay-api-gateway`
- `relay-go-api`
- `relay-go-worker`
- `relay-nest-api`
- `relay-python-ai`
- `relay-recording-worker`

Required supporting-service images:

- `relay-redis` (upstream tag `7-alpine`)
- `relay-rabbitmq` (upstream tag `4-management`)
- `relay-mongodb` (upstream tag `8`)
- `relay-postgres` (upstream tag `pg17`)

Terraform defines all twelve optional ECR repositories when
`create_ecr_repositories` is enabled. Creating a repository does not copy
an image into it. Mirror each upstream supporting-service image into its
matching ECR repository using the listed tag, and build and push each
application image with the tag configured in the Kustomize overlay.
Verify that every referenced image exists in ECR before deployment.

## Secrets

AWS-specific Secret manifests are intentionally excluded from this overlay. Never commit passwords, API keys, tokens, or other credentials to Git.

Before deployment, securely provide the Kubernetes Secrets expected by the application manifests, or configure a reviewed integration with AWS Secrets Manager and an appropriate secrets operator.

Verify that every required Secret name and key matches the corresponding `secretKeyRef` in the rendered Kubernetes manifests.

The `nest-api-secret` must include `mongodb-uri`, `database-url`, `jwt-secret`, `internal-api-token`, and `python-ai-token`. The `python-ai-token` value must match the token configured in `python-ai-secret` and `backend-secret`, so Nest API, the Express backend, and Python AI authenticate to the same internal AI service.

## AWS Secrets Manager and External Secrets Operator

The Terraform configuration in `infrastructure/aws/terraform/` defines an
optional, dedicated IAM role and EKS Pod Identity association for External
Secrets Operator (ESO). Both are disabled by default. Enabling
`create_external_secrets_iam_role` plans the role, its read-only policy, and
the association for namespace `external-secrets` and ServiceAccount
`external-secrets`.

The policy permits only `secretsmanager:GetSecretValue` and
`secretsmanager:DescribeSecret` for these seven configured secret-name
patterns under `relay/dev/`:

| Secrets Manager name | Required keys |
| --- | --- |
| `relay/dev/backend-secret` | `mongodb-uri`, `jwt-secret`, `python-ai-token` |
| `relay/dev/go-api-secret` | `internal-api-token` |
| `relay/dev/rabbitmq-secret` | `username`, `password` |
| `relay/dev/nest-api-secret` | `mongodb-uri`, `database-url`, `jwt-secret`, `internal-api-token`, `python-ai-token` |
| `relay/dev/python-ai-secret` | `database-url`, `python-ai-token` |
| `relay/dev/mongodb-secret` | `username`, `password` |
| `relay/dev/postgres-secret` | `password` |

Keep shared values consistent: `python-ai-token` must match across
`backend-secret`, `nest-api-secret`, and `python-ai-secret`. Keep JWT and
database credentials consistent with the services that consume them.

The repository includes the ESO Helm values, a namespaced `SecretStore`,
and seven `ExternalSecret` resources under
`infrastructure/kubernetes/infra/external-secrets/`. These resources are
installed separately from the AWS application overlay.

Follow `infrastructure/kubernetes/infra/external-secrets/README.md` to
install the pinned ESO chart and apply the secret synchronization manifests.
Before relying on synchronization:

1. Create the seven Secrets Manager records with the documented JSON
   properties and verify their names and values.
2. Enable and plan the ESO IAM role and EKS Pod Identity association.
3. Install the EKS Pod Identity Agent and verify access to EKS Auth.
4. Install ESO and apply the repository's `SecretStore` and `ExternalSecret`
   resources.
5. Verify synchronization, rotation behavior, and application reload behavior.
6. If using a customer-managed KMS key, review the required key policy and
   narrowly scoped permissions.

The Terraform role and association do not create the Secrets Manager records,
install ESO, or apply the Kubernetes synchronization manifests.

The Terraform secret-name defaults assume the AWS Secrets Manager names above.
The trailing wildcard in each ARN pattern accommodates the generated ARN
suffix; it does not mean the secret value belongs in Terraform.

Never commit secret values, credentials, populated environment files, or
Terraform state containing sensitive values.

## Persistent Storage

The AWS overlay defines an encrypted Amazon EBS `gp3` StorageClass at
`resources/storageclass-gp3.yaml`. It uses the `ebs.csi.aws.com` provisioner,
`WaitForFirstConsumer` volume binding, and supports volume expansion. The
recording-worker PVC explicitly selects this StorageClass.

The Terraform configuration provides an optional EKS EBS CSI managed add-on
and a dedicated IAM role using the AWS-managed
`AmazonEBSCSIDriverPolicy`. Both the EBS CSI add-on and the EKS Pod Identity
Agent add-on are disabled by default. To plan them together, configure:

- `create_eks_pod_identity_agent_addon = true`
- `create_eks_ebs_csi_addon = true`
- `aws_account_id` with the 12-digit AWS account ID.
- `eks_cluster_name` with the target EKS cluster name.

The EBS CSI controller association is scoped to the `kube-system` namespace
and `ebs-csi-controller-sa` ServiceAccount. The EKS Pod Identity Agent must
also be installed and operational for this integration.

This StorageClass does not automatically configure persistent storage for
MongoDB, PostgreSQL, Redis, or RabbitMQ. Review each workload's storage class,
access mode, volume size, backup policy, and recovery procedure separately.
Evaluate managed AWS database and messaging services where appropriate.

The local Kubernetes overlay remains separate and retains its local storage
configuration. Do not apply the AWS StorageClass to the local Kind cluster.

## Ingress and HTTPS

The AWS Ingress uses the AWS Application Load Balancer Ingress class.

Before deploying:

1. Install and configure the AWS Load Balancer Controller.
2. Configure a valid ACM certificate ARN.
3. Replace the example hostname with your actual domain.
4. Configure DNS to point to the load balancer.
5. Review security groups and public exposure.

The local NGINX Ingress configuration is separate and should continue to serve local development.

## Validation

Run from the repository root:

    kubectl kustomize infrastructure/kubernetes/overlays/aws > /dev/null
    kubectl kustomize infrastructure/kubernetes/overlays/local > /dev/null

Both overlays should render successfully before deployment work continues. Rendering manifests does not create AWS resources.

## Call Recording Storage and EKS Pod Identity

The AWS overlay uses Amazon S3 for call recordings. The bucket name configured
in the Nest API ConfigMap is `relay-call-recordings`, in `us-east-1`.
Create this bucket in the same Region as the EKS cluster before deploying
recording workloads. Keep S3 Block Public Access enabled; uploads and downloads
use presigned URLs.

IAM policy and trust-policy templates are in
`infrastructure/aws/iam/recording-storage/`.

### Least-privilege roles

Create two separate IAM roles:

| IAM role | Kubernetes namespace | ServiceAccount | S3 permissions |
| --- | --- | --- | --- |
| `RelayNestApiRecordingStorageRole` | `relay` | `relay-nest-api-recording-storage` | `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` |
| `RelayRecordingWorkerStorageRole` | `relay` | `relay-recording-worker-storage` | `s3:GetObject` |

Both policies are restricted to
`arn:aws:s3:::relay-call-recordings/call-recordings/*`.
No bucket-list permission is included.

Each role must use its corresponding Pod Identity trust-policy template.
Replace the account, Region, and cluster placeholders with the actual values.
The trust policy permits the EKS Pod Identity service principal to assume the
role and restricts the source to the intended AWS account and EKS cluster.

### EKS Pod Identity prerequisites

1. Install the EKS Pod Identity Agent add-on (`eks-pod-identity-agent`) if it
   is not already installed.
2. Ensure the cluster's worker nodes can reach the EKS Auth service.
3. Create the two IAM roles and attach their corresponding S3 policies.
4. Create one EKS Pod Identity association per role, using the exact namespace
   and ServiceAccount names in the table above.
5. Verify the associations and test upload, download, verification, and
   deletion through the Nest API. Verify that the worker can download objects
   but cannot upload or delete them.

The ServiceAccount manifests do not contain IAM role annotations. EKS Pod
Identity associations are created in AWS and bind the IAM role to the EKS
cluster, namespace, and ServiceAccount.

### AWS CLI command outline

The following commands are a reference for a future setup. They have not been
run. Set the account and cluster values first, and confirm the bucket and
cluster Region before creating resources.

Create the two customer-managed IAM policies from the repository root:

    aws iam create-policy --policy-name RelayNestApiRecordingStoragePolicy --policy-document file://infrastructure/aws/iam/recording-storage/nest-api-recording-storage-policy.json

    aws iam create-policy --policy-name RelayRecordingWorkerStoragePolicy --policy-document file://infrastructure/aws/iam/recording-storage/recording-worker-storage-policy.json

Before creating either role, render its trust-policy template with the actual
AWS account ID, Region, and EKS cluster name. Then create the role using the
rendered trust policy and attach the matching policy ARN:

    aws iam create-role --role-name RelayNestApiRecordingStorageRole --assume-role-policy-document file:///path/to/rendered-nest-api-trust-policy.json

    aws iam attach-role-policy --role-name RelayNestApiRecordingStorageRole --policy-arn arn:aws:iam::AWS_ACCOUNT_ID:policy/RelayNestApiRecordingStoragePolicy

    aws iam create-role --role-name RelayRecordingWorkerStorageRole --assume-role-policy-document file:///path/to/rendered-recording-worker-trust-policy.json

    aws iam attach-role-policy --role-name RelayRecordingWorkerStorageRole --policy-arn arn:aws:iam::AWS_ACCOUNT_ID:policy/RelayRecordingWorkerStoragePolicy

Install the Pod Identity Agent add-on if it is not already installed:

    aws eks create-addon --cluster-name EKS_CLUSTER_NAME --addon-name eks-pod-identity-agent --region AWS_REGION

Create the associations, substituting each role's actual ARN:

    aws eks create-pod-identity-association --cluster-name EKS_CLUSTER_NAME --namespace relay --service-account relay-nest-api-recording-storage --role-arn arn:aws:iam::AWS_ACCOUNT_ID:role/RelayNestApiRecordingStorageRole --region AWS_REGION

    aws eks create-pod-identity-association --cluster-name EKS_CLUSTER_NAME --namespace relay --service-account relay-recording-worker-storage --role-arn arn:aws:iam::AWS_ACCOUNT_ID:role/RelayRecordingWorkerStorageRole --region AWS_REGION

Check whether the add-on already exists before attempting to create it.
Use the actual policy ARNs returned by IAM if policy names or paths differ.
Do not run these commands until the AWS account, cluster, and bucket are ready.

## Deployment Safety

Before deployment, review IAM permissions, network exposure, secrets, persistent storage, image availability, health probes, resource requests, and expected AWS costs.

## Maintaining the Overlay

The AWS overlay contains copies of selected application and infrastructure manifests under `resources/`. When the original manifests change, review and synchronize these copies intentionally; they do not update automatically.
