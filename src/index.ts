#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from './cli.js';
import { startServer } from './serve.js';

export { canonicalJson, redactRoot, sha256 } from './canonical.js';
export { loadProofspec, normalizeConfigPaths, normalizeVerifier } from './config.js';
export { evaluateClaims, evaluateDirectStatus, summarizeClaims } from './evaluate.js';
export { renderHtml, renderMarkdown, renderMermaid, renderReport, renderSarif, writeReports } from './render.js';
export { runProofspec } from './runtime.js';
export { createProofspecServer, PROOFSPEC_VERSION } from './server.js';
export { proofspecConfigSchema, verifierSchema } from './schemas.js';
export type * from './types.js';

const isMain = process.argv[1] !== undefined &&
  realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
  const command = process.argv[2];
  if (command === 'serve' || (command === undefined && !process.stdin.isTTY)) {
    startServer().catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 2;
    });
  } else {
    runCli(process.argv.slice(2)).then((code) => {
      process.exitCode = code;
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 2;
    });
  }
}
