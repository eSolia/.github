Run the sync-all script to distribute centralized scripts, commands, and rules to all eSolia consumer repos.

Execute `./scripts/sync-all.sh` from the esolia.github repo root. This runs `sync.sh` in each consumer repo (esolia-2025, jac-2026, nexus, courier, codex, pulse, periodic, pub-cogley, chocho).

Show the output to the user. If any repos fail or are skipped, suggest next steps (e.g., clone missing repos, check network).

Supported arguments (pass through from user):
- `--check` — check staleness only, don't sync
- Specific repo names — sync only those repos
- `REPOS_DIR=/path` — override repos parent directory
