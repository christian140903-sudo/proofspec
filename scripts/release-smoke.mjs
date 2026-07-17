import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { encoding: 'utf8', ...options });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const scratch = await mkdtemp(join(tmpdir(), 'proofspec-pack-'));
let tarball;

try {
  const packed = await run('npm', ['pack', '--json', '--ignore-scripts'], { cwd: projectRoot });
  const metadata = JSON.parse(packed.stdout);
  assert.equal(metadata.length, 1);
  tarball = join(projectRoot, metadata[0].filename);
  const names = metadata[0].files.map((file) => file.path);
  for (const required of [
    'dist/src/index.js',
    'dist/src/index.d.ts',
    'README.md',
    'proofspec.schema.json',
    'examples/proofspec.json',
    'server.json',
  ]) assert.ok(names.includes(required), `packed artifact is missing ${required}`);

  await writeFile(join(scratch, 'package.json'), '{"name":"proofspec-smoke","private":true,"type":"module"}\n');
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], { cwd: scratch });
  const cli = join(scratch, 'node_modules', '.bin', 'proofspec');
  const help = await run(cli, ['--help'], { cwd: scratch });
  assert.match(help.stdout, /executable evidence contracts/i);

  const imported = await run(process.execPath, [
    '--input-type=module',
    '--eval',
    "import { PROOFSPEC_VERSION, evaluateDirectStatus } from 'proofspec'; if (PROOFSPEC_VERSION !== '0.1.0' || evaluateDirectStatus({mode:'all'}, []) !== 'unsupported') process.exit(1);",
  ], { cwd: scratch });
  assert.equal(imported.stderr, '');

  const installed = JSON.parse(await readFile(join(scratch, 'node_modules', 'proofspec', 'package.json'), 'utf8'));
  assert.equal(installed.version, '0.1.0');
  console.log(`Release smoke passed: ${basename(tarball)} (${names.length} files)`);
} finally {
  if (tarball) await rm(tarball, { force: true });
  await rm(scratch, { recursive: true, force: true });
}
