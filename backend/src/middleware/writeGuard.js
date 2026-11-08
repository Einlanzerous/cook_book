/**
 * The write gate (COOK-23): ONE app-level guard mounted on /api and on
 * POST /auth/logout BEFORE express.json(), so a bad request never reaches the
 * body parser. It matches by method, not by route, so a write is closed no
 * matter where it is mounted, and even POST /api/does-not-exist answers 401.
 * The allowlist of public writes is empty.
 *
 * For every method except GET/HEAD/OPTIONS, in this order:
 *   1. 403 if Origin differs from PUBLIC_ORIGIN, or Sec-Fetch-Site is
 *      cross-site / same-site (requests with neither header are non-browser
 *      clients and skip this step).
 *   2. 415 if the request carries a body (Content-Length > 0 or a
 *      Transfer-Encoding header) that is not application/json.
 *   3. 401 unless the session cookie names a live session (sets req.contributor).
 *      `requireSession: false` (logout) stops after step 2.
 */
import { loadSession } from '../auth/session.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const SIGN_IN_ERROR = 'Sign in to contribute';

const hasBody = (req) => {
  const len = Number(req.headers['content-length']);
  return (Number.isFinite(len) && len > 0) || req.headers['transfer-encoding'] !== undefined;
};

export function createWriteGuard({ config, log = console.log, requireSession = true }) {
  return async function writeGuard(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.headers.origin;
    const fetchSite = req.headers['sec-fetch-site'];
    if ((origin !== undefined && origin !== config.publicOrigin) || fetchSite === 'cross-site' || fetchSite === 'same-site') {
      log(`auth.write reject reason=cross_origin method=${req.method}`);
      return res.status(403).json({ error: 'Cross-origin request refused' });
    }

    if (hasBody(req) && !req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }

    if (!requireSession) return next();

    try {
      const session = await loadSession(req.prisma, config, req);
      if (!session.contributor) {
        log(`auth.session reject reason=${session.reason}`);
        return res.status(401).json({ error: SIGN_IN_ERROR });
      }
      req.contributor = session.contributor;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
