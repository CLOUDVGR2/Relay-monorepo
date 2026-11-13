locals {
  ecr_repositories = toset([
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
  ])

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    },
    var.additional_tags
  )

  recording_object_arn = "arn:aws:s3:::${var.recording_bucket_name}/call-recordings/*"

  relay_nest_api_recording_storage_pod_identity_trust_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "pods.eks.amazonaws.com"
      }
      Action = [
        "sts:AssumeRole",
        "sts:TagSession"
      ]
      Condition = {
        StringEquals = {
          "aws:SourceAccount"                         = var.aws_account_id
          "aws:RequestTag/kubernetes-namespace"       = "relay"
          "aws:RequestTag/kubernetes-service-account" = "relay-nest-api-recording-storage"
        }
        ArnEquals = {
          "aws:SourceArn" = "arn:aws:eks:${var.aws_region}:${var.aws_account_id}:cluster/${var.eks_cluster_name}"
        }
      }
    }]
  })

  relay_recording_worker_storage_pod_identity_trust_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "pods.eks.amazonaws.com"
      }
      Action = [
        "sts:AssumeRole",
        "sts:TagSession"
      ]
      Condition = {
        StringEquals = {
          "aws:SourceAccount"                         = var.aws_account_id
          "aws:RequestTag/kubernetes-namespace"       = "relay"
          "aws:RequestTag/kubernetes-service-account" = "relay-recording-worker-storage"
        }
        ArnEquals = {
          "aws:SourceArn" = "arn:aws:eks:${var.aws_region}:${var.aws_account_id}:cluster/${var.eks_cluster_name}"
        }
      }
    }]
  })

  external_secrets_pod_identity_trust_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "pods.eks.amazonaws.com"
      }
      Action = [
        "sts:AssumeRole",
        "sts:TagSession"
      ]
      Condition = {
        StringEquals = {
          "aws:SourceAccount"                         = var.aws_account_id
          "aws:RequestTag/kubernetes-namespace"       = "external-secrets"
          "aws:RequestTag/kubernetes-service-account" = "external-secrets"
        }
        ArnEquals = {
          "aws:SourceArn" = "arn:aws:eks:${var.aws_region}:${var.aws_account_id}:cluster/${var.eks_cluster_name}"
        }
      }
    }]
  })

  ebs_csi_pod_identity_trust_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "pods.eks.amazonaws.com"
      }
      Action = [
        "sts:AssumeRole",
        "sts:TagSession"
      ]
      Condition = {
        StringEquals = {
          "aws:SourceAccount"                         = var.aws_account_id
          "aws:RequestTag/kubernetes-namespace"       = "kube-system"
          "aws:RequestTag/kubernetes-service-account" = "ebs-csi-controller-sa"
        }
        ArnEquals = {
          "aws:SourceArn" = "arn:aws:eks:${var.aws_region}:${var.aws_account_id}:cluster/${var.eks_cluster_name}"
        }
      }
    }]
  })

  aws_load_balancer_controller_pod_identity_trust_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "pods.eks.amazonaws.com"
      }
      Action = ["sts:AssumeRole", "sts:TagSession"]
      Condition = {
        StringEquals = {
          "aws:SourceAccount"                         = var.aws_account_id
          "aws:RequestTag/kubernetes-namespace"       = "kube-system"
          "aws:RequestTag/kubernetes-service-account" = "aws-load-balancer-controller"
        }
        ArnEquals = {
          "aws:SourceArn" = "arn:aws:eks:${var.aws_region}:${var.aws_account_id}:cluster/${var.eks_cluster_name}"
        }
      }
    }]
  })

  external_secrets_secret_arns = [
    for name in var.external_secrets_secret_names :
    "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:${var.project_name}/${var.environment}/${name}-*"
  ]
}

resource "aws_ecr_repository" "application" {
  for_each = var.create_ecr_repositories ? local.ecr_repositories : toset([])

  name                 = each.value
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = local.common_tags
}

