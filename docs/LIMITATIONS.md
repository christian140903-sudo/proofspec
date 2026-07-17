# Limitations

- A satisfied verifier proves only its configured observation. It does not prove
  a broader interpretation of the prose claim.
- File and Git checks observe the local machine. HTTP and npm checks observe
  public remote state at one point in time.
- A local Postcondition hash chain detects receipt mutation but is not an
  externally signed transparency log or non-repudiation system.
- Manual evidence remains `unknown` until a separate attestation is recorded in
  Postcondition; Proofspec never upgrades it to external observation.
- Proofspec does not execute arbitrary commands, so claims such as “all tests
  pass” need a bounded machine-readable artifact or another verifier that
  observes a published result.
- A claim can be precisely checked and still be misleading if it omits material
  context. Use `limitations` in the claim spec and human review for scope.
- The generated HTML report is standalone and escapes report data, but it is not
  a hosted access-control system.
- Version `0.1.x` is an early public schema. Migrations will be documented before
  incompatible changes.
