import { access, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { loadProofspec } from './config.js';
import { renderReport, writeReports } from './render.js';
import { runProofspec } from './runtime.js';
import type { ReportFormat } from './types.js';

const FORMATS = new Set<ReportFormat>(['json', 'markdown', 'html', 'mermaid', 'sarif']);

export async function runCli(args: string[]): Promise<number> {
  const command = args[0] ?? 'help';
  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(usage());
    return 0;
  }
  if (command === 'init') return initCommand(args.slice(1));
  if (command === 'validate') return validateCommand(args.slice(1));
  if (command === 'check') return checkCommand(args.slice(1));
  if (command === 'explain') return explainCommand(args.slice(1));
  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

async function initCommand(args: string[]): Promise<number> {
  const target = resolve(firstPositional(args) ?? 'proofspec.json');
  const force = args.includes('--force');
  if (!force && await exists(target)) throw new Error(`${target} already exists. Use --force to replace it.`);
  await writeFile(target, `${JSON.stringify(sampleConfig(), null, 2)}\n`, 'utf8');
  console.log(`Created ${target}`);
  return 0;
}

async function validateCommand(args: string[]): Promise<number> {
  const loaded = await loadProofspec(firstPositional(args) ?? 'proofspec.json');
  console.log(JSON.stringify({ valid: true, project: loaded.config.project.name, claims: loaded.config.claims.length, config: loaded.configPath }, null, 2));
  return 0;
}

async function checkCommand(args: string[]): Promise<number> {
  const configPath = firstPositional(args) ?? 'proofspec.json';
  const strict = args.includes('--strict');
  const json = args.includes('--json');
  const noWrite = args.includes('--no-write');
  const loaded = await loadProofspec(configPath);
  const requestedOutput = optionValue(args, '--out');
  const outputDir = requestedOutput
    ? (isAbsolute(requestedOutput) ? requestedOutput : resolve(loaded.rootDir, requestedOutput))
    : loaded.reportDir;
  const formats = parseFormats(optionValue(args, '--formats'));
  const report = await runProofspec(configPath);
  if (!noWrite) await writeReports(report, outputDir, formats);
  if (json) console.log(JSON.stringify(report, null, 2));
  else console.log(summaryText(report, noWrite ? [] : formats.map((format) => `${outputDir}/proofspec-report.${extension(format)}`)));
  return (strict ? report.summary.strictGatePassed : report.summary.gatePassed) ? 0 : 1;
}

async function explainCommand(args: string[]): Promise<number> {
  const claimId = firstPositional(args);
  if (!claimId) throw new Error('Usage: proofspec explain <claim-id> [config] [--json]');
  const remaining = args.filter((arg, index) => index !== args.indexOf(claimId));
  const configPath = firstPositional(remaining) ?? 'proofspec.json';
  const report = await runProofspec(configPath);
  const claim = report.claims.find((item) => item.id === claimId);
  if (!claim) throw new Error(`Unknown claim: ${claimId}`);
  const singleClaimReport = { ...report, claims: [claim], summary: summarizeSingleClaim(claim) };
  console.log(args.includes('--json') ? JSON.stringify(claim, null, 2) : renderReport(singleClaimReport, 'markdown'));
  return claim.effectiveStatus === 'verified' ? 0 : 1;
}

function summarizeSingleClaim(claim: Awaited<ReturnType<typeof runProofspec>>['claims'][number]) {
  const status = claim.effectiveStatus;
  return {
    total: 1,
    verified: status === 'verified' ? 1 : 0,
    failed: status === 'failed' ? 1 : 0,
    unknown: status === 'unknown' ? 1 : 0,
    unsupported: status === 'unsupported' ? 1 : 0,
    blocked: status === 'blocked' ? 1 : 0,
    evidenceChecks: claim.evidence.length,
    satisfiedEvidence: claim.evidence.filter((item) => item.verdict === 'satisfied').length,
    gatePassed: claim.severity !== 'error' || status === 'verified',
    strictGatePassed: status === 'verified',
  };
}

function parseFormats(raw: string | undefined): ReportFormat[] {
  if (!raw) return ['json', 'markdown', 'html', 'mermaid', 'sarif'];
  const formats = raw.split(',').map((item) => item.trim()).filter(Boolean);
  for (const format of formats) if (!FORMATS.has(format as ReportFormat)) throw new Error(`Unknown report format: ${format}`);
  if (!formats.length) throw new Error('At least one report format is required.');
  return formats as ReportFormat[];
}

function firstPositional(args: string[]): string | undefined {
  const consumed = new Set<number>();
  for (const option of ['--out', '--formats']) {
    const index = args.indexOf(option);
    if (index >= 0) { consumed.add(index); consumed.add(index + 1); }
  }
  return args.find((arg, index) => !consumed.has(index) && !arg.startsWith('-'));
}

function optionValue(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`${option} requires a value.`);
  return value;
}

function extension(format: ReportFormat): string {
  return ({ json: 'json', markdown: 'md', html: 'html', mermaid: 'mmd', sarif: 'sarif' })[format];
}

function summaryText(report: Awaited<ReturnType<typeof runProofspec>>, paths: string[]): string {
  return [
    `Proofspec ${report.summary.gatePassed ? 'PASS' : 'FAIL'} — ${report.project.name}`,
    `${report.summary.verified}/${report.summary.total} verified · ${report.summary.failed} failed · ${report.summary.unknown} unknown · ${report.summary.unsupported} unsupported · ${report.summary.blocked} blocked`,
    `Evidence: ${report.summary.satisfiedEvidence}/${report.summary.evidenceChecks} satisfied · ledger ${report.ledger.valid ? 'valid' : 'invalid'} (${report.ledger.receiptsChecked} receipts)`,
    ...(paths.length ? [`Reports: ${paths.join(', ')}`] : []),
  ].join('\n');
}

function sampleConfig() {
  return {
    $schema: 'https://raw.githubusercontent.com/christian140903-sudo/proofspec/main/proofspec.schema.json',
    schemaVersion: 1,
    project: { name: 'my-project' },
    defaults: { ledgerPath: '.proofspec/ledger.db', reportDir: '.proofspec' },
    claims: [{
      id: 'readme-exists',
      statement: 'The repository includes public documentation.',
      severity: 'error',
      policy: { mode: 'all' },
      evidence: [{ id: 'readme', verifier: { kind: 'file', path: 'README.md', check: { op: 'exists' } } }],
      limitations: ['File existence does not establish documentation quality.'],
    }],
  };
}

async function exists(path: string): Promise<boolean> {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

function usage(): string {
  return `Proofspec 0.1.0 — executable evidence contracts for software claims

Usage:
  proofspec init [file] [--force]
  proofspec validate [config]
  proofspec check [config] [--strict] [--json] [--no-write]
                  [--out directory] [--formats json,markdown,html,mermaid,sarif]
  proofspec explain <claim-id> [config] [--json]
  proofspec serve

Exit codes: 0 gate passed, 1 claims need attention, 2 configuration/runtime error.`;
}