resource "aws_s3_bucket" "recordings" {
  count = var.create_recording_bucket ? 1 : 0

  bucket        = var.recording_bucket_name
  force_destroy = false

  tags = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "recordings" {
  count = var.create_recording_bucket ? 1 : 0

  bucket = aws_s3_bucket.recordings[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "recordings" {
  count = var.create_recording_bucket ? 1 : 0

  bucket = aws_s3_bucket.recordings[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_iam_role" "nest_api_recording_storage" {
  count = var.create_recording_iam_roles ? 1 : 0

  name               = "${var.project_name}-${var.environment}-nest-api-recording-storage"
  assume_role_policy = local.relay_nest_api_recording_storage_pod_identity_trust_policy
  tags               = local.common_tags

  lifecycle {
    precondition {
      condition = (
        can(regex("^[0-9]{12}$", var.aws_account_id)) &&
        length(trimspace(var.eks_cluster_name)) > 0
      )
      error_message = "Set a valid aws_account_id and eks_cluster_name before enabling recording IAM roles."
    }
  }
}

resource "aws_iam_policy" "nest_api_recording_storage" {
  count = var.create_recording_iam_roles ? 1 : 0

  name = "${var.project_name}-${var.environment}-nest-api-recording-storage"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ]
      Resource = local.recording_object_arn
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "nest_api_recording_storage" {
  count = var.create_recording_iam_roles ? 1 : 0

  role       = aws_iam_role.nest_api_recording_storage[0].name
  policy_arn = aws_iam_policy.nest_api_recording_storage[0].arn
}

resource "aws_iam_role" "external_secrets" {
  count = var.create_external_secrets_iam_role ? 1 : 0

  name               = "${var.project_name}-${var.environment}-external-secrets"
  assume_role_policy = local.external_secrets_pod_identity_trust_policy
  tags               = local.common_tags

  lifecycle {
    precondition {
      condition = (
        can(regex("^[0-9]{12}$", var.aws_account_id)) &&
        length(trimspace(var.eks_cluster_name)) > 0
      )
      error_message = "Set a valid aws_account_id and eks_cluster_name before enabling the External Secrets IAM role."
    }
  }
}

resource "aws_iam_policy" "external_secrets" {
  count = var.create_external_secrets_iam_role ? 1 : 0

  name = "${var.project_name}-${var.environment}-external-secrets"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ]
      Resource = local.external_secrets_secret_arns
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "external_secrets" {
  count = var.create_external_secrets_iam_role ? 1 : 0

  role       = aws_iam_role.external_secrets[0].name
  policy_arn = aws_iam_policy.external_secrets[0].arn
}

resource "aws_eks_pod_identity_association" "external_secrets" {
  count = var.create_external_secrets_iam_role ? 1 : 0

  cluster_name    = var.eks_cluster_name
  namespace       = "external-secrets"
  service_account = "external-secrets"
  role_arn        = aws_iam_role.external_secrets[0].arn
}

resource "aws_iam_role" "recording_worker_storage" {
  count = var.create_recording_iam_roles ? 1 : 0

  name               = "${var.project_name}-${var.environment}-recording-worker-storage"
  assume_role_policy = local.relay_recording_worker_storage_pod_identity_trust_policy
  tags               = local.common_tags

  lifecycle {
    precondition {
      condition = (
        can(regex("^[0-9]{12}$", var.aws_account_id)) &&
        length(trimspace(var.eks_cluster_name)) > 0
      )
      error_message = "Set a valid aws_account_id and eks_cluster_name before enabling recording IAM roles."
    }
  }
}

resource "aws_iam_policy" "recording_worker_storage" {
  count = var.create_recording_iam_roles ? 1 : 0

  name = "${var.project_name}-${var.environment}-recording-worker-storage"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject"
      ]
      Resource = local.recording_object_arn
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "recording_worker_storage" {
  count = var.create_recording_iam_roles ? 1 : 0

  role       = aws_iam_role.recording_worker_storage[0].name
  policy_arn = aws_iam_policy.recording_worker_storage[0].arn
}

resource "aws_eks_pod_identity_association" "nest_api_recording_storage" {
  count = var.create_recording_iam_roles ? 1 : 0

  cluster_name    = var.eks_cluster_name
  namespace       = "relay"
  service_account = "relay-nest-api-recording-storage"
  role_arn        = aws_iam_role.nest_api_recording_storage[0].arn
}

resource "aws_eks_pod_identity_association" "recording_worker_storage" {
  count = var.create_recording_iam_roles ? 1 : 0

  cluster_name    = var.eks_cluster_name
  namespace       = "relay"
  service_account = "relay-recording-worker-storage"
  role_arn        = aws_iam_role.recording_worker_storage[0].arn
}

resource "aws_eks_addon" "pod_identity_agent" {
  count = var.create_eks_pod_identity_agent_addon ? 1 : 0

  cluster_name = var.eks_cluster_name
  addon_name   = "eks-pod-identity-agent"

  depends_on = [
    aws_eks_cluster.relay
  ]

  lifecycle {
    precondition {
      condition     = length(trimspace(var.eks_cluster_name)) > 0
      error_message = "Set eks_cluster_name before installing the EKS Pod Identity Agent add-on."
    }
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-eks-pod-identity-agent"
  })
}

resource "aws_iam_role" "ebs_csi" {
  count = var.create_eks_ebs_csi_addon ? 1 : 0

  name               = "${var.project_name}-${var.environment}-ebs-csi"
  assume_role_policy = local.ebs_csi_pod_identity_trust_policy
  tags               = local.common_tags

  lifecycle {
    precondition {
      condition = (
        can(regex("^[0-9]{12}$", var.aws_account_id)) &&
        length(trimspace(var.eks_cluster_name)) > 0
      )
      error_message = "Set a valid aws_account_id and eks_cluster_name before enabling the EBS CSI add-on."
    }
  }
}

resource "aws_iam_role_policy_attachment" "ebs_csi" {
  count = var.create_eks_ebs_csi_addon ? 1 : 0

  role       = aws_iam_role.ebs_csi[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

resource "aws_eks_addon" "ebs_csi" {
  count = var.create_eks_ebs_csi_addon ? 1 : 0

  cluster_name = var.eks_cluster_name
  addon_name   = "aws-ebs-csi-driver"

  pod_identity_association {
    service_account = "ebs-csi-controller-sa"
    role_arn        = aws_iam_role.ebs_csi[0].arn
  }

  depends_on = [
    aws_eks_addon.pod_identity_agent,
    aws_iam_role_policy_attachment.ebs_csi
  ]

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-ebs-csi"
  })
}

resource "aws_iam_policy" "aws_load_balancer_controller" {
  count = var.create_eks_load_balancer_controller_iam_role ? 1 : 0

  name        = "${var.project_name}-${var.environment}-aws-load-balancer-controller"
  description = "AWS Load Balancer Controller v2.14.1 permissions."
  policy      = file("${path.module}/policies/aws-load-balancer-controller-v2.14.1.json")
  tags        = local.common_tags
}

resource "aws_iam_role" "aws_load_balancer_controller" {
  count = var.create_eks_load_balancer_controller_iam_role ? 1 : 0

  name               = "${var.project_name}-${var.environment}-aws-load-balancer-controller"
  assume_role_policy = local.aws_load_balancer_controller_pod_identity_trust_policy
  tags               = local.common_tags

  lifecycle {
    precondition {
      condition = (
        can(regex("^[0-9]{12}$", var.aws_account_id)) &&
        length(trimspace(var.eks_cluster_name)) > 0
      )
      error_message = "Set a valid aws_account_id and eks_cluster_name before enabling the AWS Load Balancer Controller IAM role."
    }
  }
}

resource "aws_iam_role_policy_attachment" "aws_load_balancer_controller" {
  count = var.create_eks_load_balancer_controller_iam_role ? 1 : 0

  role       = aws_iam_role.aws_load_balancer_controller[0].name
  policy_arn = aws_iam_policy.aws_load_balancer_controller[0].arn
}

resource "aws_eks_pod_identity_association" "aws_load_balancer_controller" {
  count = var.create_eks_load_balancer_controller_iam_role ? 1 : 0

  cluster_name    = var.eks_cluster_name
  namespace       = "kube-system"
  service_account = "aws-load-balancer-controller"
  role_arn        = aws_iam_role.aws_load_balancer_controller[0].arn

  depends_on = [
    aws_eks_addon.pod_identity_agent,
    aws_iam_role_policy_attachment.aws_load_balancer_controller
  ]
}

# -----------------------------------------------------------------------------
# VPC network foundation
# -----------------------------------------------------------------------------

locals {
  relay_availability_zones = var.create_vpc ? {
    for index, zone in var.availability_zones : zone => index
  } : {}

  relay_subnet_cidrs = concat(
    var.public_subnet_cidrs,
    var.private_subnet_cidrs
  )

  relay_subnet_ipv4_ranges = [
    for subnet_cidr in local.relay_subnet_cidrs : {
      first = sum([
        for index, octet in split(".", cidrhost(subnet_cidr, 0)) :
        tonumber(octet) * pow(256, 3 - index)
      ])
      last = sum([
        for index, octet in split(".", cidrhost(subnet_cidr, -1)) :
        tonumber(octet) * pow(256, 3 - index)
      ])
    }
  ]

  relay_vpc_ipv4_range = {
    first = sum([
      for index, octet in split(".", cidrhost(var.vpc_cidr, 0)) :
      tonumber(octet) * pow(256, 3 - index)
    ])
    last = sum([
      for index, octet in split(".", cidrhost(var.vpc_cidr, -1)) :
      tonumber(octet) * pow(256, 3 - index)
    ])
  }

  relay_subnet_cidrs_within_vpc = alltrue([
    for subnet in local.relay_subnet_ipv4_ranges :
    subnet.first >= local.relay_vpc_ipv4_range.first &&
    subnet.last <= local.relay_vpc_ipv4_range.last
  ])

  relay_subnet_cidrs_non_overlapping = alltrue(flatten([
    for index, subnet in local.relay_subnet_ipv4_ranges : [
      for other_index, other in local.relay_subnet_ipv4_ranges :
      index >= other_index ? true : (
        subnet.last < other.first || other.last < subnet.first
      )
    ]
  ]))
}

resource "aws_vpc" "relay" {
  count = var.create_vpc ? 1 : 0

  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-vpc"
  })

  lifecycle {
    precondition {
      condition     = local.relay_subnet_cidrs_within_vpc
      error_message = "Every public and private subnet CIDR must be fully contained within the VPC CIDR."
    }

    precondition {
      condition     = local.relay_subnet_cidrs_non_overlapping
      error_message = "Public and private subnet CIDR blocks must not overlap."
    }
  }
}

resource "aws_internet_gateway" "relay" {
  count = var.create_vpc ? 1 : 0

  vpc_id = aws_vpc.relay[0].id

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-igw"
  })
}

