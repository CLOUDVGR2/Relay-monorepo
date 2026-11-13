mock_provider "aws" {}

run "default_resources_disabled" {
  command = plan

  assert {
    condition     = length(aws_ecr_repository.application) == 0
    error_message = "ECR repositories must remain disabled by default."
  }

  assert {
    condition     = length(aws_s3_bucket.recordings) == 0
    error_message = "The recording bucket must remain disabled by default."
  }

  assert {
    condition     = length(aws_iam_role.nest_api_recording_storage) == 0
    error_message = "The Nest API IAM role must remain disabled by default."
  }

  assert {
    condition     = length(aws_iam_role.recording_worker_storage) == 0
    error_message = "The recording worker IAM role must remain disabled by default."
  }

  assert {
    condition     = length(aws_iam_role.external_secrets) == 0
    error_message = "The External Secrets IAM role must remain disabled by default."
  }

  assert {
    condition     = length(aws_eks_pod_identity_association.external_secrets) == 0
    error_message = "The External Secrets Pod Identity association must remain disabled by default."
  }

  assert {
    condition = (
      length(aws_eks_pod_identity_association.nest_api_recording_storage) == 0 &&
      length(aws_eks_pod_identity_association.recording_worker_storage) == 0
    )
    error_message = "Recording workload Pod Identity associations must remain disabled by default."
  }

  assert {
    condition     = length(aws_eks_addon.pod_identity_agent) == 0
    error_message = "The EKS Pod Identity Agent add-on must remain disabled by default."
  }

  assert {
    condition = (
      length(aws_iam_role.ebs_csi) == 0 &&
      length(aws_iam_role_policy_attachment.ebs_csi) == 0 &&
      length(aws_eks_addon.ebs_csi) == 0
    )
    error_message = "The EBS CSI IAM role, policy attachment, and add-on must remain disabled by default."
  }

  assert {
    condition = (
      length(aws_iam_policy.aws_load_balancer_controller) == 0 &&
      length(aws_iam_role.aws_load_balancer_controller) == 0 &&
      length(aws_iam_role_policy_attachment.aws_load_balancer_controller) == 0 &&
      length(aws_eks_pod_identity_association.aws_load_balancer_controller) == 0
    )
    error_message = "AWS Load Balancer Controller IAM resources and association must remain disabled by default."
  }

  assert {
    condition     = length(aws_vpc.relay) == 0
    error_message = "The VPC must remain disabled by default."
  }

  assert {
    condition = (
      length(aws_internet_gateway.relay) == 0 &&
      length(aws_subnet.public) == 0 &&
      length(aws_subnet.private) == 0
    )
    error_message = "Network gateways and subnets must remain disabled by default."
  }

  assert {
    condition = (
      length(aws_route_table.public) == 0 &&
      length(aws_route_table.private) == 0
    )
    error_message = "Network route tables must remain disabled by default."
  }
}

