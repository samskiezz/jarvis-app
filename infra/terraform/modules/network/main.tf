# Module: network
# Provisions the VPC / virtual network, subnets, routing, NAT and security
# baseline for a single plane of the enterprise OS. Each environment composes
# this module to obtain an isolated network boundary.
# NOTE: requires a real cloud provider (AWS/GCP/Azure); placeholders below.

terraform {
  required_version = ">= 1.5.0"
}

variable "name" {
  description = "Network name prefix"
  type        = string
}

variable "cidr_block" {
  description = "Top-level CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_subnets" {
  description = "List of private subnet CIDRs"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "public_subnets" {
  description = "List of public subnet CIDRs"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24"]
}

variable "enable_nat_gateway" {
  description = "Whether to provision a NAT gateway for egress"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags applied to all network resources"
  type        = map(string)
  default     = {}
}

# NOTE: replace null_resource placeholders with real provider resources
# (e.g. aws_vpc, aws_subnet, aws_nat_gateway) when targeting a live cluster.
resource "null_resource" "vpc" {
  triggers = {
    name = var.name
    cidr = var.cidr_block
  }
}

resource "null_resource" "private_subnet" {
  count = length(var.private_subnets)
  triggers = {
    cidr = var.private_subnets[count.index]
  }
}

resource "null_resource" "public_subnet" {
  count = length(var.public_subnets)
  triggers = {
    cidr = var.public_subnets[count.index]
  }
}

output "vpc_id" {
  description = "Identifier of the provisioned VPC"
  value       = null_resource.vpc.id
}

output "private_subnet_ids" {
  description = "Identifiers of the private subnets"
  value       = [for s in null_resource.private_subnet : s.id]
}

output "public_subnet_ids" {
  description = "Identifiers of the public subnets"
  value       = [for s in null_resource.public_subnet : s.id]
}
