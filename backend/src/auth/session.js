/**
 * Sessions (COOK-23): an opaque 256-bit random token in a cookie, stored only
 * as its SHA-256 hash in the "Session" table. Fixed life from mint (no sliding
 * renewal: the user re-passes /auth/sso, which is also what re-checks
 * Cloudflare). Revoke with revokedAt (see docs/runbook.md).
 */
import { createHash, randomBytes } from 'node:crypto';

const DAY_MS = 86_400_000;
export const PRUNE_AFTER_DAYS = 7;

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/** A few lines of Cookie header parsing; no dependency. */
export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      const v = part.slice(i + 1).trim();
      return v || null;
    }
  }
  return null;
}

/** Set-Cookie value. __Host- in production: Secure, Path=/, no Domain. */
export function sessionCookie(config, token) {
  const base = `${config.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax`;
  const maxAge = Math.round(config.sessionDays * 86400);
  return `${base}; Max-Age=${maxAge}${config.secureCookie ? '; Secure' : ''}`;
}

export function clearedCookie(config) {
  return `${config.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config.secureCookie ? '; Secure' : ''}`;
}

/** Delete rows well past their useful life (expired or revoked more than 7 days ago). */
export function pruneSessions(prisma) {
  return prisma.$executeRaw`DELETE FROM "Session" WHERE "expiresAt" < now() - interval '7 days' OR ("revokedAt" IS NOT NULL AND "revokedAt" < now() - interval '7 days')`;
}

export async function mintSession(prisma, config, contributorId, now = new Date()) {
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: {
      id: hashToken(token),
      contributorId,
      expiresAt: new Date(now.getTime() + config.sessionDays * DAY_MS)
    }
  });
  return token;
}

/**
 * Look the cookie up. Returns { contributor } or { reason } where reason is one
 * of missing | unknown | expired | revoked (for the log; never sent to the client).
 */
export async function loadSession(prisma, config, req, now = new Date()) {
  const token = readCookie(req, config.cookieName);
  if (!token) return { reason: 'missing' };
  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    include: { contributor: { select: { id: true, name: true } } }
  });
  if (!session) return { reason: 'unknown' };
  if (session.revokedAt) return { reason: 'revoked' };
  if (session.expiresAt <= now) return { reason: 'expired' };
  return { contributor: session.contributor, sessionId: session.id };
}

export async function revokeSession(prisma, req, config, now = new Date()) {
  const token = readCookie(req, config.cookieName);
  if (!token) return false;
  const { count } = await prisma.session.updateMany({
    where: { id: hashToken(token), revokedAt: null },
    data: { revokedAt: now }
  });
  return count > 0;
}
