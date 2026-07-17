# Security Policy

## Supported version

Security fixes target the latest `0.1.x` release while the public interface is
still evolving.

## Report a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private
security-advisory flow for `christian140903-sudo/proofspec`.

Include the affected version, configuration, expected boundary, observed
behavior, and a minimal reproduction that contains no real credentials or
private evidence.

## Operating boundary

Proofspec inherits Postcondition's constrained verifier surface. It does not
accept arbitrary shell commands. HTTP verification is GET-only and blocks
private, loopback, link-local, and reserved targets by default. Git checks use
fixed argument arrays and do not fetch or push.

Proofspec reports may contain excerpts or metadata returned by verifiers.
Review generated artifacts before publishing them. Absolute paths under the
configured project root are redacted from reports, but the private local
receipt ledger may retain resolved paths as verification evidence.
