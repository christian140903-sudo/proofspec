import type {
  ClaimResult,
  ClaimSpec,
  ClaimStatus,
  EvidencePolicy,
  EvidenceResult,
  ProofspecConfig,
  ProofspecSummary,
} from './types.js';

export function evaluateDirectStatus(policy: EvidencePolicy, evidence: EvidenceResult[]): ClaimStatus {
  if (evidence.length === 0) return 'unsupported';
  const satisfied = evidence.filter((item) => item.verdict === 'satisfied').length;
  const violated = evidence.filter((item) => item.verdict === 'violated').length;
  const unknown = evidence.length - satisfied - violated;

  if (policy.mode === 'all') {
    if (violated > 0) return 'failed';
    return unknown > 0 ? 'unknown' : 'verified';
  }
  if (policy.mode === 'any') {
    if (satisfied > 0) return 'verified';
    return unknown > 0 ? 'unknown' : 'failed';
  }
  if (satisfied >= policy.count) return 'verified';
  return satisfied + unknown >= policy.count ? 'unknown' : 'failed';
}

export function evaluateClaims(config: ProofspecConfig, evidenceByClaim: Map<string, EvidenceResult[]>): ClaimResult[] {
  const results = config.claims.map((claim) => directResult(claim, evidenceByClaim.get(claim.id) ?? []));
  const byId = new Map(results.map((result) => [result.id, result]));
  const resolved = new Set<string>();

  const resolveClaim = (id: string): ClaimResult => {
    const result = byId.get(id);
    if (!result) throw new Error(`Unknown claim during evaluation: ${id}`);
    if (resolved.has(id)) return result;
    const blockedBy = result.dependsOn.filter((dependency) => resolveClaim(dependency).effectiveStatus !== 'verified');
    result.blockedBy = blockedBy;
    result.effectiveStatus = result.directStatus === 'verified' && blockedBy.length > 0 ? 'blocked' : result.directStatus;
    resolved.add(id);
    return result;
  };

  for (const result of results) resolveClaim(result.id);
  return results;
}

export function summarizeClaims(claims: ClaimResult[]): ProofspecSummary {
  const count = (status: ClaimStatus) => claims.filter((claim) => claim.effectiveStatus === status).length;
  const gatePassed = claims.filter((claim) => claim.severity === 'error').every((claim) => claim.effectiveStatus === 'verified');
  return {
    total: claims.length,
    verified: count('verified'),
    failed: count('failed'),
    unknown: count('unknown'),
    unsupported: count('unsupported'),
    blocked: count('blocked'),
    evidenceChecks: claims.reduce((total, claim) => total + claim.evidence.length, 0),
    satisfiedEvidence: claims.flatMap((claim) => claim.evidence).filter((item) => item.verdict === 'satisfied').length,
    gatePassed,
    strictGatePassed: claims.every((claim) => claim.effectiveStatus === 'verified'),
  };
}

function directResult(claim: ClaimSpec, evidence: EvidenceResult[]): ClaimResult {
  const policy = claim.policy ?? { mode: 'all' as const };
  const directStatus = evaluateDirectStatus(policy, evidence);
  return {
    id: claim.id,
    statement: claim.statement,
    severity: claim.severity ?? 'error',
    policy,
    directStatus,
    effectiveStatus: directStatus,
    evidence,
    dependsOn: claim.dependsOn ?? [],
    blockedBy: [],
    limitations: claim.limitations ?? [],
    tags: claim.tags ?? [],
  };
}