run "optional_resources_can_be_planned" {
  command = plan

  variables {
    create_ecr_repositories                      = true
    create_recording_bucket                      = true
    create_recording_iam_roles                   = true
    create_external_secrets_iam_role             = true
    create_vpc                                   = true
    aws_account_id                               = "123456789012"
    create_eks_pod_identity_agent_addon          = true
    create_eks_ebs_csi_addon                     = true
    create_eks_load_balancer_controller_iam_role = true
    eks_cluster_name                             = "relay-test"
    recording_bucket_name                        = "relay-call-recordings-terraform-test"
  }

  assert {
    condition = (
      length(aws_iam_role.ebs_csi) == 1 &&
      length(aws_iam_role_policy_attachment.ebs_csi) == 1 &&
      aws_iam_role_policy_attachment.ebs_csi[0].policy_arn == "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy" &&
      length(aws_eks_addon.ebs_csi) == 1 &&
      aws_eks_addon.ebs_csi[0].addon_name == "aws-ebs-csi-driver" &&
      length(aws_eks_addon.ebs_csi[0].pod_identity_association) == 1 &&
      one(aws_eks_addon.ebs_csi[0].pod_identity_association).service_account == "ebs-csi-controller-sa"
    )
    error_message = "The EBS CSI add-on must use its dedicated role, AWS-managed policy, and controller ServiceAccount association."
  }

  assert {
    condition = (
      length(aws_iam_policy.aws_load_balancer_controller) == 1 &&
      jsondecode(aws_iam_policy.aws_load_balancer_controller[0].policy).Version == "2012-10-17" &&
      length(jsondecode(aws_iam_policy.aws_load_balancer_controller[0].policy).Statement) == 16 &&
      length(aws_iam_role.aws_load_balancer_controller) == 1 &&
      length(aws_iam_role_policy_attachment.aws_load_balancer_controller) == 1 &&
      aws_iam_role_policy_attachment.aws_load_balancer_controller[0].role ==
      aws_iam_role.aws_load_balancer_controller[0].name
    )
    error_message = "The AWS Load Balancer Controller must receive its pinned v2.14.1 policy and dedicated IAM role attachment."
  }

  assert {
    condition = (
      length(aws_eks_pod_identity_association.aws_load_balancer_controller) == 1 &&
      aws_eks_pod_identity_association.aws_load_balancer_controller[0].cluster_name == var.eks_cluster_name &&
      aws_eks_pod_identity_association.aws_load_balancer_controller[0].namespace == "kube-system" &&
      aws_eks_pod_identity_association.aws_load_balancer_controller[0].service_account == "aws-load-balancer-controller"
    )
    error_message = "The AWS Load Balancer Controller Pod Identity association must target kube-system/aws-load-balancer-controller."
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.aws_load_balancer_controller[0].assume_role_policy).Statement[0].Principal.Service == "pods.eks.amazonaws.com" &&
      jsondecode(aws_iam_role.aws_load_balancer_controller[0].assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == "123456789012" &&
      jsondecode(aws_iam_role.aws_load_balancer_controller[0].assume_role_policy).Statement[0].Condition.StringEquals["aws:RequestTag/kubernetes-namespace"] == "kube-system" &&
      jsondecode(aws_iam_role.aws_load_balancer_controller[0].assume_role_policy).Statement[0].Condition.StringEquals["aws:RequestTag/kubernetes-service-account"] == "aws-load-balancer-controller" &&
      jsondecode(aws_iam_role.aws_load_balancer_controller[0].assume_role_policy).Statement[0].Condition.ArnEquals["aws:SourceArn"] ==
      "arn:aws:eks:us-east-1:123456789012:cluster/relay-test"
    )
    error_message = "The controller Pod Identity trust must be scoped to the configured account, cluster, namespace, and ServiceAccount."
  }

  assert {
    condition = (
      length(aws_ecr_repository.application) == 12 &&
      alltrue([
        for name in [
          "relay-frontend",
          "relay-backend",
          "relay-api-gateway",
          "relay-go-api",
          "relay-go-worker",
          "relay-nest-api",
          "relay-python-ai",
          "relay-recording-worker",
          "relay-redis",
          "relay-rabbitmq",
          "relay-mongodb",
          "relay-postgres",
        ] : contains(keys(aws_ecr_repository.application), name)
      ])
    )
    error_message = "The configuration must define all eight application and four supporting-service ECR repositories."
  }

  assert {
    condition     = length(aws_s3_bucket.recordings) == 1
    error_message = "The configuration must define one recording bucket."
  }

  assert {
    condition = (
      length(aws_vpc.relay) == 1 &&
      aws_vpc.relay[0].cidr_block == "10.20.0.0/16" &&
      aws_vpc.relay[0].enable_dns_support &&
      aws_vpc.relay[0].enable_dns_hostnames
    )
    error_message = "The enabled VPC must use the configured CIDR and DNS settings."
  }

  assert {
    condition = (
      length(aws_subnet.public) == 2 &&
      length(aws_subnet.private) == 2 &&
      length(distinct([for subnet in aws_subnet.public : subnet.availability_zone])) == 2 &&
      length(distinct([for subnet in aws_subnet.private : subnet.availability_zone])) == 2
    )
    error_message = "The VPC must have two public and two private subnets across two Availability Zones."
  }

  assert {
    condition = alltrue([
      for subnet in aws_subnet.public :
      subnet.map_public_ip_on_launch &&
      subnet.tags["kubernetes.io/role/elb"] == "1"
    ])
    error_message = "Public subnets must assign public IPs on launch and carry the ELB discovery tag."
  }

  assert {
    condition = alltrue([
      for subnet in aws_subnet.private :
      subnet.tags["kubernetes.io/role/internal-elb"] == "1" &&
      subnet.tags["kubernetes.io/cluster/relay-test"] == "shared"
    ])
    error_message = "Private subnets must carry internal load-balancer and EKS cluster discovery tags."
  }

  assert {
    condition = (
      length(aws_internet_gateway.relay) == 1 &&
      length(aws_route.public_internet) == 1 &&
      aws_route.public_internet[0].destination_cidr_block == "0.0.0.0/0" &&
      length(aws_route_table_association.public) == 2 &&
      length(aws_route_table_association.private) == 2
    )
    error_message = "The public internet route and all four subnet route-table associations must be configured."
  }

  assert {
    condition     = length(aws_iam_role.nest_api_recording_storage) == 1 && length(aws_iam_role.recording_worker_storage) == 1
    error_message = "Both recording-storage IAM roles must be defined."
  }

  assert {
    condition = (
      length(aws_eks_pod_identity_association.nest_api_recording_storage) == 1 &&
      aws_eks_pod_identity_association.nest_api_recording_storage[0].cluster_name == var.eks_cluster_name &&
      aws_eks_pod_identity_association.nest_api_recording_storage[0].namespace == "relay" &&
      aws_eks_pod_identity_association.nest_api_recording_storage[0].service_account == "relay-nest-api-recording-storage"
    )
    error_message = "The Nest API Pod Identity association must bind its dedicated role to the relay service account."
  }

  assert {
    condition = (
      length(aws_eks_pod_identity_association.recording_worker_storage) == 1 &&
      aws_eks_pod_identity_association.recording_worker_storage[0].cluster_name == var.eks_cluster_name &&
      aws_eks_pod_identity_association.recording_worker_storage[0].namespace == "relay" &&
      aws_eks_pod_identity_association.recording_worker_storage[0].service_account == "relay-recording-worker-storage"
    )
    error_message = "The recording worker Pod Identity association must bind its dedicated role to the relay service account."
  }

  assert {
    condition = (
      length(aws_iam_role.external_secrets) == 1 &&
      length(aws_iam_policy.external_secrets) == 1
    )
    error_message = "The dedicated External Secrets IAM role and policy must be defined when enabled."
  }

  assert {
    condition = (
      length(aws_eks_pod_identity_association.external_secrets) == 1 &&
      aws_eks_pod_identity_association.external_secrets[0].cluster_name == var.eks_cluster_name &&
      aws_eks_pod_identity_association.external_secrets[0].namespace == "external-secrets" &&
      aws_eks_pod_identity_association.external_secrets[0].service_account == "external-secrets"
    )
    error_message = "The ESO Pod Identity association must target the configured cluster and dedicated namespace and ServiceAccount."
  }

  assert {
    condition = (
      length(aws_eks_addon.pod_identity_agent) == 1 &&
      aws_eks_addon.pod_identity_agent[0].cluster_name == var.eks_cluster_name &&
      aws_eks_addon.pod_identity_agent[0].addon_name == "eks-pod-identity-agent"
    )
    error_message = "The Pod Identity Agent add-on must target the configured existing EKS cluster."
  }

  assert {
    condition = (
      toset(jsondecode(aws_iam_policy.external_secrets[0].policy).Statement[0].Action) ==
      toset(["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]) &&
      toset(jsondecode(aws_iam_policy.external_secrets[0].policy).Statement[0].Resource) ==
      toset([
        for name in var.external_secrets_secret_names :
        "arn:aws:secretsmanager:us-east-1:123456789012:secret:relay/dev/${name}-*"
      ])
    )
    error_message = "The External Secrets policy must allow only read access to the seven configured secret ARNs."
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.external_secrets[0].assume_role_policy).Statement[0].Principal.Service == "pods.eks.amazonaws.com" &&
      jsondecode(aws_iam_role.external_secrets[0].assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == "123456789012" &&
      jsondecode(aws_iam_role.external_secrets[0].assume_role_policy).Statement[0].Condition.StringEquals["aws:RequestTag/kubernetes-namespace"] == "external-secrets" &&
      jsondecode(aws_iam_role.external_secrets[0].assume_role_policy).Statement[0].Condition.StringEquals["aws:RequestTag/kubernetes-service-account"] == "external-secrets" &&
      jsondecode(aws_iam_role.external_secrets[0].assume_role_policy).Statement[0].Condition.ArnEquals["aws:SourceArn"] ==
      "arn:aws:eks:us-east-1:123456789012:cluster/relay-test"
    )
    error_message = "The External Secrets role trust must be restricted to the configured EKS cluster, account, namespace, and ServiceAccount."
  }

  assert {
    condition     = length(aws_iam_policy.nest_api_recording_storage) == 1 && length(aws_iam_policy.recording_worker_storage) == 1
    error_message = "Both least-privilege IAM policies must be defined."
  }

  assert {
    condition = alltrue([
      for repo in aws_ecr_repository.application :
      repo.image_scanning_configuration[0].scan_on_push &&
      repo.encryption_configuration[0].encryption_type == "AES256"
    ])
    error_message = "Every ECR repository must scan images on push and use AES256 encryption."
  }

  assert {
    condition = (
      aws_s3_bucket_public_access_block.recordings[0].block_public_acls &&
      aws_s3_bucket_public_access_block.recordings[0].block_public_policy &&
      aws_s3_bucket_public_access_block.recordings[0].ignore_public_acls &&
      aws_s3_bucket_public_access_block.recordings[0].restrict_public_buckets
    )
    error_message = "The recording bucket must block all public access."
  }

  assert {
    condition = alltrue([
      for rule in aws_s3_bucket_server_side_encryption_configuration.recordings[0].rule :
      rule.apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    ])
    error_message = "The recording bucket must use AES256 server-side encryption."
  }

  assert {
    condition = (
      toset(jsondecode(aws_iam_policy.nest_api_recording_storage[0].policy).Statement[0].Action) ==
      toset(["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]) &&
      jsondecode(aws_iam_policy.nest_api_recording_storage[0].policy).Statement[0].Resource ==
      "arn:aws:s3:::relay-call-recordings-terraform-test/call-recordings/*"
    )
    error_message = "The Nest API policy must allow only the intended recording-object actions and path."
  }

  assert {
    condition = (
      toset(jsondecode(aws_iam_policy.recording_worker_storage[0].policy).Statement[0].Action) ==
      toset(["s3:GetObject"]) &&
      jsondecode(aws_iam_policy.recording_worker_storage[0].policy).Statement[0].Resource ==
      "arn:aws:s3:::relay-call-recordings-terraform-test/call-recordings/*"
    )
    error_message = "The recording worker policy must allow only read access to recording objects."
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.nest_api_recording_storage[0].assume_role_policy).Statement[0].Principal.Service == "pods.eks.amazonaws.com" &&
      toset(jsondecode(aws_iam_role.nest_api_recording_storage[0].assume_role_policy).Statement[0].Action) ==
      toset(["sts:AssumeRole", "sts:TagSession"]) &&
      jsondecode(aws_iam_role.nest_api_recording_storage[0].assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == "123456789012" &&
      jsondecode(aws_iam_role.nest_api_recording_storage[0].assume_role_policy).Statement[0].Condition.StringEquals["aws:RequestTag/kubernetes-namespace"] == "relay" &&
      jsondecode(aws_iam_role.nest_api_recording_storage[0].assume_role_policy).Statement[0].Condition.StringEquals["aws:RequestTag/kubernetes-service-account"] == "relay-nest-api-recording-storage" &&
      jsondecode(aws_iam_role.nest_api_recording_storage[0].assume_role_policy).Statement[0].Condition.ArnEquals["aws:SourceArn"] ==
      "arn:aws:eks:us-east-1:123456789012:cluster/relay-test"
    )
    error_message = "relay-nest-api-recording-storage must restrict EKS Pod Identity trust to its configured account, cluster, namespace, and service account."
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.recording_worker_storage[0].assume_role_policy).Statement[0].Principal.Service == "pods.eks.amazonaws.com" &&
      toset(jsondecode(aws_iam_role.recording_worker_storage[0].assume_role_policy).Statement[0].Action) ==
      toset(["sts:AssumeRole", "sts:TagSession"]) &&
      jsondecode(aws_iam_role.recording_worker_storage[0].assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == "123456789012" &&
      jsondecode(aws_iam_role.recording_worker_storage[0].assume_role_policy).Statement[0].Condition.StringEquals["aws:RequestTag/kubernetes-namespace"] == "relay" &&
      jsondecode(aws_iam_role.recording_worker_storage[0].assume_role_policy).Statement[0].Condition.StringEquals["aws:RequestTag/kubernetes-service-account"] == "relay-recording-worker-storage" &&
      jsondecode(aws_iam_role.recording_worker_storage[0].assume_role_policy).Statement[0].Condition.ArnEquals["aws:SourceArn"] ==
      "arn:aws:eks:us-east-1:123456789012:cluster/relay-test"
    )
    error_message = "relay-recording-worker-storage must restrict EKS Pod Identity trust to its configured account, cluster, namespace, and service account."
  }
}

