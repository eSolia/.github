# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in any eSolia project, please report it responsibly.

**Email:** security@esolia.co.jp
**Response time:** We aim to acknowledge reports within 48 hours.

Please do not open public issues for security vulnerabilities.

## Security Scanning Infrastructure

All eSolia repositories use a centralized, reusable security scanning workflow ([`security.yml`](.github/workflows/security.yml)) that runs on every push and PR to `main`, plus a weekly scheduled scan.

### Scanners

| Scanner | What It Checks |
|---------|---------------|
| **Dependency Audit** | Known vulnerabilities in npm/pnpm/yarn/bun dependencies |
| **Trivy** | Dependency vulnerabilities, hardcoded secrets, license compliance |
| **Gitleaks** | Secrets in full git history (committed credentials, API keys) |
| **Semgrep SAST** | OWASP Top 10 patterns, TypeScript/JavaScript security anti-patterns |
| **TypeScript** | Type safety verification (`tsc --noEmit`) |
| **ESLint** | Code quality and security linting (including Svelte-specific rules) |
| **ASVS** | OWASP Application Security Verification Standard (optional) |

### Adoption

Any repository in the eSolia org can adopt the full pipeline:

```yaml
jobs:
  security:
    uses: eSolia/.github/.github/workflows/security.yml@main
    with:
      package-manager: auto
      source-paths: 'src/'
    secrets: inherit
```

## CI/CD Hardening

Our GitHub Actions workflows follow a hardened security posture:

- **SHA pinning** — all third-party actions are pinned to full 40-character commit hashes, not mutable tags
- **Node 24 runtimes** — all actions run on the latest Node.js runtime (upgraded March 2026)
- **Least-privilege permissions** — workflow-level `contents: read` default; job-level write access only where required
- **Credential isolation** — `persist-credentials: false` on all `actions/checkout` steps unless push access is explicitly needed
- **Injection prevention** — no GitHub context expressions (`${{ }}`) inside `run:` blocks; all values pass through `env:`
- **CODEOWNERS enforcement** — changes to `.github/`, `package.json`, and lockfiles require security team review
- **Multi-layer secret detection** — Gitleaks, Trivy, and Semgrep all scan for secrets independently

### Wrangler Configuration QC

Cloudflare Worker configurations are validated on every PR via [`qc-wrangler.yml`](.github/workflows/qc-wrangler.yml):

- JSONC format enforcement (no TOML)
- `account_id` presence (prevents API discovery failures)
- `compatibility_date` freshness (configurable staleness threshold)
- Observability configuration (logs and traces enabled)

## Governance

- **CODEOWNERS** ([`.github/CODEOWNERS`](.github/CODEOWNERS)) requires the `@eSolia/security-reviewers` team to approve changes to workflows, dependency manifests, and lockfiles.
- **Branch rulesets** on `main` require pull request review, conversation resolution, and block force pushes.
- **Dependabot** alerts and automated security updates are enabled across all repositories.
