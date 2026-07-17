import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createProofspecServer } from './server.js';

export async function startServer(): Promise<void> {
  const server = createProofspecServer();
  const transport = new StdioServerTransport();
  try {
    await server.connect(transport);
  } catch (error) {
    console.error('[proofspec] MCP server failed:', error);
    process.exitCode = 1;
  }
}
