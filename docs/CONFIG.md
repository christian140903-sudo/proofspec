# Configuration Reference

Proofspec reads `proofspec.json` by default.

```json
{
  "$schema": "https://raw.githubusercontent.com/christian140903-sudo/proofspec/main/proofspec.schema.json",
  "schemaVersion": 1,
  "project": { "name": "example" },
  "claims": [
    {
      "id": "release-visible",
      "statement": "example 1.0.0 is public on npm",
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
      "limitations": ["Registry visibility does not prove package quality."]
    }
  ]
}
```

## Claim fields

| Field | Required | Meaning |
|---|---:|---|
| `id` | yes | Stable lowercase identifier. |
| `statement` | yes | The narrow public claim being evaluated. |
| `severity` | no | `error` (default), `warning`, or `info`. |
| `policy` | no | `all` (default), `any`, or `at_least`. |
| `evidence` | yes | One or more constrained Postcondition verifiers. Empty evidence is allowed but reports `unsupported`. |
| `dependsOn` | no | Claim IDs that must also be effectively verified. |
| `limitations` | no | Material boundaries that should travel with the claim. |
| `tags` | no | Search and reporting labels. |

## Relative paths

File paths, Git working directories, ledger paths, and report directories are
resolved relative to the configuration file, not the shell's current working
directory.

## Exit codes

- `0`: every `error` claim is effectively verified.
- `1`: one or more required claims need attention.
- `2`: invalid configuration or runtime failure.

`proofspec check --strict` also treats non-verified warning and info claims as a
failing gate.
