/**
 * stdio measurement entrypoint (COOK-49): `node backend/src/mcp/stdio.js`.
 *
 * Serves initialize and tools/list so heitan's measure-bundles and
 * construct-server's mcp-tools-baseline can read the tool list. It imports no
 * Prisma and reads no DATABASE_URL: any tools/call answers an error. stdio is a
 * measurement transport, not a supported surface; the real surface is the HTTP
 * listener behind heitan.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

// stdout carries the protocol: nothing may log there.
const server = createMcpServer({ prisma: null, log: (line) => process.stderr.write(`${line}\n`) });
await server.connect(new StdioServerTransport());
