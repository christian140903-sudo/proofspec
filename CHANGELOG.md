# Changelog

All notable changes to Proofspec are documented here.

## Unreleased

- Documentation: the unscoped npm name `proofspec` belongs to an unrelated
  project. The README now warns about it, installs only the GitHub release
  artifact, and runs the local binary with `npx --no-install` so a missing
  install fails instead of fetching that package.
- `server.json` no longer lists the npm identifier `proofspec`; this project
  has no npm release.
- A test scans every fenced Markdown code block (also indented and `~~~`
  fences) for `npx proofspec` invocations that neither use `--no-install` nor
  name this project's GitHub release artifact, fails on MCP configuration
  blocks that are not valid JSON, and checks that `server.json` lists no npm
  package `proofspec`.
- Raise the `@modelcontextprotocol/sdk` floor to `^1.32.1` and refresh the
  lockfile. `npm audit` on a fresh clone goes from 7 findings (1 critical,
  3 high, 3 moderate; the SDK 1.29.0 itself and packages it pulls in) to 0.
  Installs from the v0.1.0 release tarball already resolve SDK 1.32.1, since
  the tarball carries no lockfile.
- Documentation: the README follows the shared project structure (try it,
  why it exists, verify it yourself with the expected test count and date,
  what it does not do, how this was built, status). It documents two 0.1.0
  rough edges: `check --strict` prints the default gate's summary line while
  the exit code follows the strict gate, and `--no-write` still appends
  receipts to the local ledger. The self-spec checks the renamed
  "Try it in two minutes" section.

## 0.1.0 — 2026-07-17

- Define public software claims as versioned evidence contracts.
- Evaluate `all`, `any`, and threshold evidence policies.
- Cascade failed or unknown dependencies through a claim graph.
- Execute constrained file, HTTP, Git, npm, and manual checks through
  Postcondition.
- Preserve hash-chained Postcondition receipts in a local SQLite ledger.
- Export JSON, Markdown, standalone HTML, Mermaid, and SARIF reports.
- Provide CLI, TypeScript SDK, and MCP server surfaces.
