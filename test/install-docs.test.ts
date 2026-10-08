import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// The unscoped npm name `proofspec` belongs to an unrelated project with its own
// `proofspec` executable. Plain `npx proofspec` downloads and runs that package
// whenever no local install is present (in CI without a prompt). Every runnable
// example must therefore use the local binary with `--no-install` or name this
// project's release artifact with `--package=`.

const root = fileURLToPath(new URL('../../', import.meta.url));
const SKIPPED_DIRS = new Set(['.git', '.proofspec', 'coverage', 'dist', 'node_modules']);
const SAFE_NPX = /--no-install|--package=/;

async function markdownFiles(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) found.push(...await markdownFiles(join(directory, entry.name)));
    } else if (entry.name.endsWith('.md')) {
      found.push(join(directory, entry.name));
    }
  }
  return found;
}

function codeBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map((match) => match[1] ?? '');
}

function unsafeNpxLines(block: string): string[] {
  return block.split('\n').filter((line) => /\bnpx\b/.test(line) && /\bproofspec\b/.test(line) && !SAFE_NPX.test(line));
}

function unsafeMcpServers(block: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch {
    return [];
  }
  const servers = (parsed as { mcpServers?: Record<string, { command?: string; args?: string[] }> }).mcpServers ?? {};
  return Object.entries(servers)
    .filter(([, server]) => server.command === 'npx')
    .filter(([, server]) => (server.args ?? []).some((arg) => /\bproofspec\b/.test(arg)))
    .filter(([, server]) => !(server.args ?? []).some((arg) => SAFE_NPX.test(arg)))
    .map(([name]) => name);
}

function findUnsafeInvocations(markdown: string): string[] {
  return codeBlocks(markdown).flatMap((block) => [
    ...unsafeNpxLines(block),
    ...unsafeMcpServers(block).map((name) => `mcpServers.${name} runs npx without --no-install or --package=`),
  ]);
}

test('the unsafe-invocation detector flags plain npx calls and accepts guarded ones', () => {
  const unsafe = [
    '```bash\nnpx proofspec check\n```\n',
    '```yaml\n- run: npx -y proofspec check proofspec.json\n```\n',
    '```json\n{ "mcpServers": { "p": { "command": "npx", "args": ["-y", "proofspec", "serve"] } } }\n```\n',
    '```json\n{\n  "mcpServers": {\n    "p": {\n      "command": "npx",\n      "args": ["-y", "proofspec", "serve"]\n    }\n  }\n}\n```\n',
  ];
  for (const markdown of unsafe) assert.notDeepEqual(findUnsafeInvocations(markdown), [], markdown);

  const safe = [
    '```bash\nnpx --no-install proofspec check\n```\n',
    '```bash\nnpx --package=https://example.invalid/proofspec-0.1.0.tgz -- proofspec --help\n```\n',
    '```json\n{ "mcpServers": { "p": { "command": "npx", "args": ["--yes", "--package=https://example.invalid/p.tgz", "--", "proofspec", "serve"] } } }\n```\n',
    'Prose may name `npx proofspec` to warn against it.\n',
  ];
  for (const markdown of safe) assert.deepEqual(findUnsafeInvocations(markdown), [], markdown);
});

test('documentation never runs the unrelated npm package through plain npx', async () => {
  const files = await markdownFiles(root);
  assert.ok(files.some((file) => relative(root, file) === 'README.md'), 'README.md was not scanned');
  const findings = [];
  for (const file of files) {
    for (const line of findUnsafeInvocations(await readFile(file, 'utf8'))) {
      findings.push(`${relative(root, file)}: ${line.trim()}`);
    }
  }
  assert.deepEqual(findings, []);
});

test('README warns that the npm package named proofspec is a different project', async () => {
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  assert.match(readme, /The npm package named `proofspec` is not this project\./);
});

test('server.json does not point MCP clients at the unrelated npm package', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'server.json'), 'utf8')) as {
    packages?: Array<{ registryType?: string; identifier?: string }>;
  };
  const foreign = (manifest.packages ?? []).filter((entry) => entry.registryType === 'npm' && entry.identifier === 'proofspec');
  assert.deepEqual(foreign, []);
});