run "single_nat_gateway_can_be_planned" {
  command = plan

  variables {
    create_vpc         = true
    enable_nat_gateway = true
    single_nat_gateway = true
  }

  assert {
    condition = (
      length(aws_eip.nat) == 1 &&
      length(aws_nat_gateway.relay) == 1 &&
      length(aws_route.private_nat) == 2
    )
    error_message = "Single-NAT mode must create one NAT gateway and route both private subnets through it."
  }
}

run "nat_gateway_per_az_can_be_planned" {
  command = plan

  variables {
    create_vpc         = true
    enable_nat_gateway = true
    single_nat_gateway = false
  }

  assert {
    condition = (
      length(aws_eip.nat) == 2 &&
      length(aws_nat_gateway.relay) == 2 &&
      length(aws_route.private_nat) == 2
    )
    error_message = "Per-AZ NAT mode must create two NAT gateways and two private routes."
  }
}

run "cost_conscious_profile_uses_one_nat_gateway" {
  command = plan

  variables {
    create_vpc         = true
    enable_nat_gateway = true
    network_profile    = "cost_conscious"
    single_nat_gateway = false
  }

  assert {
    condition = (
      length(aws_eip.nat) == 1 &&
      length(aws_nat_gateway.relay) == 1 &&
      length(aws_route.private_nat) == 2
    )
    error_message = "The cost-conscious profile must use one shared NAT gateway for both private subnets."
  }
}

