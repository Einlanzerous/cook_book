import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import recipesRouter from './routes/recipes.js';
import tagsRouter from './routes/tags.js';
import importRouter from './routes/import.js';
import { errorHandler } from './middleware/errorHandler.js';
import { resolveBuildIdentity } from './buildIdentity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Make prisma available to routes
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

// Routes
app.use('/api/recipes', recipesRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/import', importRouter);

// Search endpoint
app.get('/api/search', async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q || q.trim() === '') {
      return res.json([]);
    }

    const searchTerm = q.trim().toLowerCase();

    const recipes = await prisma.recipe.findMany({
      where: {
        OR: [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          { description: { contains: searchTerm, mode: 'insensitive' } },
          { ingredients: { some: { name: { contains: searchTerm, mode: 'insensitive' } } } },
          { tags: { some: { name: { contains: searchTerm, mode: 'insensitive' } } } }
        ]
      },
      include: {
        ingredients: true,
        directions: { orderBy: { stepNumber: 'asc' } },
        tags: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.json(recipes);
  } catch (error) {
    next(error);
  }
});

// Health check, and since SERV-128 also the build-identity contract that
// Switchyard's delivery reconciler polls to record what is actually running
// (SWY-192). Without `version` + `sha` this service probes as `no_version`:
// reachable and speaking, but unable to say WHICH build is speaking, so no
// deploy of cook_book could ever be corroborated on the delivery matrix.
//
// The ledger points at THIS path rather than the estate-default `/healthz`,
// deliberately. The `app.get('*')` catch-all below serves index.html for any
// unmatched route, so `/healthz` answers 200 with a page of HTML — which the
// reconciler classifies as `unreachable` ("something in front of the service
// replied"), painting a healthy service red. Registering with
// `health_path=/api/health` is what avoids that.
//
// Resolved per request rather than once at boot so the value cannot be captured
// before the environment is fully populated; it is two env reads.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ...resolveBuildIdentity() });
});

// Serve frontend static files in production
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
