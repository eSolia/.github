# CI Security Policy — v1
#
# Deterministic evaluation of security scan results.
# Same inputs + this policy version = same decision, every time.
#
# This file lives at: .github/policies/ci-security-v1.rego
# Version it alongside your workflows. When you change policy logic,
# create ci-security-v2.rego and update the workflow input.
#
# To test locally:
#   opa eval --data ci-security-v1.rego \
#            --input test-input.json \
#            'data.esolia.ci.security'

package esolia.ci.security

import rego.v1

# ── Decision ──

default allow := false

allow if {
    no_critical_findings
    no_leaked_secrets
}

# ── Rules ──

# Block on any critical SARIF findings
no_critical_findings if {
    input.sarif_critical == 0
}

# Also block if critical count is missing (scan didn't run = not safe to pass)
no_critical_findings if {
    not input.sarif_critical
    input.scan_status == "skipped_not_applicable"
}

# Block if secrets were detected — or if secret scanning didn't run.
# InfoSec: Default to fail (same as no_critical_findings) so missing scan
# data is never silently treated as safe.
default no_leaked_secrets := false

no_leaked_secrets if {
    input.secrets_found == 0
}

# Allow pass if secret scanning was explicitly marked as not applicable
no_leaked_secrets if {
    not input.secrets_found
    input.scan_status == "skipped_not_applicable"
}

# Deny if secrets were detected
no_leaked_secrets := false if {
    input.secrets_found > 0
}

# ── Metadata (included in decision output for audit) ──

policy_version := "v1"

decision_reasons contains reason if {
    input.sarif_critical > 0
    reason := sprintf("blocked: %d critical SARIF findings", [input.sarif_critical])
}

decision_reasons contains reason if {
    input.secrets_found > 0
    reason := sprintf("blocked: %d secrets detected", [input.secrets_found])
}

decision_reasons contains reason if {
    allow
    reason := "all checks passed"
}

# ── Summary (the structured output consumed by the workflow) ──

summary := {
    "allow": allow,
    "policy_version": policy_version,
    "reasons": decision_reasons,
    "evaluated_at": input._meta.evaluated_at,
    "commit_sha": input._meta.commit_sha,
}
