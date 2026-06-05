# Module: gpu-nodes
# Provisions a GPU-backed Kubernetes node pool for the AIP plane (model
# inference and training workloads). Tainted so only GPU workloads schedule.
# NOTE: requires real infra with GPU instance availability and drivers.

terraform {
  required_version = ">= 1.5.0"
}

variable "cluster_name" {
  description = "Cluster the GPU pool attaches to"
  type        = string
}

variable "node_count" {
  description = "Number of GPU nodes"
  type        = number
  default     = 2
}

variable "gpu_instance_type" {
  description = "GPU instance type"
  type        = string
  default     = "g5.2xlarge"
}

variable "gpu_per_node" {
  description = "GPUs per node"
  type        = number
  default     = 1
}

variable "taints" {
  description = "Taints applied to GPU nodes"
  type        = list(string)
  default     = ["nvidia.com/gpu=true:NoSchedule"]
}

variable "tags" {
  description = "Tags applied to GPU resources"
  type        = map(string)
  default     = {}
}

# NOTE: replace with aws_eks_node_group / google_container_node_pool with GPUs.
resource "null_resource" "gpu_node_pool" {
  triggers = {
    cluster = var.cluster_name
    type    = var.gpu_instance_type
    count   = var.node_count
  }
}

output "node_pool_id" {
  description = "GPU node pool identifier"
  value       = null_resource.gpu_node_pool.id
}

output "total_gpus" {
  description = "Total GPUs provisioned"
  value       = var.node_count * var.gpu_per_node
}
