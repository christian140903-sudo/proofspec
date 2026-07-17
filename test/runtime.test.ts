import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { canonicalJson, redactRoot, sha256 } from '../src/canonical.js';
import { loadProofspec, normalizeVerifier } from '../src/config.js';
import { runProofspec } from '../src/runtime.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'proofspec-runtime-'));
  await writeFile(join(root, 'README.md'), '# Fixture\n\nEvidence contract ready.\n');
  await writeFile(join(root, 'artifact.json'), '{"name":"fixture","tests":{"passed":7}}\n');
  const configPath = join(root, 'proofspec.json');
  await writeFile(configPath, JSON.stringify({
    schemaVersion: 1,
    project: { name: 'Runtime fixture' },
    defaults: { ledgerPath: '.proofspec/receipts.db', reportDir: '.proofspec/reports' },
    claims: [
      {
        id: 'documented',
        statement: 'The fixture contains evidence-contract documentation.',
        evidence: [
          { id: 'readme', description: 'README phrase', verifier: { kind: 'file', path: 'README.md', check: { op: 'contains', text: 'Evidence contract ready.' } } },
          { id: 'json', verifier: { kind: 'file', path: 'artifact.json', check: { op: 'json_equals', pointer: '/tests/passed', value: 7 } } },
        ],
      },
      {
        id: 'reviewed',
        statement: 'A human reviewed the fixture usefulness.',
        severity: 'info',
        evidence: [{ id: 'manual', verifier: { kind: 'manual', instructions: 'Review the fixture.' } }],
      },
    ],
  }, null, 2));
  return { root, configPath };
}

test('loads and resolves paths relative to the configuration', async () => {
  const { root, configPath } = await fixture();
  const loaded = await loadProofspec(configPath);
  assert.equal(loaded.rootDir, root);
  assert.equal(loaded.ledgerPath, join(root, '.proofspec/receipts.db'));
  assert.equal(loaded.reportDir, join(root, '.proofspec/reports'));
  const verifier = loaded.config.claims[0]?.evidence[0]?.verifier;
  assert.equal(verifier?.kind, 'file');
  if (verifier?.kind === 'file') assert.equal(verifier.path, join(root, 'README.md'));
});

test('leaves remote and manual verifiers unchanged', () => {
  const http = { kind: 'http' as const, url: 'https://example.com', check: { op: 'status' as const, equals: 200 } };
  const manual = { kind: 'manual' as const, instructions: 'Review it.' };
  assert.deepEqual(normalizeVerifier(http, '/tmp'), http);
  assert.deepEqual(normalizeVerifier(manual, '/tmp'), manual);
});

test('runs file evidence and preserves honest manual unknowns', async () => {
  const { configPath } = await fixture();
  const report = await runProofspec(configPath, { generatedAt: '2026-07-17T12:00:00.000Z', runId: 'proof_test' });
  assert.equal(report.runId, 'proof_test');
  assert.equal(report.generatedAt, '2026-07-17T12:00:00.000Z');
  assert.equal(report.claims[0]?.effectiveStatus, 'verified');
  assert.equal(report.claims[1]?.effectiveStatus, 'unknown');
  assert.equal(report.claims[1]?.evidence[0]?.evidenceClass, 'manual_attestation');
  assert.equal(report.summary.gatePassed, true);
  assert.equal(report.summary.strictGatePassed, false);
});

test('verifies the receipt ledger after a run', async () => {
  const { configPath } = await fixture();
  const report = await runProofspec(configPath);
  assert.equal(report.ledger.valid, true);
  assert.equal(report.ledger.receiptsChecked, 3);
  assert.match(report.reportDigest, /^[a-f0-9]{64}$/);
});

test('creates the configured SQLite ledger', async () => {
  const { root, configPath } = await fixture();
  await runProofspec(configPath);
  await access(join(root, '.proofspec/receipts.db'));
});

test('supports a per-run ledger override relative to the config', async () => {
  const { root, configPath } = await fixture();
  const report = await runProofspec(configPath, { ledgerPath: 'alternate/run.db' });
  await access(join(root, 'alternate/run.db'));
  assert.equal(report.ledger.path, './alternate/run.db');
});

test('redacts the project root from report evidence', async () => {
  const { root, configPath } = await fixture();
  const report = await runProofspec(configPath);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(root), false);
  assert.match(serialized, /README\.md/);
});

test('redactRoot recursively handles arrays and objects', () => {
  const root = join('/tmp', 'fixture-root');
  assert.deepEqual(redactRoot({ root, nested: [join(root, 'a.txt'), 'public'] }, root), {
    root: '.', nested: ['./a.txt', 'public'],
  });
});

test('canonicalJson sorts object keys recursively', () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, b: 3 }, list: [{ d: 4, c: 5 }] }), '{"a":{"b":3,"y":2},"list":[{"c":5,"d":4}],"z":1}');
});

test('sha256 is stable across object key order', () => {
  assert.equal(sha256({ a: 1, b: 2 }), sha256({ b: 2, a: 1 }));
  assert.equal(sha256({ a: 1 }).length, 64);
});

test('reports only relative config and ledger paths', async () => {
  const { configPath } = await fixture();
  const report = await runProofspec(configPath);
  assert.equal(isAbsolute(report.configFile), false);
  assert.equal(isAbsolute(report.ledger.path), false);
  assert.equal(report.configFile, 'proofspec.json');
});

test('invalid JSON produces a useful filename error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'proofspec-invalid-'));
  const configPath = join(root, 'broken.json');
  await writeFile(configPath, '{broken');
  await assert.rejects(loadProofspec(configPath), /Invalid JSON in broken\.json/);
});

test('the report digest covers claim evidence', async () => {
  const { configPath } = await fixture();
  const report = await runProofspec(configPath, { generatedAt: '2026-07-17T12:00:00.000Z', runId: 'fixed' });
  const withoutDigest = { ...report };
  delete (withoutDigest as Partial<typeof report>).reportDigest;
  assert.equal(report.reportDigest, sha256(withoutDigest));
});

test('the bundled example runs with a passing default gate', async () => {
  const example = fileURLToPath(new URL('../../examples/proofspec.json', import.meta.url));
  const report = await runProofspec(example, { ledgerPath: join(tmpdir(), `proofspec-example-${randomUUID()}.db`) });
  assert.equal(report.summary.verified, 3);
  assert.equal(report.summary.unknown, 1);
  assert.equal(report.summary.gatePassed, true);
});