run "balanced_profile_uses_nat_per_az" {
  command = plan

  variables {
    create_vpc         = true
    enable_nat_gateway = true
    network_profile    = "balanced"
    single_nat_gateway = true
  }

  assert {
    condition = (
      length(aws_eip.nat) == 2 &&
      length(aws_nat_gateway.relay) == 2 &&
      length(aws_route.private_nat) == 2
    )
    error_message = "The balanced profile must create one NAT gateway per Availability Zone."
  }
}

run "high_availability_three_az_network_can_be_planned" {
  command = plan

  variables {
    create_vpc         = true
    enable_nat_gateway = true
    network_profile    = "high_availability"
    single_nat_gateway = true

    availability_zones = [
      "us-east-1a",
      "us-east-1b",
      "us-east-1c",
    ]

    public_subnet_cidrs = [
      "10.20.0.0/20",
      "10.20.16.0/20",
      "10.20.64.0/20",
    ]

    private_subnet_cidrs = [
      "10.20.32.0/20",
      "10.20.48.0/20",
      "10.20.80.0/20",
    ]
  }

  assert {
    condition = (
      length(aws_subnet.public) == 3 &&
      length(aws_subnet.private) == 3 &&
      length(aws_eip.nat) == 3 &&
      length(aws_nat_gateway.relay) == 3 &&
      length(aws_route.private_nat) == 3
    )
    error_message = "The high-availability profile must create public and private subnets and one NAT gateway per Availability Zone."
  }
}

