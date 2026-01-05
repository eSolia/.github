# Security Assessment Infrastructure

Central infrastructure for creating security assessment pages across eSolia projects. This enables each site to display OWASP ASVS compliance status with a design that matches the site's look and feel.

## Overview

The security assessment system consists of:
1. **Scanner Script** - Runs pattern-based security checks against OWASP ASVS 5.0
2. **JSON Report** - Generated output consumed by the assessment page
3. **Assessment Page** - Displays results in site-native styling

## Quick Start for Claude Code

When implementing a security assessment page on a new site:

```markdown
Read the implementation guide at:
https://github.com/eSolia/.github/blob/main/security-assessment/README.md

Then implement:
1. Copy and customize the scanner script for this project's stack
2. Generate the JSON report to the appropriate location
3. Create the assessment page matching the site's design system
```

## Implementation Steps

### Step 1: Create the Scanner Script

Copy `asvs-check-template.ts` to your project's `scripts/` directory and customize:

```bash
# From your project root
curl -O https://raw.githubusercontent.com/eSolia/.github/main/security-assessment/asvs-check-template.ts
mv asvs-check-template.ts scripts/asvs-check.ts
```

**Required customizations:**

1. Update `PROJECT_CONFIG` at the top of the file:
```typescript
const PROJECT_CONFIG = {
  name: 'your-project-name',
  sourcePaths: ['src/'],           // Paths to scan
  apiPaths: ['src/routes/api/'],   // API-specific paths
  webPaths: ['src/routes/'],       // Web/frontend paths
  packageManager: 'npm',           // npm | pnpm | yarn | bun
  corsOrigins: ['yourdomain.com'], // Expected CORS origins
};
```

2. Adjust the ASVS checks for your stack (see "Check Customization" below)

### Step 2: Configure the Output Location

The scanner outputs JSON that must be accessible to your assessment page:

| Framework | Recommended Location |
|-----------|---------------------|
| SvelteKit | `src/lib/data/asvs-assessment.json` |
| Astro     | `src/data/asvs-assessment.json` |
| Next.js   | `public/data/asvs-assessment.json` |
| Hono API  | `static/asvs-assessment.json` |

### Step 3: Create the Assessment Page

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

### Step 4: Add to CI/CD Pipeline

Add to your GitHub Actions workflow:

```yaml
- name: Run ASVS Check
  run: npx tsx scripts/asvs-check.ts --format json --output src/lib/data/asvs-assessment.json
```

Or use the shared security workflow with `run-asvs: true`:

```yaml
jobs:
  security:
    uses: eSolia/.github/.github/workflows/security.yml@main
    with:
      run-asvs: true
```

## Check Customization

### Available Check Categories

| Category | ASVS Section | Checks Available |
|----------|-------------|------------------|
| V2 Authentication | Password hashing, token entropy, MFA | 3 |
| V3 Session | Token expiration, session management | 2 |
| V4 Access Control | CORS, rate limiting, authorization | 3 |
| V5 Validation | Input validation, SQL injection, XSS | 4 |
| V7 Error Handling | Stack trace exposure, error messages | 2 |
| V8 Data Protection | Secrets management, encryption | 2 |
| V9 Communication | Security headers, TLS | 2 |
| V10 Malicious Code | Dependency audit, integrity | 2 |

### Adding Custom Checks

```typescript
// In your customized asvs-check.ts
results.push({
  id: 'CUSTOM-001',
  category: 'V5 Validation',
  name: 'Custom Validation Check',
  status: someCondition ? 'pass' : 'fail',
  description: 'Description of what this checks',
  asvsRef: 'V5.x.x',
  locations: matchingLocations,
  remediation: 'How to fix if failing',
});
```

### Stack-Specific Patterns

**SvelteKit + Cloudflare:**
```typescript
// Check for platform.env usage (not process.env)
const platformEnvLocations = searchPattern(serverFiles, /platform\.env\./);
```

**Hono:**
```typescript
// Check for c.env usage
const honoEnvLocations = searchPattern(apiFiles, /c\.env\./);
```

**Drizzle ORM:**
```typescript
// Verify parameterized queries
const drizzleLocations = searchPattern(apiFiles, /\.select\(\)|\.insert\(\)|\.update\(\)/);
```

## Design Matching Guidelines

The assessment page should feel native to each site. Key elements to match:

1. **Typography** - Use site's heading and body fonts
2. **Colors** - Map status colors to site's palette:
   - Pass → site's success/green
   - Fail → site's error/red
   - Warning → site's warning/amber
3. **Layout** - Use site's container widths and spacing scale
4. **Components** - Reuse site's card, badge, and icon components

### Example: Mapping to Design Tokens

```css
/* Map assessment status to site's design tokens */
.check[data-status="pass"] {
  border-color: var(--color-success);
}
.check[data-status="fail"] {
  border-color: var(--color-error);
}
.check[data-status="warning"] {
  border-color: var(--color-warning);
}
```

## JSON Schema

See [SCHEMA.md](./SCHEMA.md) for the complete JSON report schema.

## File Structure

After implementation, your project should have:

```
your-project/
├── scripts/
│   └── asvs-check.ts          # Customized scanner
├── src/
│   ├── lib/data/              # Or appropriate location
│   │   └── asvs-assessment.json
│   └── routes/security/assessment/
│       └── +page.svelte       # Assessment page
└── .github/workflows/
    └── security.yml           # Uses shared workflow
```

## Troubleshooting

### Scanner exits with error code 1
This is intentional - the script exits non-zero when checks fail. Use `|| true` in CI if you want to continue despite failures.

### JSON not updating
Ensure the scanner runs before build and the output path matches your import.

### Checks showing "warning" instead of "pass"
Warnings indicate the pattern wasn't found but it's not critical. Review if the check patterns match your codebase.

## Reference Implementation

See pub-cogley for a complete working implementation:
- Scanner: `scripts/asvs-check.ts`
- Page: `apps/web/src/routes/security/assessment/+page.svelte`
- Report: `apps/web/src/lib/data/asvs-assessment.json`
