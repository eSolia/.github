# eSolia `.github` Repository

This is eSolia's [special GitHub organization repository](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/customizing-your-organizations-profile). It serves two purposes:

1. **Organization profile README** — the `profile/README.md` file is displayed on [github.com/eSolia](https://github.com/eSolia). It's generated dynamically using [Lume](https://lume.land/) and rebuilt daily via GitHub Actions.

2. **Shared workflows** — reusable CI/CD workflows (like `security.yml`) that any eSolia repository can reference.

## How the Profile README Works

A [Vento](https://vento.js.org/) template (`src/repo-readme.vto`) pulls live data at build time:

- **Blog posts** from [blog.esolia.pro](https://blog.esolia.pro) JSON feeds (English + Japanese)
- **Japanese holidays** from [holidays-jp](https://holidays-jp.github.io/api/v1/date.json)
- **Build metadata** (Lume/Deno/V8 versions, repo size)

The Lume build generates `_site/repo-readme.md`, which a post-build script copies to `profile/README.md`. A GitHub Actions workflow runs this daily at 16:30 UTC and on every push.

## Development

```bash
# Install Deno: https://deno.land
deno task serve   # Preview at http://localhost:3000
deno task build   # Build once
```

## Repository Structure

```
src/
  _data.ts          # Data fetching (blog feeds, holidays, repo metrics)
  repo-readme.vto   # Vento template → generates profile/README.md
profile/
  README.md         # Generated output (do not edit directly)
.github/workflows/
  update-profile-readme.yml   # Daily rebuild + auto-commit
  security.yml                # Reusable security scanning workflow
```

## License

MIT
