import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = fileURLToPath(new URL('../src/index.js', import.meta.url));

function run(args: string[], cwd?: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [entry, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('close', (code) => resolvePromise({ code, stdout, stderr }));
  });
}

async function fixture(options: { fail?: boolean; manualSeverity?: 'error' | 'warning' | 'info' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'proofspec-cli-'));
  await writeFile(join(root, 'marker.txt'), 'ready\n');
  const configPath = join(root, 'proofspec.json');
  const claims: unknown[] = [{
    id: 'marker-ready',
    statement: 'The fixture marker is ready.',
    evidence: [{ id: 'marker', verifier: { kind: 'file', path: 'marker.txt', check: { op: 'contains', text: options.fail ? 'missing' : 'ready' } } }],
  }];
  if (options.manualSeverity) claims.push({
    id: 'manual-review',
    statement: 'The fixture received a manual review.',
    severity: options.manualSeverity,
    evidence: [{ id: 'review', verifier: { kind: 'manual', instructions: 'Review the fixture.' } }],
  });
  await writeFile(configPath, JSON.stringify({
    schemaVersion: 1,
    project: { name: 'CLI fixture' },
    defaults: { ledgerPath: '.proofspec/ledger.db', reportDir: '.proofspec/reports' },
    claims,
  }, null, 2));
  return { root, configPath };
}

function cleanEnv(extra: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ ...process.env, ...extra }).filter((item): item is [string, string] => typeof item[1] === 'string'),
  );
}

function toolText(result: unknown): string {
  const content = (result as { content: Array<{ type: string; text?: string }> }).content[0];
  if (!content || content.type !== 'text' || typeof content.text !== 'string') throw new Error('Expected text MCP result.');
  return content.text;
}

test('help documents commands and exit codes', async () => {
  const result = await run(['--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /proofspec check/);
  assert.match(result.stdout, /Exit codes/);
});

test('init writes a valid starter configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'proofspec-init-'));
  const result = await run(['init', 'custom.json'], root);
  assert.equal(result.code, 0);
  const created = JSON.parse(await readFile(join(root, 'custom.json'), 'utf8'));
  assert.equal(created.schemaVersion, 1);
  assert.equal(created.claims[0].id, 'readme-exists');
});

test('init refuses to overwrite without force', async () => {
  const root = await mkdtemp(join(tmpdir(), 'proofspec-init-'));
  await writeFile(join(root, 'proofspec.json'), '{}');
  const result = await run(['init'], root);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /already exists/);
});

test('validate reports project and claim count', async () => {
  const { configPath } = await fixture();
  const result = await run(['validate', configPath]);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.project, 'CLI fixture');
  assert.equal(parsed.claims, 1);
});

test('check emits JSON without writing reports when requested', async () => {
  const { root, configPath } = await fixture();
  const result = await run(['check', configPath, '--json', '--no-write']);
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).summary.gatePassed, true);
  await assert.rejects(access(join(root, '.proofspec/reports/proofspec-report.json')));
});

test('check writes selected reports relative to the config file', async () => {
  const { root, configPath } = await fixture();
  const foreignCwd = await mkdtemp(join(tmpdir(), 'proofspec-foreign-'));
  const result = await run(['check', configPath, '--out', 'artifacts', '--formats', 'json,markdown'], foreignCwd);
  assert.equal(result.code, 0);
  await access(join(root, 'artifacts/proofspec-report.json'));
  await access(join(root, 'artifacts/proofspec-report.md'));
  assert.match(result.stdout, /Proofspec PASS/);
});

test('failed error claims produce exit code 1', async () => {
  const { configPath } = await fixture({ fail: true });
  const result = await run(['check', configPath, '--no-write']);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /Proofspec FAIL/);
});

test('strict mode fails an informational manual unknown', async () => {
  const { configPath } = await fixture({ manualSeverity: 'info' });
  assert.equal((await run(['check', configPath, '--no-write'])).code, 0);
  assert.equal((await run(['check', configPath, '--no-write', '--strict'])).code, 1);
});

test('explain returns only the selected claim', async () => {
  const { configPath } = await fixture({ manualSeverity: 'info' });
  const result = await run(['explain', 'marker-ready', configPath, '--json']);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.id, 'marker-ready');
  assert.equal(parsed.effectiveStatus, 'verified');
});

test('unknown commands produce exit code 2', async () => {
  const result = await run(['definitely-not-a-command']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Unknown command/);
});

test('MCP server exposes tools, resources, prompt, and working checks', async () => {
  const { configPath } = await fixture({ manualSeverity: 'info' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry, 'serve'],
    env: cleanEnv({ PROOFSPEC_CONFIG: configPath }),
  });
  const client = new Client({ name: 'proofspec-tests', version: '1.0.0' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      'proofspec_check', 'proofspec_explain', 'proofspec_render', 'proofspec_validate',
    ]);
    const resources = await client.listResources();
    assert.deepEqual(resources.resources.map((resource) => resource.uri).sort(), ['proofspec://example', 'proofspec://schema']);
    const prompts = await client.listPrompts();
    assert.equal(prompts.prompts[0]?.name, 'audit-public-claims');

    const validated = JSON.parse(toolText(await client.callTool({ name: 'proofspec_validate', arguments: {} })));
    assert.equal(validated.valid, true);
    const checked = JSON.parse(toolText(await client.callTool({ name: 'proofspec_check', arguments: {} })));
    assert.equal(checked.summary.gatePassed, true);
    assert.equal(checked.summary.unknown, 1);
    const explained = JSON.parse(toolText(await client.callTool({ name: 'proofspec_explain', arguments: { claim: 'marker-ready' } })));
    assert.equal(explained.effectiveStatus, 'verified');
    assert.match(toolText(await client.callTool({ name: 'proofspec_render', arguments: { format: 'markdown' } })), /# Proofspec report/);

    const schema = await client.readResource({ uri: 'proofspec://schema' });
    const schemaContent = schema.contents[0];
    if (!schemaContent || !('text' in schemaContent)) throw new Error('Expected schema text resource.');
    assert.equal(JSON.parse(schemaContent.text).title, 'Proofspec');
  } finally {
    await client.close();
  }
});
