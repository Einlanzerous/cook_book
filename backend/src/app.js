import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import randomRouter from './routes/random.js';
import recipesRouter from './routes/recipes.js';
import tagsRouter from './routes/tags.js';
import importRouter from './routes/import.js';
import importPreviewRouter from './routes/importPreview.js';
import contributorsRouter from './routes/contributors.js';
import { createAuthRouter, createMeRouter } from './routes/auth.js';
import { createWriteGuard } from './middleware/writeGuard.js';
import { recipeInclude, presentRecipe } from './services/recipeShape.js';
import { errorHandler } from './middleware/errorHandler.js';
import { queryShapeGuard, boundedString, MAX_LIST_RESULTS, MAX_QUERY_LENGTH } from './middleware/readLimits.js';
import { resolveBuildIdentity } from './buildIdentity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * One api router plus a registry of what was mounted on it. The write-gate
 * test walks the registry (each router's own `stack`; the routers are not
 * nested) to prove every write route is closed, and that a new one fails the
 * test until someone lists it.
 */
export function createApiRegistry() {
  const apiRouter = express.Router();
  const registry = [];
  function mountApi(routePath, router) {
    registry.push({ path: routePath, router });
    apiRouter.use(routePath, router);
  }
  return { apiRouter, mountApi, registry };
}

/**
 * Build the express app around a Prisma client, the validated auth config
 * (config.js) and its Access verifier (boot.js). Nothing here listens or
 * reads the environment at import, so tests can mount it with supertest (and
 * a scratch-database client); src/index.js is the process entry that owns
 * the real PrismaClient, the port and shutdown.
 *
 * `jsonParser` is injectable only so a test can prove the write guard rejects
 * a request before any body is parsed.
 */
export function createApp({ prisma, config, verifyAccess, jsonParser = express.json(), log = console.log }) {
  const app = express();

  // No cors(): the SPA is same-origin, so no Access-Control-Allow-Origin is
  // ever sent (COOK-23, "Cross-origin reads" ruling).

  // Indexing ruling (COOK-41): the public site is not for search engines.
  app.use((req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  });

  // Make prisma available to routes and the guard.
  app.use((req, res, next) => {
    req.prisma = prisma;
    next();
  });

  // The write gate runs BEFORE express.json(), on /api and on logout.
  app.use('/api', createWriteGuard({ config, log }));
  app.post('/auth/logout', createWriteGuard({ config, log, requireSession: false }));

  app.use(jsonParser);

  // Non-string query values (?tag[a]=b, ?q[]=x, repeated keys) are 400 before
  // any route or Prisma sees them.
  app.use('/api', queryShapeGuard);

  // Sign-in lives outside /api and ahead of the SPA catch-all below.
  app.use('/auth', createAuthRouter({ config, verifyAccess, log }));

  // Routes
  const { apiRouter, mountApi, registry } = createApiRegistry();
  app.locals.apiRegistry = registry;
  // Before recipesRouter, or '/:id' would swallow 'random'.
  mountApi('/recipes/random', randomRouter);
  mountApi('/recipes', recipesRouter);
  mountApi('/tags', tagsRouter);
  mountApi('/import', importPreviewRouter);
  mountApi('/import', importRouter);
  mountApi('/contributors', contributorsRouter);
  mountApi('/me', createMeRouter({ config }));
  app.use('/api', apiRouter);

  // Search endpoint
  app.get('/api/search', async (req, res, next) => {
    try {
      const q = boundedString(req.query.q, 'q', MAX_QUERY_LENGTH);

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
        include: recipeInclude,
        orderBy: { updatedAt: 'desc' },
        take: MAX_LIST_RESULTS
      });

      res.json(recipes.map(presentRecipe));
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

  return app;
}
