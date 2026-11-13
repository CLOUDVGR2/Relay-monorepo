variable "aws_region" {
  description = "AWS region for future Relay infrastructure."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project prefix for AWS resource names."
  type        = string
  default     = "relay"
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "dev"
}

variable "create_ecr_repositories" {
  description = "Whether Terraform should create the eight application and four supporting-service ECR repositories."
  type        = bool
  default     = false
}

variable "create_recording_bucket" {
  description = "Whether Terraform should create the call-recordings S3 bucket."
  type        = bool
  default     = false
}

variable "create_recording_iam_roles" {
  description = "Whether Terraform should create the EKS Pod Identity recording-storage roles and policies."
  type        = bool
  default     = false
}

variable "create_external_secrets_iam_role" {
  description = "Whether Terraform should create the dedicated External Secrets Operator EKS Pod Identity role and read-only policy."
  type        = bool
  default     = false
}

variable "external_secrets_secret_names" {
  description = "Seven logical Secrets Manager secret names, stored under the project/environment path."
  type        = list(string)
  default = [
    "backend-secret",
    "go-api-secret",
    "rabbitmq-secret",
    "nest-api-secret",
    "python-ai-secret",
    "mongodb-secret",
    "postgres-secret",
  ]

  validation {
    condition = (
      length(var.external_secrets_secret_names) == 7 &&
      length(distinct(var.external_secrets_secret_names)) == 7 &&
      alltrue([
        for name in var.external_secrets_secret_names :
        can(regex("^[A-Za-z0-9][A-Za-z0-9_-]*$", name))
      ])
    )
    error_message = "Provide exactly seven unique, valid Secrets Manager secret names."
  }
}

variable "recording_bucket_name" {
  description = "Globally unique S3 bucket name for call recordings."
  type        = string
  default     = "relay-call-recordings"
}

variable "aws_account_id" {
  description = "AWS account ID used to restrict EKS Pod Identity trust."
  type        = string
  default     = ""

  validation {
    condition = (
      var.aws_account_id == "" ||
      can(regex("^[0-9]{12}$", var.aws_account_id))
    )
    error_message = "aws_account_id must be empty or a 12-digit AWS account ID."
  }
}

variable "eks_cluster_name" {
  description = "EKS cluster name allowed to assume the recording-storage roles."
  type        = string
  default     = ""
}

variable "additional_tags" {
  description = "Additional tags applied to created AWS resources."
  type        = map(string)
  default     = {}
}

variable "create_vpc" {
  description = "Whether Terraform should create the Relay VPC and subnet foundation."
  type        = bool
  default     = false
}

variable "network_profile" {
  description = "Network topology: cost_conscious, balanced, high_availability, or custom."
  type        = string
  default     = "custom"

  validation {
    condition = contains(
      ["cost_conscious", "balanced", "high_availability", "custom"],
      var.network_profile
    )
    error_message = "network_profile must be cost_conscious, balanced, high_availability, or custom."
  }

  validation {
    condition = (
      var.network_profile == "custom" ||
      (var.network_profile == "high_availability" && length(var.availability_zones) == 3) ||
      (contains(["cost_conscious", "balanced"], var.network_profile) && length(var.availability_zones) == 2)
    )
    error_message = "cost_conscious and balanced profiles require two Availability Zones; high_availability requires three."
  }
}

variable "vpc_cidr" {
  description = "IPv4 CIDR block for the Relay VPC."
  type        = string
  default     = "10.20.0.0/16"

  validation {
    condition = (
      can(cidrnetmask(var.vpc_cidr)) &&
      try(
        tonumber(split("/", var.vpc_cidr)[1]) >= 16 &&
        tonumber(split("/", var.vpc_cidr)[1]) <= 28,
        false
      )
    )
    error_message = "vpc_cidr must be a valid IPv4 CIDR block with a prefix between /16 and /28."
  }
}

variable "availability_zones" {
  description = "Two or three Availability Zones used for the selected Relay network profile."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]

  validation {
    condition     = contains([2, 3], length(var.availability_zones)) && length(distinct(var.availability_zones)) == length(var.availability_zones)
    error_message = "Specify either two or three distinct Availability Zones."
  }

  validation {
    condition = alltrue([
      for zone in var.availability_zones :
      startswith(zone, var.aws_region)
    ])
    error_message = "Every Availability Zone name must belong to the configured aws_region."
  }
}