resource "aws_subnet" "public" {
  for_each = local.relay_availability_zones

  vpc_id                  = aws_vpc.relay[0].id
  availability_zone       = each.key
  cidr_block              = var.public_subnet_cidrs[each.value]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name                     = "${var.project_name}-${var.environment}-public-${each.value + 1}"
    "kubernetes.io/role/elb" = "1"
  })
}

resource "aws_subnet" "private" {
  for_each = local.relay_availability_zones

  vpc_id            = aws_vpc.relay[0].id
  availability_zone = each.key
  cidr_block        = var.private_subnet_cidrs[each.value]

  tags = merge(
    local.common_tags,
    {
      Name                              = "${var.project_name}-${var.environment}-private-${each.value + 1}"
      "kubernetes.io/role/internal-elb" = "1"
    },
    var.eks_cluster_name != "" ? {
      "kubernetes.io/cluster/${var.eks_cluster_name}" = "shared"
    } : {}
  )
}

resource "aws_route_table" "public" {
  count = var.create_vpc ? 1 : 0

  vpc_id = aws_vpc.relay[0].id

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-public"
  })
}

resource "aws_route" "public_internet" {
  count = var.create_vpc ? 1 : 0

  route_table_id         = aws_route_table.public[0].id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.relay[0].id
}