run "alb_security_group_disabled_by_default" {
  command = plan

  assert {
    condition     = length(aws_security_group.alb) == 0
    error_message = "The ALB security group must remain disabled when create_vpc is false."
  }
}

run "alb_security_group_can_be_planned" {
  command = plan

  variables {
    create_vpc = true
  }

  assert {
    condition = (
      length(aws_security_group.alb) == 1 &&
      length(aws_security_group.alb[0].ingress) == 2 &&
      toset([
        for rule in aws_security_group.alb[0].ingress :
        rule.from_port
      ]) == toset([80, 443]) &&
      alltrue([
        for rule in aws_security_group.alb[0].ingress :
        rule.protocol == "tcp" &&
        rule.to_port == rule.from_port &&
        toset(rule.cidr_blocks) == toset(["0.0.0.0/0"])
      ])
    )
    error_message = "The ALB security group must allow only public TCP ports 80 and 443 inbound."
  }
}


run "rejects_overlapping_subnet_cidrs" {
  command = plan

  variables {
    create_vpc = true
    private_subnet_cidrs = [
      "10.20.8.0/21",
      "10.20.48.0/20"
    ]
  }

  expect_failures = [aws_vpc.relay]
}

run "rejects_subnet_cidrs_outside_vpc" {
  command = plan

  variables {
    create_vpc = true
    private_subnet_cidrs = [
      "10.21.32.0/20",
      "10.20.48.0/20"
    ]
  }

  expect_failures = [aws_vpc.relay]
}

