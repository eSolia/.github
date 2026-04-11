# Change Management Rule (ISO 27001)

All code and content changes must follow a traceable workflow that an auditor can verify: **issue → branch → PR → merge → verify**.

## Standard Workflow

Every change that modifies behavior, configuration, content, or dependencies:

1. **Issue first.** Create a GitHub issue describing the change before starting work. Use the `change-request` issue template. If an issue already exists, reference it.
2. **Branch.** Create a feature branch from `main` named `{type}/{short-description}` (e.g., `feat/engagement-model`, `fix/ja-em-dash-cleanup`).
3. **Work.** Make changes on the branch. Run the project's verify/preflight checks before committing.
4. **PR.** Create a pull request linking to the issue with `Closes #N` or `Fixes #N` in the body. PR body must include a Summary and Test Plan.
5. **Merge.** Merge with `gh pr merge --admin --merge --delete-branch` (org policy blocks auto-merge; admin override is authorized for the repo owner).
6. **Post-merge verification.** After every merge to main:
   - Check GitHub CI: `gh run list --limit 3`
   - Check Cloudflare build logs (if the repo deploys to CF): verify the build succeeds and deploy completes
   - Check Dependabot: `gh api repos/{owner}/{repo}/dependabot/alerts --jq '[.[] | select(.state=="open")] | length'` — address any new alerts
7. **Release.** Releases are created periodically (not per-change) via `gh release create` with hand-written notes. The release cadence is at the developer's discretion.

## Fast Track (Exceptions)

These changes may go directly to `main` without an issue or PR:

- Single-file typo corrections
- Whitespace/formatting-only changes (e.g., Prettier runs)
- Cosmetic copy edits that don't change meaning

Fast-track changes still require:
- A descriptive conventional commit message
- The InfoSec/quality annotation line
- Post-push CI verification
- The `FAST_TRACK=1` env var to bypass the pre-commit hook: `FAST_TRACK=1 git commit -m "fix: ..."`

## Conventional Commits

All commits must follow the conventional commits format:

```
type(scope): description

Body explaining the change (if needed).

InfoSec: [security/quality/privacy consideration]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**InfoSec line** — required for all changes. Examples:
- `InfoSec: input validation added for user-supplied query parameters`
- `InfoSec: no security impact — content-only change`
- `InfoSec: dependency update addresses CVE-2026-XXXX`
- `Quality: writing standards compliance — em dash removal per localization guide`
- `Privacy: no PII handling changes`

If a change has no security, quality, or privacy implications, state that explicitly. The purpose is auditability, not bureaucracy.

## Rationale

This workflow produces the evidence chain that ISO 27001 (A.8.9 Configuration Management, A.8.25 Secure Development Lifecycle, A.8.32 Change Management) requires:

- **Change request** → GitHub issue with description and acceptance criteria
- **Authorization** → PR review and merge approval
- **Testing** → CI checks (lint, typecheck, test, security scan)
- **Implementation** → Commits on feature branch
- **Verification** → Post-merge CI and deploy confirmation
- **Release** → Tagged release with changelog

An auditor can trace any production change from release → PR → issue → commits → CI results.