resource "aws_route_table_association" "public" {
  for_each = local.relay_availability_zones

  subnet_id      = aws_subnet.public[each.key].id
  route_table_id = aws_route_table.public[0].id
}

resource "aws_route_table" "private" {
  for_each = local.relay_availability_zones

  vpc_id = aws_vpc.relay[0].id

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-private-${each.value + 1}"
  })
}

resource "aws_route_table_association" "private" {
  for_each = local.relay_availability_zones

  subnet_id      = aws_subnet.private[each.key].id
  route_table_id = aws_route_table.private[each.key].id
}


# -----------------------------------------------------------------------------
# Optional private AWS service endpoints for EKS workloads
# -----------------------------------------------------------------------------

locals {
  eks_private_interface_endpoint_services = toset([
    "eks-auth",
    "ec2",
    "elasticloadbalancing",
    "ecr.api",
    "ecr.dkr",
    "secretsmanager",
  ])
}

resource "aws_security_group" "vpc_endpoints" {
  count = var.create_vpc && var.create_eks_private_service_endpoints ? 1 : 0

  name        = "${var.project_name}-${var.environment}-vpc-endpoints"
  description = "HTTPS access to private AWS service endpoints from within the Relay VPC."
  vpc_id      = aws_vpc.relay[0].id

  ingress {
    description = "HTTPS from the Relay VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "Outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-vpc-endpoints"
  })
}

