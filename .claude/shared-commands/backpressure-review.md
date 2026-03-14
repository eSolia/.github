# Backpressure Review

Deep review of this project against the quality enforcement strategy. This command handles the judgment-based checks that the deterministic audit script (`audit-backpressure.sh`) cannot cover.

## Instructions

Fetch the backpressure guide from the eSolia standards MCP:
- Use `mcp__esolia-standards__get_standard` with slug `sveltekit-backpressure`
- If the MCP is not available, check `docs/shared/guides/SVELTEKIT_BACKPRESSURE.md` locally

Read it fully before starting.

Perform the following review, then output a structured report.

### 1. Type system audit

Examine `src/app.d.ts` (or equivalent):

- Is `Locals.user` a simple `User | null`, or a discriminated union that forces exhaustive handling?
- Is there a `TenantContext` type (or equivalent) that makes unscoped queries structurally impossible?
- Are load function return types narrow and explicit (using `satisfies`), or wide and trusting?

Rate: strong / adequate / weak. Recommend specific changes.

### 2. Data boundary validation

Search for D1 query patterns (`db.prepare`, `.first()`, `.all()`, `.batch()`):

- Are results validated through Zod schemas at the boundary, or cast with `as`?
- Is `safeParse()` used in form actions and API routes, or bare `.parse()`?
- Are there raw `db.prepare()` calls scattered across load functions, or centralized in a query helper module?

Rate: strong / adequate / weak. Count the violations.

### 3. CLAUDE.md audit

Read this project's `CLAUDE.md` and identify every "always" or "never" statement. For each one, assess:

| Statement | Can be a type? | Can be a lint rule? | Can be a test? | Should stay in CLAUDE.md? |
| --------- | -------------- | ------------------- | -------------- | ------------------------- |

Statements that can be mechanically enforced should migrate out of CLAUDE.md. Only domain knowledge, architectural intent, and context should remain.

### 4. Lint rule coverage

Check the linting configuration against `docs/shared/guides/LINTING_STRATEGY.md`:

**Oxlint layer (fast pass):**

- Is `oxlint` installed as a dev dependency?
- Is there an `.oxlintrc.json` with `correctness: "error"`, `suspicious: "warn"`, `perf: "warn"` enabled?
- Are the appropriate plugins enabled (`typescript`, `import`, `unicorn`, `promise`)?
- Are Svelte-incompatible rules disabled in oxlint (e.g., `no-unused-vars` off, since oxlint can't see template usage)?

**ESLint layer (Svelte + custom rules):**

- Is `eslint-plugin-svelte` installed and configured with Svelte 5 rules?
- Is `eslint-plugin-oxlint` installed and placed **last** in the flat config to disable overlapping rules?
- Are any custom backpressure rules implemented (`no-raw-html`, `no-schema-parse`, `no-binding-leak`, `no-silent-catch`)?
- Is the `esolia` plugin registered with the custom rules?

**Script wiring:**

- Does `package.json` chain oxlint before eslint? (`"lint": "oxlint --config .oxlintrc.json && eslint ."`)
- Does a `verify` script exist that chains `lint` → `check` → `test:unit`?

Rate: strong / adequate / weak. List what's missing vs. the LINTING_STRATEGY.md reference config.

### 5. Test coverage assessment

Look at existing test files:

- Are there unit tests for utility functions (especially sanitize, validation)?
- Are there contract tests for D1/R2/KV behaviors?
- Is there a `verify` script that chains all checks?
- What's the most impactful test that's missing?

### 6. Tenant isolation

For multi-tenant repos (those with `org_id` or `client_id` patterns):

- Are queries scoped via a helper module, or is `org_id` added ad-hoc in each load function?
- Could an AI-generated load function accidentally skip the tenant filter?
- Would the type system catch it if it did?

## Output format

Write the report to `docs/backpressure-review.md` with this structure:

```markdown
# Backpressure Review — [project name]

**Date:** [today]
**Overall readiness:** [Phase 1 / Phase 2 / Phase 3 / Phase 4]

## Scorecard

| Area             | Rating                   | Key finding |
| ---------------- | ------------------------ | ----------- |
| Type system      | strong/adequate/weak     | ...         |
| Data boundaries  | strong/adequate/weak     | ...         |
| CLAUDE.md        | strong/adequate/weak     | ...         |
| Lint rules       | strong/adequate/weak     | ...         |
| Test coverage    | strong/adequate/weak     | ...         |
| Tenant isolation | strong/adequate/weak/n-a | ...         |

## Recommended next actions

1. [highest-impact action]
2. [second action]
3. [third action]

## Detailed findings

[One section per area above]
```

After writing the report, summarize the top 3 actions for the developer.
