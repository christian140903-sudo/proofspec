import assert from 'node:assert/strict';
import test from 'node:test';
import { proofspecConfigSchema, verifierSchema } from '../src/schemas.js';

function config(claims: unknown[] = [claim()]) {
  return { schemaVersion: 1, project: { name: 'fixture' }, claims };
}

function claim(overrides: Record<string, unknown> = {}) {
  return {
    id: 'documented',
    statement: 'The project has a README.',
    evidence: [{ id: 'readme', verifier: { kind: 'file', path: 'README.md', check: { op: 'exists' } } }],
    ...overrides,
  };
}

test('accepts a minimal specification', () => {
  assert.equal(proofspecConfigSchema.parse(config()).claims.length, 1);
});

test('accepts every severity', () => {
  for (const severity of ['error', 'warning', 'info']) {
    assert.equal(proofspecConfigSchema.safeParse(config([claim({ severity })])).success, true);
  }
});

test('accepts all evidence policies', () => {
  for (const policy of [{ mode: 'all' }, { mode: 'any' }, { mode: 'at_least', count: 1 }]) {
    assert.equal(proofspecConfigSchema.safeParse(config([claim({ policy })])).success, true);
  }
});

test('accepts an empty evidence list as an explicit unsupported claim', () => {
  assert.equal(proofspecConfigSchema.safeParse(config([claim({ evidence: [] })])).success, true);
});

test('rejects an unknown top-level field', () => {
  assert.equal(proofspecConfigSchema.safeParse({ ...config(), surprise: true }).success, false);
});

test('rejects malformed claim IDs', () => {
  for (const id of ['Uppercase', '1first', 'space here', 'a'.repeat(65)]) {
    assert.equal(proofspecConfigSchema.safeParse(config([claim({ id })])).success, false, id);
  }
});

test('rejects duplicate claim IDs', () => {
  const parsed = proofspecConfigSchema.safeParse(config([claim(), claim()]));
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.match(parsed.error.message, /Duplicate claim id/);
});

test('rejects duplicate evidence IDs inside one claim', () => {
  const evidence = { id: 'same', verifier: { kind: 'manual', instructions: 'Review this claim.' } };
  const parsed = proofspecConfigSchema.safeParse(config([claim({ evidence: [evidence, evidence] })]));
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.match(parsed.error.message, /Duplicate evidence id/);
});

test('allows the same evidence ID in different claims', () => {
  const second = claim({ id: 'second-claim' });
  assert.equal(proofspecConfigSchema.safeParse(config([claim(), second])).success, true);
});

test('rejects unknown claim dependencies', () => {
  const parsed = proofspecConfigSchema.safeParse(config([claim({ dependsOn: ['missing'] })]));
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.match(parsed.error.message, /Unknown dependency/);
});

test('rejects direct self-dependencies', () => {
  const parsed = proofspecConfigSchema.safeParse(config([claim({ dependsOn: ['documented'] })]));
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.match(parsed.error.message, /cannot depend on itself/);
});

test('rejects dependency cycles', () => {
  const parsed = proofspecConfigSchema.safeParse(config([
    claim({ id: 'alpha', dependsOn: ['beta'] }),
    claim({ id: 'beta', dependsOn: ['gamma'] }),
    claim({ id: 'gamma', dependsOn: ['alpha'] }),
  ]));
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.match(parsed.error.message, /cycle detected/);
});

test('accepts an acyclic dependency graph', () => {
  assert.equal(proofspecConfigSchema.safeParse(config([
    claim({ id: 'root' }),
    claim({ id: 'middle', dependsOn: ['root'] }),
    claim({ id: 'leaf', dependsOn: ['middle', 'root'] }),
  ])).success, true);
});

test('rejects an impossible at_least threshold', () => {
  const parsed = proofspecConfigSchema.safeParse(config([claim({ policy: { mode: 'at_least', count: 2 } })]));
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.match(parsed.error.message, /requires 2 evidence checks/);
});

test('validates file verifiers', () => {
  for (const check of [
    { op: 'exists' }, { op: 'not_exists' }, { op: 'sha256', equals: 'a'.repeat(64) },
    { op: 'contains', text: 'needle' }, { op: 'json_equals', pointer: '/name', value: 'fixture' },
    { op: 'min_size', bytes: 1 }, { op: 'max_size', bytes: 100 },
  ]) assert.equal(verifierSchema.safeParse({ kind: 'file', path: 'x', check }).success, true, check.op);
});

test('validates HTTP verifiers and timeout bounds', () => {
  assert.equal(verifierSchema.safeParse({ kind: 'http', url: 'https://example.com', timeoutMs: 100, check: { op: 'status', equals: 200 } }).success, true);
  assert.equal(verifierSchema.safeParse({ kind: 'http', url: 'https://example.com', timeoutMs: 99, check: { op: 'status', equals: 200 } }).success, false);
});

test('validates Git verifiers', () => {
  assert.equal(verifierSchema.safeParse({ kind: 'git', cwd: '.', check: { op: 'clean', equals: true } }).success, true);
  assert.equal(verifierSchema.safeParse({ kind: 'git', cwd: '.', check: { op: 'remote_contains', commit: 'HEAD', remote: 'origin;bad' } }).success, false);
});

test('validates npm package names', () => {
  assert.equal(verifierSchema.safeParse({ kind: 'npm', package: '@scope/name', check: { op: 'version_exists', version: '1.0.0' } }).success, true);
  assert.equal(verifierSchema.safeParse({ kind: 'npm', package: '../bad', check: { op: 'version_exists', version: '1.0.0' } }).success, false);
});

test('manual verifiers require meaningful instructions', () => {
  assert.equal(verifierSchema.safeParse({ kind: 'manual', instructions: 'Review it.' }).success, true);
  assert.equal(verifierSchema.safeParse({ kind: 'manual', instructions: '' }).success, false);
});