resource "aws_vpc_endpoint" "eks_private_interface" {
  for_each = (
    var.create_vpc && var.create_eks_private_service_endpoints
    ? local.eks_private_interface_endpoint_services
    : toset([])
  )

  vpc_id              = aws_vpc.relay[0].id
  service_name        = "com.amazonaws.${var.aws_region}.${each.value}"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = [for subnet in aws_subnet.private : subnet.id]
  security_group_ids  = [aws_security_group.vpc_endpoints[0].id]

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-${replace(each.value, ".", "-")}-endpoint"
  })
}

resource "aws_vpc_endpoint" "s3" {
  count = var.create_vpc && var.create_eks_private_service_endpoints ? 1 : 0

  vpc_id            = aws_vpc.relay[0].id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [for route_table in aws_route_table.private : route_table.id]

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-s3-endpoint"
  })
}

# -----------------------------------------------------------------------------
# Optional NAT gateway egress for private subnets
# -----------------------------------------------------------------------------

locals {
  effective_single_nat_gateway = (
    var.network_profile == "cost_conscious" ? true :
    contains(["balanced", "high_availability"], var.network_profile) ? false :
    var.single_nat_gateway
  )

  nat_gateway_availability_zones = (
    var.create_vpc && var.enable_nat_gateway
    ? (
      local.effective_single_nat_gateway
      ? { (var.availability_zones[0]) = 0 }
      : local.relay_availability_zones
    )
    : {}
  )
}

resource "aws_eip" "nat" {
  for_each = local.nat_gateway_availability_zones

  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-nat-${each.value + 1}"
  })
}

resource "aws_nat_gateway" "relay" {
  for_each = local.nat_gateway_availability_zones

  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = aws_subnet.public[each.key].id

  depends_on = [aws_internet_gateway.relay]

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-nat-${each.value + 1}"
  })
}

resource "aws_route" "private_nat" {
  for_each = var.enable_nat_gateway ? local.relay_availability_zones : {}

  route_table_id         = aws_route_table.private[each.key].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id = aws_nat_gateway.relay[
    local.effective_single_nat_gateway ? var.availability_zones[0] : each.key
  ].id
}

# -----------------------------------------------------------------------------
# Application Load Balancer security group
# -----------------------------------------------------------------------------

resource "aws_security_group" "alb" {
  count = var.create_vpc ? 1 : 0

  name        = "${var.project_name}-${var.environment}-alb"
  description = "Allow public HTTP and HTTPS traffic to the Relay application."
  vpc_id      = aws_vpc.relay[0].id

  ingress {
    description = "HTTP from the internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from the internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-alb"
  })
}


# -----------------------------------------------------------------------------
# EKS control plane
# -----------------------------------------------------------------------------

resource "aws_iam_role" "eks_cluster" {
  count = var.create_eks_cluster ? 1 : 0

  name = "${var.project_name}-${var.environment}-eks-cluster"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-eks-cluster"
  })
}