variable "public_subnet_cidrs" {
  description = "One public subnet CIDR block for each configured Availability Zone."
  type        = list(string)
  default     = ["10.20.0.0/20", "10.20.16.0/20"]

  validation {
    condition = (
      length(var.public_subnet_cidrs) == length(var.availability_zones) &&
      alltrue([
        for cidr in var.public_subnet_cidrs :
        can(cidrnetmask(cidr)) && try(
          tonumber(split("/", cidr)[1]) >= 16 &&
          tonumber(split("/", cidr)[1]) <= 28,
          false
        )
      ]) &&
      length(distinct(concat(var.public_subnet_cidrs, var.private_subnet_cidrs))) == (
        length(var.public_subnet_cidrs) + length(var.private_subnet_cidrs)
      )
    )
    error_message = "Specify one valid IPv4 public subnet CIDR block with a /16 through /28 prefix per Availability Zone; all public and private subnet CIDRs must be unique."
  }
}

variable "private_subnet_cidrs" {
  description = "One private subnet CIDR block for each configured Availability Zone."
  type        = list(string)
  default     = ["10.20.32.0/20", "10.20.48.0/20"]

  validation {
    condition = (
      length(var.private_subnet_cidrs) == length(var.availability_zones) &&
      alltrue([
        for cidr in var.private_subnet_cidrs :
        can(cidrnetmask(cidr)) && try(
          tonumber(split("/", cidr)[1]) >= 16 &&
          tonumber(split("/", cidr)[1]) <= 28,
          false
        )
      ])
    )
    error_message = "Specify one valid IPv4 private subnet CIDR block with a /16 through /28 prefix for each Availability Zone."
  }
}

variable "create_eks_private_service_endpoints" {
  description = "Whether to create private EKS Auth, EC2, ELB, ECR, Secrets Manager, and S3 VPC endpoints. Interface endpoints incur hourly and data-processing charges."
  type        = bool
  default     = false

  validation {
    condition = (
      !var.create_eks_private_service_endpoints ||
      var.create_vpc
    )
    error_message = "Enable create_vpc before enabling private EKS service endpoints."
  }
}

variable "enable_nat_gateway" {
  description = "Whether to create NAT gateway infrastructure for private subnet internet egress. This incurs AWS charges."
  type        = bool
  default     = false
}

variable "single_nat_gateway" {
  description = "Use one shared NAT gateway instead of one per Availability Zone when NAT is enabled."
  type        = bool
  default     = true
}


variable "create_eks_cluster" {
  description = "Whether Terraform should create the optional Relay EKS control plane. This incurs AWS charges."
  type        = bool
  default     = false
}

variable "create_eks_pod_identity_agent_addon" {
  description = "Whether Terraform should install the EKS Pod Identity Agent add-on on the configured existing or managed cluster."
  type        = bool
  default     = false

  validation {
    condition = (
      !var.create_eks_pod_identity_agent_addon ||
      length(trimspace(var.eks_cluster_name)) > 0
    )
    error_message = "Set eks_cluster_name before enabling the EKS Pod Identity Agent add-on."
  }
}

variable "create_eks_ebs_csi_addon" {
  description = "Whether to install the EKS EBS CSI driver add-on with its dedicated Pod Identity role."
  type        = bool
  default     = false

  validation {
    condition = (
      !var.create_eks_ebs_csi_addon ||
      var.create_eks_pod_identity_agent_addon
    )
    error_message = "Enable create_eks_pod_identity_agent_addon before enabling the EBS CSI add-on."
  }

  validation {
    condition = (
      !var.create_eks_ebs_csi_addon ||
      (
        can(regex("^[0-9]{12}$", var.aws_account_id)) &&
        length(trimspace(var.eks_cluster_name)) > 0
      )
    )
    error_message = "Set a valid 12-digit aws_account_id and eks_cluster_name before enabling the EBS CSI add-on."
  }
}

variable "create_eks_load_balancer_controller_iam_role" {
  description = "Whether to create the AWS Load Balancer Controller IAM policy, Pod Identity role, and association."
  type        = bool
  default     = false

  validation {
    condition = (
      !var.create_eks_load_balancer_controller_iam_role ||
      var.create_eks_pod_identity_agent_addon
    )
    error_message = "Enable create_eks_pod_identity_agent_addon before enabling the AWS Load Balancer Controller Pod Identity role."
  }

  validation {
    condition = (
      !var.create_eks_load_balancer_controller_iam_role ||
      (
        can(regex("^[0-9]{12}$", var.aws_account_id)) &&
        length(trimspace(var.eks_cluster_name)) > 0
      )
    )
    error_message = "Set a valid 12-digit aws_account_id and eks_cluster_name before enabling the AWS Load Balancer Controller IAM role."
  }
}

