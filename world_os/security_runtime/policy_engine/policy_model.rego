
package worldos.authz

default allow := false

allow {
  input.actor.authenticated == true
  input.purpose != ""
  not input.action in {"deploy_connector", "disable_source", "quarantine_data", "apollo_rollback", "export_evidence"}
}

allow {
  input.actor.authenticated == true
  input.approval_id != ""
  input.action in {"deploy_connector", "disable_source", "quarantine_data", "apollo_rollback", "export_evidence"}
}

deny_reason[msg] {
  not input.actor.authenticated
  msg := "actor not authenticated"
}

deny_reason[msg] {
  input.action in {"deploy_connector", "disable_source", "quarantine_data", "apollo_rollback", "export_evidence"}
  input.approval_id == ""
  msg := "approval required"
}
