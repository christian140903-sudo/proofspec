# Proofspec

**Claims are cheap. Proofspec makes them executable.**

[![CI](https://github.com/christian140903-sudo/proofspec/actions/workflows/ci.yml/badge.svg)](https://github.com/christian140903-sudo/proofspec/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/christian140903-sudo/proofspec?display_name=tag)](https://github.com/christian140903-sudo/proofspec/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-53e6a7.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-53e6a7.svg)](package.json)

A README, release note, product page, or agent completion message can say more
than the evidence behind it. Proofspec turns the important statements in those
texts into versioned evidence contracts. It checks those contracts with
constrained verifiers, preserves hash-chained receipts, models dependencies
between claims, and fails CI when required claims are not actually verified.

It is for maintainers who publish claims about their software and for agent
setups that should check a claim before reporting it. It is not a test runner,
not a link crawler, and not a fact-checker for prose.

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

## Try it in two minutes

Requires Node.js 20 or newer.

> [!WARNING]
> **The npm package named `proofspec` is not this project.** That name on the
> public npm registry belongs to an unrelated author and ships its own
> `proofspec` executable. This project is not published on npm. Install it only
> from this repository or its GitHub release, and do not run plain
> `npx proofspec`: when no local install is present, npx downloads and runs
> that other package, and in CI it does so without asking.

Install the v0.1.0 release artifact from GitHub into a project, then call the
local binary with `--no-install`, which stops with an error instead of
downloading anything if the local install is missing:

```bash
npm install --save-dev https://github.com/christian140903-sudo/proofspec/releases/download/v0.1.0/proofspec-0.1.0.tgz
npx --no-install proofspec init     # writes proofspec.json with one claim: README.md exists
npx --no-install proofspec check    # exit 0: gate passed · exit 1: a required claim is not verified
```

In a project without a `README.md`, the first `check` prints
`Proofspec FAIL — my-project` and `0/1 verified · 1 failed` and exits with 1:
the starter claim is not true yet. Add a `README.md` and run `check` again to
see it pass. The reports (JSON, Markdown, HTML, Mermaid, SARIF) and the receipt
ledger land in `.proofspec/`.

In Claude Code, add the MCP server from the same release artifact. It reads
`proofspec.json` from the project directory:

```bash
claude mcp add proofspec -- npx --yes --package=https://github.com/christian140903-sudo/proofspec/releases/download/v0.1.0/proofspec-0.1.0.tgz -- proofspec serve
```

To try the CLI once without adding a dependency, name the release artifact
explicitly:

```bash
npx --package=https://github.com/christian140903-sudo/proofspec/releases/download/v0.1.0/proofspec-0.1.0.tgz -- proofspec --help
```

Last tried on 2026-10-08 in an empty project with an empty npm cache (Node 22,
Linux): install, `init` and the first `check` took 8 seconds including the
download. `claude mcp list` showed the server as connected; a separate MCP
client calling `proofspec_check` through the same command found the project's
`proofspec.json`.

## Why it exists

README linters check structure. Link checkers check URLs. Transcript auditors
compare an agent's words with a repository after the fact. Proofspec occupies a
different layer: the project author defines the evidence contract that must
travel with a public claim, and the same contract runs locally, in CI, through
TypeScript, or as an MCP tool.

A fair comparison: [markdown-link-check](https://www.npmjs.com/package/markdown-link-check)
checks every link in a Markdown file and tells you which ones are dead, without
any specification. Proofspec checks only what you configure. In exchange, a
claim can require that one specific page answers with status 200 *and*
contains the version the sentence next to the link names; if that claim has
severity `error`, the build fails when either stops being true.

Useful examples:

- “Version `1.4.0` is public on npm” → registry version check.
- “The release page is live” → public HTTP status/content checks.
- “This artifact contains 358 passing tests” → bounded JSON evidence plus an
  explicit limitation that the manifest does not replay the tests.
- “The published commit is tagged” → Git tag and remote-containment checks.
- “A human approved the usability” → manual evidence that remains `unknown`,
  never silently upgraded to external proof.

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

Without a clone, point npx at the release artifact. Do not use
`npx -y proofspec serve`; that starts the unrelated npm package.

```json
{
  "mcpServers": {
    "proofspec": {
      "command": "npx",
      "args": [
        "--yes",
        "--package=https://github.com/christian140903-sudo/proofspec/releases/download/v0.1.0/proofspec-0.1.0.tgz",
        "--",
        "proofspec",
        "serve"
      ],
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

After installing the release artifact as shown in [Try it in two minutes](#try-it-in-two-minutes) (not
`npm install proofspec`, which fetches the unrelated registry package):

```ts
import { runProofspec, renderReport } from 'proofspec';

const report = await runProofspec('./proofspec.json');
console.log(report.summary.gatePassed);
console.log(renderReport(report, 'markdown'));
```

## CI

```yaml
- run: npm install --no-save https://github.com/christian140903-sudo/proofspec/releases/download/v0.1.0/proofspec-0.1.0.tgz
- run: npx --no-install proofspec check proofspec.json
```

Keep `--no-install` in CI. npm answers its own install prompt with "yes" when
it detects CI or a non-interactive shell, so if the install step failed, plain
`npx proofspec` would fetch and run the unrelated `proofspec` package instead.

Commit the specification, not the generated `.proofspec/` ledger. Upload the
reports as build artifacts if reviewers need them.

## Verify it yourself

```bash
git clone https://github.com/christian140903-sudo/proofspec && cd proofspec
npm ci && npm test        # expected: 74 passing (last verified 2026-10-08, Node 22, fresh clone)
```

The tests cover the configuration schema and its validator (duplicate IDs,
unknown dependencies, cycles, impossible thresholds), the three evidence
policies and dependency blocking, the default and strict gates, all five report
formats including HTML escaping, the receipt ledger and path redaction, the CLI
and its exit codes, one real MCP exchange over stdio, the bundled example, and a
guard that fails if any Markdown example runs plain `npx proofspec`. CI runs
them on Node 20, 22 and 24.

What they do not cover: no test contacts a real website or the npm registry
(HTTP and npm checks are schema-validated here; their network behaviour is
tested in [postcondition-mcp](https://github.com/christian140903-sudo/postcondition-mcp)),
CI runs on Linux only, and the summary line that `check --strict` prints is not
asserted (see below).

The repository checks its own README, docs, package metadata and example with
Proofspec; CI runs this after the tests:

```bash
node dist/src/index.js check proofspec.json --no-write
# expected: Proofspec PASS — Proofspec
#           5/6 verified · 0 failed · 1 unknown · 0 unsupported · 0 blocked
```

The one unknown is the manual claim that a human has reviewed Proofspec's
broader usefulness. It stays unknown on purpose.

Further checks, after `npm test` has built `dist/`:

```bash
node dist/src/index.js check examples/proofspec.json   # the bundled example
npm run test:coverage                                   # coverage report
npm run smoke:pack                                      # packs the tarball, installs it in a scratch project, runs the CLI, imports the SDK
```

The example verifies three required claims, reports one honest informational
unknown, writes five report formats, and still passes the default gate. Add
`--strict` to require warning and info claims too.

## What it does not do

- **It does not run your tests or any other command.** There is no shell
  verifier. A claim such as “all tests pass” needs a machine-readable artifact
  or a published result, and a manifest records a value; it does not replay
  the tests.
- **It does not judge prose.** A satisfied verifier proves only the configured
  observation. Evidence can be precise while the sentence around it is still
  misleading, which is why limitations are first-class fields and human review
  still matters.
- **It does not turn manual review into proof.** Manual evidence stays
  `unknown` until it is attested separately.
- **It does not provide non-repudiation.** Proofspec is a claim-evidence
  system, not a certification authority. The local hash chain detects receipt
  modification but is not an externally signed transparency log.
- **It observes one moment.** HTTP and npm checks see public remote state when
  they run; file and Git checks see the local machine.
- **It is not on npm.** The unscoped npm name belongs to an unrelated project
  (see the warning above).
- **Two rough edges in 0.1.0.** With `--strict`, the exit code follows the
  strict gate, but the summary line still reports the default gate, so it can
  print `PASS` and exit with 1; scripts should read the exit code. `--no-write`
  skips the report files but still appends receipts to the local ledger.

Read the full [security model](docs/SECURITY-MODEL.md),
[limitations](docs/LIMITATIONS.md), [configuration reference](docs/CONFIG.md),
and [project origin](docs/ORIGINS.md).

## How this was built

Most of the code was written by AI coding agents under my direction. I wrote the
specification, set the constraints, decided what to test, reviewed the result
and rejected what did not hold. Release decisions and every claim in this README
are mine.

The public history starts at the finished 0.1.0 code (two commits on
2026-07-17); the agent sessions behind it are not published. Later changes
(October 2026: install path, npx guard, dependency floor, this README) carry
a `Co-Authored-By: Claude …` trailer in the commit history. Proofspec reuses the
verifiers and receipts of my package
[postcondition-mcp](https://github.com/christian140903-sudo/postcondition-mcp);
the background is in [ORIGINS.md](docs/ORIGINS.md).

## Status

`0.1.0` · GitHub release (2026-07-17), not on npm · experimental · single
maintainer · no known external users · last verified 2026-10-08.

The configuration schema is an early public version; migrations will be
documented before incompatible changes. Changes since 0.1.0 are listed under
“Unreleased” in the [changelog](CHANGELOG.md). Please report security issues
through the private process in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Christian Bucher