run "rejects_vpc_prefix_outside_aws_limits" {
  command = plan

  variables {
    vpc_cidr = "10.20.0.0/15"
  }

  expect_failures = [var.vpc_cidr]
}

run "rejects_subnet_prefix_outside_aws_limits" {
  command = plan

  variables {
    private_subnet_cidrs = [
      "10.20.32.0/29",
      "10.20.48.0/20"
    ]
  }

  expect_failures = [var.private_subnet_cidrs]
}

run "rejects_availability_zones_from_different_region" {
  command = plan

  variables {
    aws_region = "us-east-1"
    availability_zones = [
      "us-west-2a",
      "us-west-2b"
    ]
  }

  expect_failures = [var.availability_zones]
}


run "eks_resources_disabled_by_default" {
  command = plan

  assert {
    condition = (
      length(aws_eks_cluster.relay) == 0 &&
      length(aws_iam_role.eks_cluster) == 0 &&
      length(aws_iam_role_policy_attachment.eks_cluster) == 0 &&
      length(aws_eks_node_group.relay) == 0 &&
      length(aws_iam_role.eks_node) == 0 &&
      length(aws_iam_role_policy_attachment.eks_worker_node) == 0 &&
      length(aws_iam_role_policy_attachment.eks_cni) == 0 &&
      length(aws_iam_role_policy_attachment.eks_ecr_pull) == 0
    )
    error_message = "EKS cluster resources and IAM permissions must remain disabled by default."
  }
}

