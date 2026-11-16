import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { buildJwks, buildVerifier, buildGatewayVerifier } from './boot.js';
import { startMcp } from './mcp/http.js';
import { warnUnboundOwners } from './services/identity.js';

// Fail closed: a missing or unsafe auth configuration stops the process here,
// before it listens. There is no mode in which writes are open.
const config = loadConfig(process.env);
// One JWKS for both verifiers (web audience and heitan's MCP audience).
const jwks = config.authMode === 'access' ? buildJwks(config) : null;
const verifyAccess = buildVerifier(config, jwks);
const verifyGateway = buildGatewayVerifier(config, jwks);

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
const app = createApp({ prisma, config, verifyAccess });

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} (auth mode: ${config.authMode})`);
  warnUnboundOwners(prisma).catch((e) => console.warn(`auth.boot unbound-owner check failed: ${e.message}`));
});

// The MCP listener (COOK-49): its own internal port, off unless configured.
const mcp = await startMcp(config, { prisma, verifyGateway });

// Graceful shutdown
process.on('SIGINT', async () => {
  await mcp?.close();
  await prisma.$disconnect();
  process.exit(0);
});
