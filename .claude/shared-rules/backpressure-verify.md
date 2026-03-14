# Backpressure Verification Rule

After generating or modifying SvelteKit code (Svelte components, server routes, API endpoints, hooks), always run the project's preflight checks before presenting results.

## Verification steps

1. Run `npm run verify` (or the manual chain: `oxlint --config .oxlintrc.json && eslint . && svelte-kit sync && svelte-check --tsconfig ./tsconfig.json`)
2. If checks fail, read the errors, fix the code, and re-run until clean
3. Only present the result to the user after all checks pass

The `verify` script should chain: oxlint (fast pass) → eslint (Svelte + custom rules) → svelte-check (types) → vitest (unit tests). For the full linting setup, use `mcp__esolia-standards__get_standard` with slug `linting-strategy`.

## Quality principles (from SVELTEKIT_BACKPRESSURE.md)

- Prefer `safeParse()` over `.parse()` for Zod schemas in form actions and API routes
- Never use `{@html expr}` without wrapping in `sanitizeHtml()` from `$lib/sanitize.ts`
- Never return platform bindings (`platform.env.*`) from load functions
- Use parameterized queries (`.bind()`) — never interpolate values into SQL strings
- Include tenant isolation (`org_id` / `client_id`) in all multi-tenant queries

These are reminders — the type system and lint rules should enforce them mechanically. If you find yourself relying on this rule to catch errors that a type or lint rule could catch instead, note it for the developer.