run "eks_cluster_can_be_planned_securely" {
  command = plan

  variables {
    create_vpc                 = true
    create_eks_cluster         = true
    eks_cluster_name           = "relay-test"
    eks_cluster_admin_role_arn = "arn:aws:iam::123456789012:role/relay-test-admin"
  }

  assert {
    condition = (
      length(aws_eks_cluster.relay) == 1 &&
      aws_eks_cluster.relay[0].name == "relay-test" &&
      aws_eks_cluster.relay[0].version == "1.37"
    )
    error_message = "The EKS cluster must use the configured name and Kubernetes version."
  }

  assert {
    condition = (
      aws_eks_cluster.relay[0].vpc_config[0].endpoint_private_access &&
      !aws_eks_cluster.relay[0].vpc_config[0].endpoint_public_access &&
      length(aws_subnet.private) == 2
    )
    error_message = "The EKS API must be private by default and use both private subnets."
  }

  assert {
    condition = (
      length(aws_iam_role.eks_cluster) == 1 &&
      length(aws_iam_role_policy_attachment.eks_cluster) == 1 &&
      aws_iam_role_policy_attachment.eks_cluster[0].policy_arn == "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
    )
    error_message = "The EKS control plane must use its dedicated IAM role and cluster policy."
  }

  assert {
    condition = (
      toset(aws_eks_cluster.relay[0].enabled_cluster_log_types) ==
      toset(["api", "audit", "authenticator", "controllerManager", "scheduler"])
    )
    error_message = "All five supported EKS control-plane log types must be enabled by default."
  }

  assert {
    condition = (
      aws_eks_cluster.relay[0].access_config[0].authentication_mode == "API" &&
      !aws_eks_cluster.relay[0].access_config[0].bootstrap_cluster_creator_admin_permissions
    )
    error_message = "The cluster must use EKS API authentication without implicit creator-admin bootstrap."
  }

  assert {
    condition = (
      length(aws_eks_access_entry.cluster_admin) == 1 &&
      aws_eks_access_entry.cluster_admin[0].principal_arn == var.eks_cluster_admin_role_arn &&
      aws_eks_access_entry.cluster_admin[0].type == "STANDARD"
    )
    error_message = "The configured administrator role must have exactly one standard EKS access entry."
  }

  assert {
    condition = (
      length(aws_eks_access_policy_association.cluster_admin) == 1 &&
      aws_eks_access_policy_association.cluster_admin[0].principal_arn == var.eks_cluster_admin_role_arn &&
      aws_eks_access_policy_association.cluster_admin[0].policy_arn == "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy" &&
      aws_eks_access_policy_association.cluster_admin[0].access_scope[0].type == "cluster"
    )
    error_message = "The administrator role must receive the EKS cluster-admin policy scoped to the cluster."
  }
}

