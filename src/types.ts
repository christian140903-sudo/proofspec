import type { EvidenceClass, Verifier } from 'postcondition-mcp';

export type ClaimSeverity = 'error' | 'warning' | 'info';
export type ClaimStatus = 'verified' | 'failed' | 'unknown' | 'unsupported' | 'blocked';
export type EvidenceVerdict = 'satisfied' | 'violated' | 'unknown';

export type EvidencePolicy =
  | { mode: 'all' }
  | { mode: 'any' }
  | { mode: 'at_least'; count: number };

export interface EvidenceSpec {
  id: string;
  description?: string;
  verifier: Verifier;
}

export interface ClaimSpec {
  id: string;
  statement: string;
  severity?: ClaimSeverity;
  policy?: EvidencePolicy;
  evidence: EvidenceSpec[];
  dependsOn?: string[];
  limitations?: string[];
  tags?: string[];
}

export interface ProofspecConfig {
  $schema?: string;
  schemaVersion: 1;
  project: {
    name: string;
    repository?: string;
    homepage?: string;
  };
  defaults?: {
    ledgerPath?: string;
    reportDir?: string;
  };
  claims: ClaimSpec[];
}

export interface LoadedProofspec {
  config: ProofspecConfig;
  configPath: string;
  rootDir: string;
  ledgerPath: string;
  reportDir: string;
}

export interface EvidenceResult {
  id: string;
  description?: string;
  verdict: EvidenceVerdict;
  evidenceClass: EvidenceClass;
  summary: string;
  evidence: Record<string, unknown>;
  contractId: string;
  observationId: string;
  evidenceHash: string;
  previousHash: string | null;
  receiptHash: string;
  observedAt: string;
}

export interface ClaimResult {
  id: string;
  statement: string;
  severity: ClaimSeverity;
  policy: EvidencePolicy;
  directStatus: ClaimStatus;
  effectiveStatus: ClaimStatus;
  evidence: EvidenceResult[];
  dependsOn: string[];
  blockedBy: string[];
  limitations: string[];
  tags: string[];
}

export interface ProofspecSummary {
  total: number;
  verified: number;
  failed: number;
  unknown: number;
  unsupported: number;
  blocked: number;
  evidenceChecks: number;
  satisfiedEvidence: number;
  gatePassed: boolean;
  strictGatePassed: boolean;
}

export interface ProofspecReport {
  reportVersion: 1;
  runId: string;
  generatedAt: string;
  project: ProofspecConfig['project'];
  configFile: string;
  ledger: {
    path: string;
    valid: boolean;
    receiptsChecked: number;
  };
  summary: ProofspecSummary;
  claims: ClaimResult[];
  reportDigest: string;
}

export interface RunProofspecOptions {
  ledgerPath?: string;
  generatedAt?: string;
  runId?: string;
}

export type ReportFormat = 'json' | 'markdown' | 'html' | 'mermaid' | 'sarif';
