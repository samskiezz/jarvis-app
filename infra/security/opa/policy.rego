# OPA / Gatekeeper authorization policy for the Jarvis platform.
# Deny-by-default: every request is denied unless an explicit allow rule
# matches. Decisions are exposed via the `deny` set; an empty set means allow.
package jarvis.authz

import rego.v1

default allow := false

# Allow only when there are no deny reasons.
allow if {
	count(deny) == 0
}

# Deny: requests must carry an authenticated subject.
deny contains msg if {
	not input.subject.authenticated
	msg := "subject is not authenticated"
}

# Deny: privileged containers are never permitted.
deny contains msg if {
	some container in input.request.spec.containers
	container.securityContext.privileged == true
	msg := sprintf("privileged container not allowed: %v", [container.name])
}

# Deny: images must come from the trusted registry.
deny contains msg if {
	some container in input.request.spec.containers
	not startswith(container.image, "registry.internal/")
	msg := sprintf("untrusted image registry: %v", [container.image])
}

# Deny: restricted plane access requires the matching clearance.
deny contains msg if {
	input.resource.plane == "restricted"
	input.subject.clearance != "restricted"
	msg := "insufficient clearance for restricted plane"
}
