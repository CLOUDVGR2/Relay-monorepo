output "eks_node_group_name" {
  description = "Name of the optional EKS managed worker node group."
  value       = try(aws_eks_node_group.relay[0].node_group_name, null)
}

output "eks_node_role_arn" {
  description = "IAM role ARN used by the optional EKS managed worker nodes."
  value       = try(aws_iam_role.eks_node[0].arn, null)
}

output "ecr_repository_urls" {
  description = "URLs of ECR repositories created by this configuration."
  value = {
    for name, repository in aws_ecr_repository.application :
    name => repository.repository_url
  }
}

output "recording_bucket_name" {
  description = "Name of the recording bucket, when created."
  value       = try(aws_s3_bucket.recordings[0].bucket, null)
}

output "nest_api_recording_storage_role_arn" {
  description = "Nest API recording-storage Pod Identity role ARN."
  value       = try(aws_iam_role.nest_api_recording_storage[0].arn, null)
}

output "recording_worker_storage_role_arn" {
  description = "Recording worker read-only Pod Identity role ARN."
  value       = try(aws_iam_role.recording_worker_storage[0].arn, null)
}

output "external_secrets_role_arn" {
  description = "External Secrets Operator read-only Secrets Manager Pod Identity role ARN."
  value       = try(aws_iam_role.external_secrets[0].arn, null)
}

output "aws_load_balancer_controller_role_arn" {
  description = "AWS Load Balancer Controller Pod Identity role ARN."
  value       = try(aws_iam_role.aws_load_balancer_controller[0].arn, null)
}

output "alb_security_group_id" {
  description = "ID of the optional Application Load Balancer security group."
  value       = try(aws_security_group.alb[0].id, null)
}

output "vpc_id" {
  description = "ID of the optional Relay VPC."
  value       = try(aws_vpc.relay[0].id, null)
}

output "public_subnet_ids" {
  description = "IDs of the public subnets, keyed by Availability Zone."
  value = {
    for az, subnet in aws_subnet.public :
    az => subnet.id
  }
}

output "eks_private_interface_endpoint_ids" {
  description = "IDs of optional private EKS interface VPC endpoints, keyed by AWS service."
  value = {
    for service, endpoint in aws_vpc_endpoint.eks_private_interface :
    service => endpoint.id
  }
}

output "eks_private_s3_endpoint_id" {
  description = "ID of the optional private S3 gateway VPC endpoint."
  value       = try(aws_vpc_endpoint.s3[0].id, null)
}

output "private_subnet_ids" {
  description = "IDs of the private subnets, keyed by Availability Zone."
  value = {
    for az, subnet in aws_subnet.private :
    az => subnet.id
  }
}
