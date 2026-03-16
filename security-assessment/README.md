# Security Assessment Infrastructure

Central infrastructure for creating security assessment pages across eSolia projects. This enables each site to display OWASP ASVS compliance status with a design that matches the site's look and feel.

## Overview

The security assessment system consists of:
1. **Centralized Scanner** — Shared `asvs-check.ts` distributed via `sync.sh` to `scripts/shared/`
2. **Per-repo Config** — `scripts/asvs-config.json` with project-specific paths and feature flags
3. **JSON Report** — Generated output consumed by the assessment page
4. **Assessment Page** — Displays results in site-native styling

## Quick Start

### Step 1: Sync shared scripts

If not already synced:

```bash
curl -sSfL https://raw.githubusercontent.com/eSolia/.github/main/scripts/sync.sh | bash
```

This places `asvs-check.ts` in `scripts/shared/`.

### Step 2: Create your config

Create `scripts/asvs-config.json` in your project root. See `scripts/asvs-config.example.json` for the full schema.

```json
{
  "name": "Your Project Name",
  "sourcePaths": ["src/"],
  "apiPaths": ["src/routes/api/", "src/lib/server/"],
  "webPaths": ["src/routes/", "src/lib/components/"],
  "configPaths": ["."],
  "packageManager": "npm",
  "corsOrigins": ["esolia.co.jp", "yourapp.esolia.co.jp"],
  "extensions": [".ts", ".tsx", ".js", ".svelte"],
  "configExtensions": [".json", ".jsonc", ".toml", ".yaml", ".yml"],
  "skipDirs": ["node_modules", ".svelte-kit", "dist", ".git", "build", ".wrangler"]
}
```

**Optional feature flags** (all default to `true` if omitted):

| Field | Default | Purpose |
|-------|---------|---------|
| `hasUserAuth` | `true` | Set `false` for public-only sites — skips cookie, session, IDOR checks |
| `hasEncryption` | `true` | Set `false` if app doesn't manage encryption keys |
| `authProvider` | `null` | Set `"cloudflare-zero-trust"` to mark auth checks as N/A |
| `isMultiTenant` | `true` | Set `false` for single-user systems — skips tenant isolation |

### Step 3: Run the check

```bash
# Console output
npx tsx scripts/shared/asvs-check.ts

# JSON report
npx tsx scripts/shared/asvs-check.ts --format json --output src/lib/data/asvs-assessment.json
```

### Step 4: Configure the Output Location

The scanner outputs JSON that must be accessible to your assessment page:

| Framework | Recommended Location |
|-----------|---------------------|
| SvelteKit | `src/lib/data/asvs-assessment.json` |
| Astro     | `src/data/asvs-assessment.json` |
| Next.js   | `public/data/asvs-assessment.json` |
| Hono API  | `static/asvs-assessment.json` |

### Step 5: Create the Assessment Page

The page should:
1. Import the JSON report
2. Calculate compliance score
3. Display results grouped by ASVS category
4. Match the site's design system

**SvelteKit Example:**
```svelte
<script lang="ts">
  import assessmentData from '$lib/data/asvs-assessment.json';

  const report = assessmentData;
  const score = Math.round((report.summary.passed / report.summary.total) * 100);
</script>

<h1>Security Assessment</h1>
<p>Compliance Score: {score}%</p>

{#each report.checks as check}
  <div class="check" data-status={check.status}>
    <strong>[{check.id}]</strong> {check.name}
    <p>{check.description}</p>
  </div>
{/each}
```

### Step 6: Add to CI/CD Pipeline

Use the shared security workflow with `run-asvs: true`:

```yaml
jobs:
  security:
    uses: eSolia/.github/.github/workflows/security.yml@main
    with:
      run-asvs: true
```

The workflow automatically runs `sync.sh` to fetch the latest shared scripts before running the check.

## Check Categories

| Category | ASVS Section | Checks |
|----------|-------------|--------|
| V1 Architecture | Component separation, validation architecture | 2 |
| V2 Authentication | Password hashing, token entropy, MFA, WebAuthn | 8 |
| V3 Session | Cookies, expiration, logout, idle timeout | 7 |
| V4 Access Control | RBAC, tenant isolation, IDOR, step-up auth | 5 |
| V5 Validation | Input validation, XSS, SQLi, command/path injection | 7 |
| V6 Cryptography | Algorithms, HMAC, key management, IV/nonce | 6 |
| V7 Error Handling | Stack traces, sensitive data in logs, structured logging | 5 |
| V8 Data Protection | Encryption, secrets management, privacy | 4 |
| V9 Communication | TLS, security headers, CORS, cert pinning | 5 |
| V10 Malicious Code | eval detection, dependency audit | 3 |
| V12 Files | Upload validation | 1 |
| V13-14 API/Config | Rate limiting, CSRF, debug mode, default creds | 5 |

## Design Matching Guidelines

The assessment page should feel native to each site. Key elements to match:

1. **Typography** — Use site's heading and body fonts
2. **Colors** — Map status colors to site's palette:
   - Pass: site's success/green
   - Fail: site's error/red
   - Warning: site's warning/amber
3. **Layout** — Use site's container widths and spacing scale
4. **Components** — Reuse site's card, badge, and icon components

```css
/* Map assessment status to site's design tokens */
.check[data-status="pass"]    { border-color: var(--color-success); }
.check[data-status="fail"]    { border-color: var(--color-error); }
.check[data-status="warning"] { border-color: var(--color-warning); }
```

## JSON Schema

See [SCHEMA.md](./SCHEMA.md) for the complete JSON report schema.

## File Structure

After implementation, your project should have:

```
your-project/
├── scripts/
│   ├── asvs-config.json          # Per-repo config (committed)
│   └── shared/                   # Gitignored — fetched by sync.sh
│       └── asvs-check.ts         # Centralized scanner
├── src/
│   ├── lib/data/
│   │   └── asvs-assessment.json  # Generated report
│   └── routes/security/assessment/
│       └── +page.svelte          # Assessment page
```

## Active Implementations

| Repo | Assessment Page | Config |
|------|----------------|--------|
| pulse | `/security/assessment` | `scripts/asvs-config.json` |
| periodic | `/docs/security/assessment` | `scripts/asvs-config.json` |
| courier | `/security/assessment` | `scripts/asvs-config.json` |
| nexus | JSON report only | `scripts/asvs-config.json` |
| pub-cogley | JSON report only | `scripts/asvs-config.json` (CFZT, no-auth) |
| chocho | JSON report only | `scripts/asvs-config.json` |

## Troubleshooting

### Scanner exits with error code 1
This is intentional — the script exits non-zero when checks fail. Use `|| true` in CI if you want to continue despite failures.

### JSON not updating
Ensure the scanner runs before build and the output path matches your import.

### Checks showing "warning" instead of "pass"
Warnings indicate the pattern wasn't found but it's not critical. Review if the check patterns match your codebase.

### "No asvs-config.json found" error
Create `scripts/asvs-config.json` — see Step 2 above or copy from `scripts/asvs-config.example.json` in esolia.github.
