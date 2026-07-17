import { readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import type { Verifier } from 'postcondition-mcp';
import { proofspecConfigSchema } from './schemas.js';
import type { LoadedProofspec, ProofspecConfig } from './types.js';

export async function loadProofspec(inputPath = 'proofspec.json'): Promise<LoadedProofspec> {
  const configPath = resolve(inputPath);
  const raw = await readFile(configPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${basename(configPath)}: ${error instanceof Error ? error.message : 'parse error'}`);
  }
  const config = proofspecConfigSchema.parse(parsed) as ProofspecConfig;
  const rootDir = dirname(configPath);
  return {
    config: normalizeConfigPaths(config, rootDir),
    configPath,
    rootDir,
    ledgerPath: resolvePath(rootDir, config.defaults?.ledgerPath ?? '.proofspec/ledger.db'),
    reportDir: resolvePath(rootDir, config.defaults?.reportDir ?? '.proofspec'),
  };
}

export function normalizeConfigPaths(config: ProofspecConfig, rootDir: string): ProofspecConfig {
  return {
    ...config,
    claims: config.claims.map((claim) => ({
      ...claim,
      evidence: claim.evidence.map((item) => ({
        ...item,
        verifier: normalizeVerifier(item.verifier, rootDir),
      })),
    })),
  };
}

export function normalizeVerifier(verifier: Verifier, rootDir: string): Verifier {
  if (verifier.kind === 'file') return { ...verifier, path: resolvePath(rootDir, verifier.path) };
  if (verifier.kind === 'git') return { ...verifier, cwd: resolvePath(rootDir, verifier.cwd) };
  return verifier;
}

function resolvePath(rootDir: string, value: string): string {
  return isAbsolute(value) ? value : resolve(rootDir, value);
}
