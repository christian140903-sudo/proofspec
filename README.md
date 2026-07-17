# Proofspec

**Claims are cheap. Proofspec makes them executable.**

Proofspec turns the important statements in a README, release, product page, or
agent completion message into versioned evidence contracts. It checks those
contracts with constrained verifiers, preserves hash-chained receipts, models
dependencies between claims, and fails CI when required claims are not actually
verified.

[![CI](https://github.com/christian140903-sudo/proofspec/actions/workflows/ci.yml/badge.svg)](https://github.com/christian140903-sudo/proofspec/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-53e6a7.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-53e6a7.svg)](package.json)

```text
README / release / product claim
              │
              ▼
       proofspec.json
   policies + dependencies
              │
              ▼
  constrained observations
  file · HTTP · Git · npm · manual
              │
              ▼
 receipts + CI gate + reviewer reports
 JSON · Markdown · HTML · Mermaid · SARIF
```

Proofspec does not declare broad truth. A satisfied verifier proves only the
observation you configured. Unknown stays unknown; manual stays manual; a
dependency that is not verified blocks the claims built on top of it.

## Why this exists

README linters check structure. Link checkers check URLs. Transcript auditors
compare an agent's words with a repository after the fact. Proofspec occupies a
different layer: the project author defines the evidence contract that must
travel with a public claim, and the same contract runs locally, in CI, through
TypeScript, or as an MCP tool.

Useful examples:

- “Version `1.4.0` is public on npm” → registry version check.
- “The release page is live” → public HTTP status/content checks.
- “This artifact contains 358 passing tests” → bounded JSON evidence plus an
  explicit limitation that the manifest does not replay the tests.
- “The published commit is tagged” → Git tag and remote-containment checks.
- “A human approved the usability” → manual evidence that remains `unknown`,
  never silently upgraded to external proof.

## Quick start

Requires Node.js 20 or newer.

The v0.1.0 source release is available now. Until the npm registry publication
is visible, install the smoke-tested release artifact directly from GitHub:

```bash
npm install --save-dev https://github.com/christian140903-sudo/proofspec/releases/download/v0.1.0/proofspec-0.1.0.tgz
npx proofspec init
npx proofspec check
```

Or run the included example from a clone:

```bash
npm install
npm test
node dist/src/index.js check examples/proofspec.json
```

The example verifies three required claims, reports one honest informational
unknown, writes five report formats, and still passes the default gate. Add
`--strict` to require warning and info claims too.

## A specification

```json
{
  "$schema": "https://raw.githubusercontent.com/christian140903-sudo/proofspec/main/proofspec.schema.json",
  "schemaVersion": 1,
  "project": { "name": "example" },
  "claims": [
    {
      "id": "release-visible",
      "statement": "example 1.0.0 is public on npm.",
      "severity": "error",
      "policy": { "mode": "all" },
      "evidence": [
        {
          "id": "npm-version",
          "verifier": {
            "kind": "npm",
            "package": "example",
            "check": { "op": "version_exists", "version": "1.0.0" }
          }
        }
      ],
      "limitations": ["Registry visibility does not establish package quality."]
    }
  ]
}
```

Editor validation is provided by [`proofspec.schema.json`](proofspec.schema.json).
Runtime validation additionally rejects duplicate IDs, unknown dependencies,
impossible thresholds, and dependency cycles.

## Evidence policies and claim graphs

Each claim supports one evidence policy:

| Policy | Verified when | Honest unknown when |
|---|---|---|
| `all` | every check is satisfied | none failed, at least one is unknown |
| `any` | at least one check is satisfied | none satisfied, at least one is unknown |
| `at_least` | the threshold is satisfied | unknown checks could still reach it |

`dependsOn` creates a directed claim graph. A directly verified claim becomes
`blocked` when any dependency is not effectively verified. The configuration
validator rejects cycles.

The default gate fails only non-verified `error` claims. `--strict` requires
every claim, regardless of severity, to be verified.

## Verifiers

Proofspec inherits the constrained verifier surface from
[`postcondition-mcp`](https://github.com/christian140903-sudo/postcondition-mcp):

| Kind | Bounded observations |
|---|---|
| `file` | existence, absence, SHA-256, text, JSON pointer, size |
| `http` | GET status, text, JSON pointer; private targets blocked |
| `git` | branch, clean state, head, tag, remote commit containment |
| `npm` | version visibility and dist-tags |
| `manual` | explicit instructions; result remains `unknown` |

There is intentionally no arbitrary shell verifier and no custom authorization
header surface.

## Reports

```bash
proofspec validate [config]
proofspec check [config] --formats json,markdown,html,mermaid,sarif
proofspec explain release-visible [config]
proofspec check [config] --out artifacts/proofspec
```

- JSON is the canonical machine-readable run report.
- Markdown is designed for release notes and human review.
- HTML is a standalone, escaped, no-index dashboard.
- Mermaid visualizes claim dependencies.
- SARIF exposes non-verified claims to code-scanning interfaces.

Every evidence check creates a Postcondition receipt. The local SQLite ledger is
hash chained and revalidated at the end of each run. Reports include a stable
digest and redact the configured project-root prefix from observed values.

The repository also [checks its own public surface](proofspec.json) in CI. That
self-spec deliberately leaves the subjective usefulness claim as informational
and unknown.

## MCP server

From a clone, build once and point the MCP client at the absolute entry path:

```json
{
  "mcpServers": {
    "proofspec": {
      "command": "node",
      "args": ["/absolute/path/to/proofspec/dist/src/index.js", "serve"],
      "env": { "PROOFSPEC_CONFIG": "/absolute/path/to/proofspec.json" }
    }
  }
}
```

The stdio server exposes:

- `proofspec_validate`
- `proofspec_check`
- `proofspec_explain`
- `proofspec_render`
- resources `proofspec://schema` and `proofspec://example`
- prompt `audit-public-claims`

## TypeScript API

```ts
import { runProofspec, renderReport } from 'proofspec';

const report = await runProofspec('./proofspec.json');
console.log(report.summary.gatePassed);
console.log(renderReport(report, 'markdown'));
```

## CI

```yaml
- run: npm install --no-save https://github.com/christian140903-sudo/proofspec/releases/download/v0.1.0/proofspec-0.1.0.tgz
- run: npx proofspec check proofspec.json
```

Commit the specification, not the generated `.proofspec/` ledger. Upload the
reports as build artifacts if reviewers need them.

## Trust boundary

Proofspec is a claim-evidence system, not a certification authority. A local
hash chain detects receipt modification but is not an externally signed
transparency log. Evidence can be precise while the prose around it is still
misleading, which is why limitations are first-class fields and human review
still matters.

Read the full [security model](docs/SECURITY-MODEL.md),
[limitations](docs/LIMITATIONS.md), [configuration reference](docs/CONFIG.md),
and [project origin](docs/ORIGINS.md).

## Development

```bash
npm install
npm test
npm run test:coverage
npm run smoke:pack
```

MIT licensed. Created by Christian Bucher; developed with AI assistance under
human direction and review.