resource "aws_iam_role_policy_attachment" "eks_cluster" {
  count = var.create_eks_cluster ? 1 : 0

  role       = aws_iam_role.eks_cluster[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

resource "aws_eks_cluster" "relay" {
  count = var.create_eks_cluster ? 1 : 0

  name     = var.eks_cluster_name
  role_arn = aws_iam_role.eks_cluster[0].arn
  version  = var.eks_cluster_version

  enabled_cluster_log_types = var.eks_cluster_enabled_log_types

  vpc_config {
    subnet_ids = [
      for subnet in aws_subnet.private : subnet.id
    ]

    endpoint_private_access = true
    endpoint_public_access  = var.eks_cluster_endpoint_public_access

    public_access_cidrs = var.eks_cluster_endpoint_public_access_cidrs
  }

  access_config {
    authentication_mode                         = "API"
    bootstrap_cluster_creator_admin_permissions = false
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster
  ]

  lifecycle {
    precondition {
      condition     = var.create_vpc
      error_message = "create_vpc must be true before create_eks_cluster can be enabled."
    }

    precondition {
      condition     = length(var.eks_cluster_name) > 0
      error_message = "Set eks_cluster_name before enabling the EKS cluster."
    }

    precondition {
      condition     = var.eks_cluster_admin_role_arn != ""
      error_message = "Set eks_cluster_admin_role_arn to an existing IAM role before enabling the EKS cluster."
    }

    precondition {
      condition     = length(aws_subnet.private) >= 2
      error_message = "The EKS cluster requires private subnets in at least two Availability Zones."
    }
  }

  tags = merge(local.common_tags, {
    Name = var.eks_cluster_name
  })
}


# -----------------------------------------------------------------------------
# Explicit EKS administrator access
# -----------------------------------------------------------------------------

resource "aws_eks_access_entry" "cluster_admin" {
  count = var.create_eks_cluster && var.eks_cluster_admin_role_arn != "" ? 1 : 0

  cluster_name      = aws_eks_cluster.relay[0].name
  principal_arn     = var.eks_cluster_admin_role_arn
  type              = "STANDARD"
  kubernetes_groups = []
}

resource "aws_eks_access_policy_association" "cluster_admin" {
  count = var.create_eks_cluster && var.eks_cluster_admin_role_arn != "" ? 1 : 0

  cluster_name  = aws_eks_cluster.relay[0].name
  principal_arn = aws_eks_access_entry.cluster_admin[0].principal_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }
}
# -----------------------------------------------------------------------------\n

# -----------------------------------------------------------------------------
# EKS managed worker nodes
# -----------------------------------------------------------------------------

resource "aws_iam_role" "eks_node" {
  count = var.create_eks_node_group ? 1 : 0

  name = "${var.project_name}-${var.environment}-eks-node"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-eks-node"
  })
}

resource "aws_iam_role_policy_attachment" "eks_worker_node" {
  count = var.create_eks_node_group ? 1 : 0

  role       = aws_iam_role.eks_node[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}

resource "aws_iam_role_policy_attachment" "eks_cni" {
  count = var.create_eks_node_group ? 1 : 0

  role       = aws_iam_role.eks_node[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
}

resource "aws_iam_role_policy_attachment" "eks_ecr_pull" {
  count = var.create_eks_node_group ? 1 : 0

  role       = aws_iam_role.eks_node[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly"
}

resource "aws_eks_node_group" "relay" {
  count = var.create_eks_node_group && var.create_eks_cluster ? 1 : 0

  cluster_name    = aws_eks_cluster.relay[0].name
  node_group_name = "${var.project_name}-${var.environment}-workers"
  node_role_arn   = aws_iam_role.eks_node[0].arn
  subnet_ids      = [for subnet in aws_subnet.private : subnet.id]

  instance_types = var.eks_node_group_instance_types
  capacity_type  = "ON_DEMAND"
  disk_size      = var.eks_node_group_disk_size

  scaling_config {
    min_size     = var.eks_node_group_min_size
    desired_size = var.eks_node_group_desired_size
    max_size     = var.eks_node_group_max_size
  }

  update_config {
    max_unavailable = 1
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_worker_node,
    aws_iam_role_policy_attachment.eks_cni,
    aws_iam_role_policy_attachment.eks_ecr_pull
  ]

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-workers"
  })
}
