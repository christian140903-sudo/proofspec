import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadProofspec } from './config.js';
import { renderReport } from './render.js';
import { runProofspec } from './runtime.js';

export const PROOFSPEC_VERSION = '0.1.0';

const formatSchema = z.enum(['json', 'markdown', 'html', 'mermaid', 'sarif']);
const configInput = { config: z.string().min(1).optional() };

function jsonResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function defaultConfigPath(): string {
  return process.env.PROOFSPEC_CONFIG ?? 'proofspec.json';
}

export function createProofspecServer(): McpServer {
  const server = new McpServer(
    { name: 'proofspec', version: PROOFSPEC_VERSION },
    {
      instructions:
        'Proofspec evaluates narrow software claims against constrained evidence. ' +
        'Use proofspec_validate before a run, proofspec_check to create fresh receipts, and ' +
        'proofspec_explain for one claim. Treat unknown, unsupported, blocked, and failed as unverified. ' +
        'A satisfied verifier proves only the configured observation, not the broader quality of a project.',
    },
  );

  server.registerTool(
    'proofspec_validate',
    {
      title: 'Validate Proofspec',
      description: 'Validate a Proofspec configuration, including unique IDs and an acyclic claim graph, without checking evidence.',
      inputSchema: z.object(configInput),
    },
    async ({ config }) => {
      const loaded = await loadProofspec(config ?? defaultConfigPath());
      return jsonResult({ valid: true, project: loaded.config.project, claims: loaded.config.claims.length, configFile: loaded.configPath });
    },
  );

  server.registerTool(
    'proofspec_check',
    {
      title: 'Check Proofspec',
      description: 'Evaluate every claim, append independently labelled evidence receipts, verify the ledger, and return the complete report.',
      inputSchema: z.object(configInput),
    },
    async ({ config }) => jsonResult(await runProofspec(config ?? defaultConfigPath())),
  );

  server.registerTool(
    'proofspec_explain',
    {
      title: 'Explain Claim',
      description: 'Evaluate the specification and return one claim with its policy, dependencies, limitations, evidence, and receipts.',
      inputSchema: z.object({ ...configInput, claim: z.string().min(1) }),
    },
    async ({ config, claim }) => {
      const report = await runProofspec(config ?? defaultConfigPath());
      const result = report.claims.find((item) => item.id === claim);
      return jsonResult(result ?? { error: 'not_found', claim });
    },
  );

  server.registerTool(
    'proofspec_render',
    {
      title: 'Render Proofspec Report',
      description: 'Evaluate a specification and render JSON, Markdown, standalone HTML, Mermaid, or SARIF.',
      inputSchema: z.object({ ...configInput, format: formatSchema.default('markdown') }),
    },
    async ({ config, format }) => {
      const report = await runProofspec(config ?? defaultConfigPath());
      return { content: [{ type: 'text' as const, text: renderReport(report, format) }] };
    },
  );

  const schemaText = readFileSync(new URL('../../proofspec.schema.json', import.meta.url), 'utf8');
  const exampleText = readFileSync(new URL('../../examples/proofspec.json', import.meta.url), 'utf8');
  server.registerResource(
    'schema',
    'proofspec://schema',
    { description: 'Proofspec 1 JSON Schema', mimeType: 'application/schema+json' },
    async () => ({ contents: [{ uri: 'proofspec://schema', mimeType: 'application/schema+json', text: schemaText }] }),
  );
  server.registerResource(
    'example',
    'proofspec://example',
    { description: 'A complete executable claim specification', mimeType: 'application/json' },
    async () => ({ contents: [{ uri: 'proofspec://example', mimeType: 'application/json', text: exampleText }] }),
  );

  server.registerPrompt(
    'audit-public-claims',
    { description: 'Convert public software claims into narrow, executable evidence contracts' },
    async () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text:
            'Audit the project’s README, package metadata, release notes, and product page. ' +
            'Turn each material claim into the narrowest independently observable Proofspec verifier. ' +
            'Add explicit limitations, model dependencies between claims, keep manual evidence unknown, ' +
            'then run proofspec_check. Never broaden what a satisfied observation proves.',
        },
      }],
    }),
  );

  return server;
}
