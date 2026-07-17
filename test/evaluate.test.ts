import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateClaims, evaluateDirectStatus, summarizeClaims } from '../src/evaluate.js';
import type { EvidenceResult, EvidenceVerdict, ProofspecConfig } from '../src/types.js';

function evidence(id: string, verdict: EvidenceVerdict): EvidenceResult {
  return {
    id,
    verdict,
    evidenceClass: 'configured_verifier',
    summary: verdict,
    evidence: {},
    contractId: `contract-${id}`,
    observationId: `observation-${id}`,
    evidenceHash: 'a'.repeat(64),
    previousHash: null,
    receiptHash: 'b'.repeat(64),
    observedAt: '2026-07-17T00:00:00.000Z',
  };
}

test('empty evidence is unsupported for every policy', () => {
  assert.equal(evaluateDirectStatus({ mode: 'all' }, []), 'unsupported');
  assert.equal(evaluateDirectStatus({ mode: 'any' }, []), 'unsupported');
  assert.equal(evaluateDirectStatus({ mode: 'at_least', count: 1 }, []), 'unsupported');
});

test('all verifies when every observation is satisfied', () => {
  assert.equal(evaluateDirectStatus({ mode: 'all' }, [evidence('a', 'satisfied'), evidence('b', 'satisfied')]), 'verified');
});

test('all fails when any observation is violated', () => {
  assert.equal(evaluateDirectStatus({ mode: 'all' }, [evidence('a', 'satisfied'), evidence('b', 'violated'), evidence('c', 'unknown')]), 'failed');
});

test('all remains unknown without a violation', () => {
  assert.equal(evaluateDirectStatus({ mode: 'all' }, [evidence('a', 'satisfied'), evidence('b', 'unknown')]), 'unknown');
});

test('any verifies when one observation is satisfied', () => {
  assert.equal(evaluateDirectStatus({ mode: 'any' }, [evidence('a', 'violated'), evidence('b', 'satisfied')]), 'verified');
});

test('any fails when every observation is violated', () => {
  assert.equal(evaluateDirectStatus({ mode: 'any' }, [evidence('a', 'violated'), evidence('b', 'violated')]), 'failed');
});

test('any remains unknown when an unknown observation could satisfy it', () => {
  assert.equal(evaluateDirectStatus({ mode: 'any' }, [evidence('a', 'violated'), evidence('b', 'unknown')]), 'unknown');
});

test('at_least verifies at the threshold', () => {
  assert.equal(evaluateDirectStatus({ mode: 'at_least', count: 2 }, [evidence('a', 'satisfied'), evidence('b', 'satisfied'), evidence('c', 'violated')]), 'verified');
});

test('at_least remains unknown when unknowns could reach the threshold', () => {
  assert.equal(evaluateDirectStatus({ mode: 'at_least', count: 2 }, [evidence('a', 'satisfied'), evidence('b', 'unknown'), evidence('c', 'violated')]), 'unknown');
});

test('at_least fails when the threshold is unreachable', () => {
  assert.equal(evaluateDirectStatus({ mode: 'at_least', count: 2 }, [evidence('a', 'satisfied'), evidence('b', 'violated'), evidence('c', 'violated')]), 'failed');
});

test('dependencies block a directly verified claim', () => {
  const config: ProofspecConfig = {
    schemaVersion: 1,
    project: { name: 'fixture' },
    claims: [
      { id: 'root', statement: 'Root evidence is available.', evidence: [{ id: 'root-e', verifier: { kind: 'manual', instructions: 'Review root.' } }] },
      { id: 'leaf', statement: 'Leaf evidence is available.', dependsOn: ['root'], evidence: [{ id: 'leaf-e', verifier: { kind: 'manual', instructions: 'Review leaf.' } }] },
    ],
  };
  const results = evaluateClaims(config, new Map([
    ['root', [evidence('root-e', 'violated')]],
    ['leaf', [evidence('leaf-e', 'satisfied')]],
  ]));
  assert.equal(results[0]?.effectiveStatus, 'failed');
  assert.equal(results[1]?.directStatus, 'verified');
  assert.equal(results[1]?.effectiveStatus, 'blocked');
  assert.deepEqual(results[1]?.blockedBy, ['root']);
});

test('dependency blocking cascades through the graph', () => {
  const config: ProofspecConfig = {
    schemaVersion: 1,
    project: { name: 'fixture' },
    claims: [
      { id: 'root', statement: 'Root claim has evidence.', evidence: [] },
      { id: 'middle', statement: 'Middle claim has evidence.', dependsOn: ['root'], evidence: [] },
      { id: 'leaf', statement: 'Leaf claim has evidence.', dependsOn: ['middle'], evidence: [] },
    ],
  };
  const satisfied = (id: string) => [evidence(id, 'satisfied')];
  const results = evaluateClaims(config, new Map([['root', [evidence('root', 'unknown')]], ['middle', satisfied('middle')], ['leaf', satisfied('leaf')]]));
  assert.deepEqual(results.map((item) => item.effectiveStatus), ['unknown', 'blocked', 'blocked']);
});

test('default gate ignores non-verified warning and info claims', () => {
  const claims = [
    { id: 'required', statement: 'Required claim.', severity: 'error' as const, policy: { mode: 'all' as const }, directStatus: 'verified' as const, effectiveStatus: 'verified' as const, evidence: [evidence('a', 'satisfied')], dependsOn: [], blockedBy: [], limitations: [], tags: [] },
    { id: 'review', statement: 'Review claim.', severity: 'info' as const, policy: { mode: 'all' as const }, directStatus: 'unknown' as const, effectiveStatus: 'unknown' as const, evidence: [evidence('b', 'unknown')], dependsOn: [], blockedBy: [], limitations: [], tags: [] },
  ];
  const summary = summarizeClaims(claims);
  assert.equal(summary.gatePassed, true);
  assert.equal(summary.strictGatePassed, false);
  assert.equal(summary.satisfiedEvidence, 1);
});

test('default gate fails for blocked error claims', () => {
  const claims = [{ id: 'required', statement: 'Required claim.', severity: 'error' as const, policy: { mode: 'all' as const }, directStatus: 'verified' as const, effectiveStatus: 'blocked' as const, evidence: [], dependsOn: ['root'], blockedBy: ['root'], limitations: [], tags: [] }];
  assert.equal(summarizeClaims(claims).gatePassed, false);
});
