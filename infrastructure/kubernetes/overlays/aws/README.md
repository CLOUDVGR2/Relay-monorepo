# AWS Kubernetes Overlay

This overlay prepares Relay for a future deployment to Amazon EKS. It is separate from the local Minikube configuration and does not create AWS resources.

## Overview

The AWS overlay includes application and infrastructure Kubernetes manifests, AWS-specific configuration, Amazon ECR image references, an AWS Application Load Balancer Ingress, and backend Horizontal Pod Autoscaler configuration. It currently does not deploy the Go API gateway; do not assume the Compose gateway routes or health endpoint exist in this overlay until gateway deployment, service, ingress routing, probes, and image mapping are added and validated.

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
- `relay-go-api`
- `relay-go-worker`
- `relay-nest-api`
- `relay-python-ai`

## Secrets

AWS-specific Secret manifests are intentionally excluded from this overlay. Never commit passwords, API keys, tokens, or other credentials to Git.

Before deployment, securely provide the Kubernetes Secrets expected by the application manifests, or configure a reviewed integration with AWS Secrets Manager and an appropriate secrets operator.

Verify that every required Secret name and key matches the corresponding `secretKeyRef` in the rendered Kubernetes manifests.

## Persistent Storage

MongoDB, PostgreSQL, Redis, and RabbitMQ have persistent storage requirements in the current manifests.

Review storage classes, access modes, volume sizes, backup policies, and recovery procedures before deployment. Confirm that the cluster has a suitable storage provisioner, such as the Amazon EBS CSI driver, or evaluate managed AWS database and messaging services.

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

## Deployment Safety

Before deployment, review IAM permissions, network exposure, secrets, persistent storage, image availability, health probes, resource requests, and expected AWS costs.

## Maintaining the Overlay

The AWS overlay contains copies of selected application and infrastructure manifests under `resources/`. When the original manifests change, review and synchronize these copies intentionally; they do not update automatically.
