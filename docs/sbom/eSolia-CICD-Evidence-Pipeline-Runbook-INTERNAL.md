# CI/CD Evidence Pipeline — Setup Runbook

> eSolia INTERNAL — Not for distribution outside eSolia

Deterministic security decisions with a verifiable evidence trail for eSolia app repos.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  GitHub Actions (per-repo)                                          │
│                                                                      │
│  lint-and-scan ──► attest-and-ship.yml (shared reusable workflow)   │
│                      │                                               │
│                      ├─ actions/attest-build-provenance              │
│                      │   └─► Rekor transparency log (public notary)  │
│                      │                                               │
│                      ├─ OPA policy evaluation (deterministic)        │
│                      │   └─► pass/fail + structured reasons          │
│                      │                                               │
│                      └─ Ship evidence bundle (OIDC auth, no secrets) │
│                          └─► esolia-cicd-evidence Worker             │
└──────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Cloudflare                                                          │
│                                                                      │
│  esolia-cicd-evidence Worker (Hono)                                  │
│    ├─ Validates GitHub OIDC JWT (zero static secrets)                │
│    ├─ Stores bundle ──► R2: esolia-cicd-evidence                     │
│    │                     {repo-slug}/{run-id}/evidence-bundle.tar.gz │
│    └─ Indexes metadata ──► D1: esolia-cicd-evidence                  │
│                              evidence_runs table                     │
└──────────────────────────────────────────────────────────────────────┘
```

## What gets stored

Each CI run that uses the shared workflow produces:

| Artifact | Location | Purpose |
|---|---|---|
| SLSA provenance attestation | Rekor (public) | Tamper-evident proof that this commit produced this artifact on this builder |
| Evidence bundle (tarball) | R2 | Scan results, policy input, policy decision, manifest with SHA-256 hashes |
| Metadata index row | D1 | Queryable: repo, commit, run, decision, timestamp |

The Rekor entry is your external tamper-evident witness. R2 is your filing cabinet. D1 is your index card catalog.

## Deployment steps

### 1. Create Cloudflare resources

```bash
# R2 bucket
wrangler r2 bucket create esolia-cicd-evidence

# D1 database
wrangler d1 create esolia-cicd-evidence
# Note the database_id from the output
```

Update `wrangler.jsonc` with your `account_id` and `database_id`.

### 2. Run the D1 migration

```bash
# Local first
npm run db:migrate:local

# Then remote
npm run db:migrate:remote
```

### 3. Deploy the Worker

```bash
npm install
npm run deploy
```

Note the Worker URL (e.g., `https://esolia-cicd-evidence.<your-subdomain>.workers.dev`).

### 4. Protect the Worker

The POST endpoint is protected by GitHub OIDC validation (only tokens from the `esolia` GitHub org are accepted). For the GET endpoints (internal review), add a Cloudflare Access policy:

1. Go to **Cloudflare Zero Trust → Access → Applications**
2. Create an application for the Worker URL
3. Restrict to eSolia team members

### 5. Set the GitHub org secret

```bash
gh secret set EVIDENCE_SINK_URL \
  --org esolia \
  --value "https://esolia-cicd-evidence.<your-subdomain>.workers.dev"
```

### 6. Add the policy file to your shared .github repo

```
esolia/.github/
  .github/
    workflows/
      attest-and-ship.yml      ← the shared workflow
    policies/
      ci-security-v1.rego      ← the OPA policy
```

### 7. Wire up a calling repo

In any app repo's existing CI workflow, add the attestation job after the
shared `security.yml` scanning workflow:

```yaml
jobs:
  security:
    uses: esolia/.github/.github/workflows/security.yml@main
    with:
      package-manager: npm
      source-paths: src/
    secrets:
      SEMGREP_APP_TOKEN: ${{ secrets.SEMGREP_APP_TOKEN }}

  attest:
    needs: security
    uses: esolia/.github/.github/workflows/attest-and-ship.yml@main
    with:
      scan-artifact-name: scan-results
    secrets:
      EVIDENCE_SINK_URL: ${{ secrets.EVIDENCE_SINK_URL }}
```

For website repos that don't need the full attestation chain:

```yaml
  attest:
    needs: security
    uses: esolia/.github/.github/workflows/attest-and-ship.yml@main
    with:
      skip-attestation: true
    secrets:
      EVIDENCE_SINK_URL: ${{ secrets.EVIDENCE_SINK_URL }}
```

**Important:** The `security.yml` workflow currently uploads individual
artifacts (`trivy-reports`, `gitleaks-report`, `semgrep-report`, etc.),
not a single `scan-results` artifact. A `collect-scan-results` job must
be added to `security.yml` to aggregate outputs into the expected format.
See "Scan results artifact format" below.

## Scan results artifact format

The `attest-and-ship` workflow expects a single artifact named `scan-results`
containing one or more of:

- `*.sarif` / `*.sarif.json` — SARIF output from any scanner (Semgrep, Gitleaks, etc.)
- `summary.json` — scan summary with fields the OPA policy evaluates:

```json
{
  "sarif_critical": 0,
  "sarif_high": 2,
  "secrets_found": 0,
  "scan_status": "completed",
  "scanners": ["trivy", "semgrep", "gitleaks"]
}
```

The `security.yml` workflow needs a new `collect-scan-results` job that:
1. Downloads `trivy-reports`, `gitleaks-report`, `semgrep-report` artifacts
2. Extracts critical/high counts from Trivy JSON and SARIF files
3. Counts Gitleaks findings into `secrets_found`
4. Produces `summary.json` and re-uploads everything as `scan-results`

If SARIF files exist, the workflow also parses them automatically as a
fallback. The `summary.json` is the primary input for the OPA policy.

**Note on scanner overlap:** `security.yml` already runs Trivy for
vulnerability scanning. Do NOT add Grype — it duplicates Trivy against the
same CVE databases. Syft (SBOM generation) is complementary and should be
added to `security.yml` as a new step.

## Evolving the policy

When you need to change what blocks a build:

1. Create `.github/policies/ci-security-v2.rego` (don't modify v1)
2. Update the calling workflow: `policy-version: 'v2'`
3. Both versions remain available — old evidence bundles reference the policy version they were evaluated against, so any decision can be replayed

## Querying evidence

```bash
# List recent runs for a repo
curl "https://esolia-cicd-evidence.YOUR.workers.dev/api/v1/evidence?repository=esolia/periodic"

# Get a specific run
curl "https://esolia-cicd-evidence.YOUR.workers.dev/api/v1/evidence/m1abc-12345678"
```

For ISO 27001 audits, the combination of D1 queries + R2 bundle retrieval + Rekor verification gives you the full chain from "what decision was made" to "prove it wasn't tampered with."

## Contact

**eSolia Inc.**
Shiodome City Center 5F (Work Styling)
1-5-2 Higashi-Shimbashi, Minato-ku, Tokyo, Japan 105-7105
**Tel (Main):** +813-4577-3380
**Web:** https://esolia.co.jp/en
**Preparer:** rick.cogley@esolia.co.jp
