import { randomUUID } from 'node:crypto';
import { basename, isAbsolute, resolve } from 'node:path';
import { PostconditionRuntime } from 'postcondition-mcp';
import { redactRoot, sha256 } from './canonical.js';
import { loadProofspec } from './config.js';
import { evaluateClaims, summarizeClaims } from './evaluate.js';
import type { EvidenceResult, ProofspecReport, RunProofspecOptions } from './types.js';

export async function runProofspec(configPath = 'proofspec.json', options: RunProofspecOptions = {}): Promise<ProofspecReport> {
  const loaded = await loadProofspec(configPath);
  const ledgerPath = options.ledgerPath
    ? (isAbsolute(options.ledgerPath) ? options.ledgerPath : resolve(loaded.rootDir, options.ledgerPath))
    : loaded.ledgerPath;
  const runtime = new PostconditionRuntime({ dbPath: ledgerPath });
  const evidenceByClaim = new Map<string, EvidenceResult[]>();
  let ledger = { valid: false, checked: 0, firstInvalidId: null as string | null };

  try {
    for (const claim of loaded.config.claims) {
      const results: EvidenceResult[] = [];
      for (const evidence of claim.evidence) {
        const contract = runtime.define({
          statement: claim.statement,
          subject: `proofspec:${claim.id}/${evidence.id}`,
          verifier: evidence.verifier,
          metadata: {
            proofspecClaim: claim.id,
            proofspecEvidence: evidence.id,
            severity: claim.severity ?? 'error',
          },
        });
        const observation = await runtime.check(contract.id);
        results.push({
          id: evidence.id,
          ...(evidence.description === undefined ? {} : { description: evidence.description }),
          verdict: observation.verdict,
          evidenceClass: observation.evidenceClass,
          summary: observation.summary,
          evidence: redactRoot(observation.evidence, loaded.rootDir) as Record<string, unknown>,
          contractId: contract.id,
          observationId: observation.id,
          evidenceHash: observation.evidenceHash,
          previousHash: observation.previousHash,
          receiptHash: observation.receiptHash,
          observedAt: observation.observedAt,
        });
      }
      evidenceByClaim.set(claim.id, results);
    }
    ledger = runtime.verifyLedger();
  } finally {
    runtime.close();
  }

  const claims = evaluateClaims(loaded.config, evidenceByClaim);
  const base = {
    reportVersion: 1 as const,
    runId: options.runId ?? `proof_${randomUUID()}`,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    project: loaded.config.project,
    configFile: basename(loaded.configPath),
    ledger: {
      path: redactRoot(ledgerPath, loaded.rootDir) as string,
      valid: ledger.valid,
      receiptsChecked: ledger.checked,
    },
    summary: summarizeClaims(claims),
    claims,
  };
  return { ...base, reportDigest: sha256(base) };
}
