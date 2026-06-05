# Vault policy (HCL) for platform services. Grants least-privilege access to
# the platform secret paths and transit signing keys.
# NOTE: requires a real Vault cluster; mount paths are samples.

# Read platform database and service credentials.
path "secret/data/jarvis/platform/*" {
  capabilities = ["read", "list"]
}

# Manage dynamic database credentials.
path "database/creds/jarvis-platform" {
  capabilities = ["read"]
}

# Use the transit engine for signing artifacts (image signing keys).
path "transit/sign/jarvis-signing" {
  capabilities = ["update"]
}

path "transit/verify/jarvis-signing" {
  capabilities = ["update"]
}

# Deny access to all other secret engines explicitly.
path "sys/*" {
  capabilities = ["deny"]
}
