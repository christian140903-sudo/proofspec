# Security Model

## Intended use

Proofspec is a local CLI, SDK, CI gate, and stdio MCP server. It reads an
explicit `proofspec.json`, runs only the configured constrained verifiers, and
writes reports plus a local SQLite receipt ledger.

## Trust boundaries

1. The configuration author is trusted to select the intended observations.
2. Files, Git repositories, HTTP responses, and npm registry data are untrusted
   evidence inputs.
3. Verifier results are classified and never flattened into one generic
   “proof” label.
4. Claim dependencies affect effective status but cannot turn failed evidence
   into success.
5. Generated reports are projections. The local ledger is the receipt source.

## Explicit non-goals

- Running user-provided shell commands.
- Sending credentials or custom authorization headers.
- Reading private network targets by default.
- Proving legal compliance, security certification, novelty, scientific truth,
  clinical validity, or subjective experience.
- Treating an agent's own statement as external evidence.

## Publication safety

Reports redact the configured project-root prefix from nested evidence values.
They do not attempt general secret detection. Review reports before committing
them, especially when a verifier observes third-party content.
