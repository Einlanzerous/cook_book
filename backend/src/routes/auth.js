/**
 * Sign-in routes (COOK-23). Registered at app level, BEFORE the SPA catch-all.
 *
 *   GET  /auth/sso?next=/path   verify the Access assertion, mint a session
 *   POST /auth/logout           revoke the session, clear the cookie (idempotent)
 *   GET  /api/me (meRouter)     who am I, for the SPA
 */
import { Router } from 'express';
import { AccessError } from '../auth/access.js';
import { clearedCookie, loadSession, mintSession, pruneSessions, revokeSession, sessionCookie } from '../auth/session.js';
import { IdentityConflictError, resolveContributor } from '../services/identity.js';

/** Same-origin relative path only; anything else goes to "/". */
export function safeNext(next) {
  if (typeof next !== 'string' || !next.startsWith('/')) return '/';
  if (next.startsWith('//') || next.includes('\\') || /[\u0000-\u001f]/.test(next)) return '/';
  return next;
}

export function createAuthRouter({ config, verifyAccess, log = console.log }) {
  const router = Router();

  router.get('/sso', async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!config.ssoEnabled) {
      log('auth.sso reject reason=disabled');
      return res.status(404).json({ error: 'Sign-in is not available' });
    }
    try {
      let identity;
      try {
        identity = await verifyAccess(req.get('Cf-Access-Jwt-Assertion'));
      } catch (err) {
        if (!(err instanceof AccessError)) throw err;
        log(`auth.sso reject reason=${err.reason}`);
        return res.status(401).json({ error: 'Sign-in failed' });
      }

      let contributor;
      try {
        contributor = await resolveContributor(req.prisma, identity, { log });
      } catch (err) {
        if (!(err instanceof IdentityConflictError)) throw err;
        log(`auth.sso reject reason=identity_conflict detail="${err.reason}"`);
        return res.status(403).json({ error: 'This account cannot be signed in' });
      }

      await pruneSessions(req.prisma).catch((e) => log(`auth.session prune failed: ${e.message}`));
      const token = await mintSession(req.prisma, config, contributor.id);
      log(`auth.sso ok contributor=${contributor.id}`);
      res.set('Set-Cookie', sessionCookie(config, token));

      const requested = req.query.next;
      const target = safeNext(requested);
      if (requested !== undefined && target === '/' && requested !== '/') log('auth.sso note reason=bad_next');
      return res.redirect(302, target);
    } catch (err) {
      return next(err);
    }
  });

  // The write guard has already run the origin and content-type checks.
  router.post('/logout', async (req, res, next) => {
    try {
      const revoked = await revokeSession(req.prisma, req, config);
      log(`auth.logout revoked=${revoked}`);
      res.set('Set-Cookie', clearedCookie(config));
      return res.status(204).end();
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export function createMeRouter({ config }) {
  const router = Router();
  // Never 401, never an email or any other contributor field. Per-caller, so
  // never cached.
  router.get('/', async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      const session = await loadSession(req.prisma, config, req);
      const c = session.contributor;
      res.json({
        contributor: c ? { id: c.id, name: c.name } : null,
        signInAvailable: config.ssoEnabled
      });
    } catch (err) {
      next(err);
    }
  });
  return router;
}