variable "create_eks_node_group" {
  description = "Whether Terraform should create the optional private EKS managed worker node group."
  type        = bool
  default     = false

  validation {
    condition     = !var.create_eks_node_group || var.create_eks_cluster
    error_message = "create_eks_cluster must be true before enabling create_eks_node_group."
  }
}

variable "eks_node_group_instance_types" {
  description = "EC2 instance types available to the EKS managed node group."
  type        = list(string)
  default     = ["t3.large"]

  validation {
    condition     = length(var.eks_node_group_instance_types) > 0 && length(distinct(var.eks_node_group_instance_types)) == length(var.eks_node_group_instance_types)
    error_message = "Specify at least one unique EKS worker instance type."
  }
}

variable "eks_node_group_min_size" {
  description = "Minimum number of EKS managed worker nodes."
  type        = number
  default     = 2

  validation {
    condition     = var.eks_node_group_min_size >= 1
    error_message = "eks_node_group_min_size must be at least 1."
  }
}

variable "eks_node_group_desired_size" {
  description = "Desired number of EKS managed worker nodes."
  type        = number
  default     = 2

  validation {
    condition = (
      var.eks_node_group_desired_size >= var.eks_node_group_min_size &&
      var.eks_node_group_desired_size <= var.eks_node_group_max_size
    )
    error_message = "eks_node_group_desired_size must be between the configured minimum and maximum."
  }
}

variable "eks_node_group_max_size" {
  description = "Maximum number of EKS managed worker nodes."
  type        = number
  default     = 4

  validation {
    condition     = var.eks_node_group_max_size >= var.eks_node_group_min_size
    error_message = "eks_node_group_max_size must be at least eks_node_group_min_size."
  }
}

variable "eks_node_group_disk_size" {
  description = "Root EBS volume size in GiB for each EKS managed worker."
  type        = number
  default     = 50

  validation {
    condition     = var.eks_node_group_disk_size >= 20 && var.eks_node_group_disk_size <= 200
    error_message = "eks_node_group_disk_size must be between 20 and 200 GiB."
  }
}

variable "eks_cluster_version" {
  description = "Kubernetes minor version for the optional EKS cluster."
  type        = string
  default     = "1.37"

  validation {
    condition     = can(regex("^1\\.[0-9]{2}$", var.eks_cluster_version))
    error_message = "eks_cluster_version must use Kubernetes minor-version format, such as 1.37."
  }
}

variable "eks_cluster_endpoint_public_access" {
  description = "Whether the EKS Kubernetes API endpoint is publicly accessible. Private access remains enabled."
  type        = bool
  default     = false
}

variable "eks_cluster_endpoint_public_access_cidrs" {
  description = "Restrictive IPv4 CIDRs permitted to access the public EKS API endpoint when public access is enabled."
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for cidr in var.eks_cluster_endpoint_public_access_cidrs :
      can(cidrnetmask(cidr)) && cidr != "0.0.0.0/0"
    ])
    error_message = "Public EKS endpoint CIDRs must be valid IPv4 networks and must not allow 0.0.0.0/0."
  }

  validation {
    condition = (
      !var.eks_cluster_endpoint_public_access ||
      length(var.eks_cluster_endpoint_public_access_cidrs) > 0
    )
    error_message = "Specify at least one restrictive CIDR when public EKS endpoint access is enabled."
  }
}

variable "eks_cluster_enabled_log_types" {
  description = "EKS control-plane log types to publish to CloudWatch when the cluster is enabled."
  type        = list(string)
  default     = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  validation {
    condition = (
      length(distinct(var.eks_cluster_enabled_log_types)) == length(var.eks_cluster_enabled_log_types) &&
      alltrue([
        for log_type in var.eks_cluster_enabled_log_types :
        contains(["api", "audit", "authenticator", "controllerManager", "scheduler"], log_type)
      ])
    )
    error_message = "EKS control-plane log types must be unique supported values."
  }
}

variable "eks_cluster_admin_role_arn" {
  description = "Existing IAM role ARN granted explicit EKS cluster administrator access."
  type        = string
  default     = ""

  validation {
    condition = (
      var.eks_cluster_admin_role_arn == "" ||
      can(regex("^arn:[^:]+:iam::[0-9]{12}:role/.+$", var.eks_cluster_admin_role_arn))
    )
    error_message = "eks_cluster_admin_role_arn must be an IAM role ARN with a 12-digit account ID."
  }
}
