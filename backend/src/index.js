import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { buildVerifier } from './boot.js';
import { warnUnboundOwners } from './services/identity.js';

// Fail closed: a missing or unsafe auth configuration stops the process here,
// before it listens. There is no mode in which writes are open.
const config = loadConfig(process.env);
const verifyAccess = buildVerifier(config);

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
const app = createApp({ prisma, config, verifyAccess });

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} (auth mode: ${config.authMode})`);
  warnUnboundOwners(prisma).catch((e) => console.warn(`auth.boot unbound-owner check failed: ${e.message}`));
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