run "eks_managed_node_group_uses_private_subnets" {
  command = plan

  variables {
    create_vpc                 = true
    create_eks_cluster         = true
    create_eks_node_group      = true
    eks_cluster_name           = "relay-test"
    eks_cluster_admin_role_arn = "arn:aws:iam::123456789012:role/relay-test-admin"
  }

  assert {
    condition = (
      length(aws_eks_node_group.relay) == 1 &&
      aws_eks_node_group.relay[0].cluster_name == "relay-test" &&
      aws_eks_node_group.relay[0].capacity_type == "ON_DEMAND" &&
      aws_eks_node_group.relay[0].disk_size == 50
    )
    error_message = "The managed worker group must use the configured cluster, On-Demand capacity, and 50 GiB disks."
  }

  assert {
    condition     = length(local.relay_availability_zones) >= 2
    error_message = "EKS managed workers must use at least two availability zones."
  }

  assert {
    condition = (
      aws_eks_node_group.relay[0].scaling_config[0].min_size == 2 &&
      aws_eks_node_group.relay[0].scaling_config[0].desired_size == 2 &&
      aws_eks_node_group.relay[0].scaling_config[0].max_size == 4
    )
    error_message = "The worker group must use the configured 2-to-4 node scaling bounds."
  }

  assert {
    condition = (
      length(aws_iam_role.eks_node) == 1 &&
      jsondecode(aws_iam_role.eks_node[0].assume_role_policy).Statement[0].Principal.Service == "ec2.amazonaws.com" &&
      jsondecode(aws_iam_role.eks_node[0].assume_role_policy).Statement[0].Action == "sts:AssumeRole" &&
      length(aws_iam_role_policy_attachment.eks_worker_node) == 1 &&
      aws_iam_role_policy_attachment.eks_worker_node[0].policy_arn == "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy" &&
      length(aws_iam_role_policy_attachment.eks_cni) == 1 &&
      aws_iam_role_policy_attachment.eks_cni[0].policy_arn == "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy" &&
      length(aws_iam_role_policy_attachment.eks_ecr_pull) == 1 &&
      aws_iam_role_policy_attachment.eks_ecr_pull[0].policy_arn == "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly"
    )
    error_message = "Workers must use an EC2-trusted IAM role with the required EKS worker, CNI, and ECR pull policies."
  }
}

run "eks_public_endpoint_requires_restrictive_cidrs" {
  command = plan

  variables {
    create_vpc                               = true
    create_eks_cluster                       = true
    eks_cluster_name                         = "relay-test"
    eks_cluster_admin_role_arn               = "arn:aws:iam::123456789012:role/relay-test-admin"
    eks_cluster_endpoint_public_access       = true
    eks_cluster_endpoint_public_access_cidrs = ["203.0.113.10/32"]
  }

  assert {
    condition = (
      aws_eks_cluster.relay[0].vpc_config[0].endpoint_public_access &&
      toset(aws_eks_cluster.relay[0].vpc_config[0].public_access_cidrs) ==
      toset(["203.0.113.10/32"])
    )
    error_message = "Public EKS API access must use only the explicitly configured restrictive CIDRs."
  }
}

run "eks_cluster_requires_vpc" {
  command = plan

  variables {
    create_eks_cluster = true
    eks_cluster_name   = "relay-test"
  }

  expect_failures = [aws_eks_cluster.relay]
}

run "eks_cluster_requires_name" {
  command = plan

  variables {
    create_vpc         = true
    create_eks_cluster = true
  }

  expect_failures = [aws_eks_cluster.relay]
}


run "private_service_endpoints_disabled_by_default" {
  command = plan

  assert {
    condition = (
      length(aws_security_group.vpc_endpoints) == 0 &&
      length(aws_vpc_endpoint.eks_private_interface) == 0 &&
      length(aws_vpc_endpoint.s3) == 0
    )
    error_message = "Private AWS service endpoints must remain disabled by default."
  }
}

run "private_service_endpoints_can_be_planned" {
  command = plan

  variables {
    create_vpc                           = true
    create_eks_private_service_endpoints = true
  }

  assert {
    condition = (
      length(aws_security_group.vpc_endpoints) == 1 &&
      length(aws_vpc_endpoint.eks_private_interface) == 6 &&
      length(aws_vpc_endpoint.s3) == 1
    )
    error_message = "The private endpoint option must plan six interface endpoints, one S3 gateway endpoint, and one endpoint security group."
  }

  assert {
    condition = (
      toset(keys(aws_vpc_endpoint.eks_private_interface)) == toset([
        "eks-auth",
        "ec2",
        "elasticloadbalancing",
        "ecr.api",
        "ecr.dkr",
        "secretsmanager",
      ])
    )
    error_message = "The six expected private interface endpoint services must be configured."
  }

  assert {
    condition = (
      length(aws_vpc_endpoint.s3) == 1 &&
      aws_vpc_endpoint.s3[0].vpc_endpoint_type == "Gateway"
    )
    error_message = "The optional S3 endpoint must be a gateway endpoint."
  }
}
