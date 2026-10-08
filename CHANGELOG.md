# Changelog

All notable changes to Proofspec are documented here.

## Unreleased

- Documentation: the unscoped npm name `proofspec` belongs to an unrelated
  project. The README now warns about it, installs only the GitHub release
  artifact, and runs the local binary with `npx --no-install` so a missing
  install fails instead of fetching that package.
- `server.json` no longer lists the npm identifier `proofspec`; this project
  has no npm release.
- A test scans every Markdown code block and `server.json` for plain
  `npx proofspec` invocations.

## 0.1.0 — 2026-07-17

- Define public software claims as versioned evidence contracts.
- Evaluate `all`, `any`, and threshold evidence policies.
- Cascade failed or unknown dependencies through a claim graph.
- Execute constrained file, HTTP, Git, npm, and manual checks through
  Postcondition.
- Preserve hash-chained Postcondition receipts in a local SQLite ledger.
- Export JSON, Markdown, standalone HTML, Mermaid, and SARIF reports.
- Provide CLI, TypeScript SDK, and MCP server surfaces.
