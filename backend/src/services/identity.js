/**
 * Resolve a verified Access identity ({ email, sub }) to a Contributor (COOK-23).
 *
 * Identity is the Access `sub`, bound ONCE from the email:
 *   1. a row whose externalId is this sub wins;
 *   2. else a row whose email matches and has no externalId yet is bound to
 *      this sub with a CONDITIONAL update (`... WHERE externalId IS NULL`), so
 *      two different identities racing for one address cannot both bind;
 *   3. a row matched by email that holds a DIFFERENT externalId is refused,
 *      never rebound (IdentityConflictError -> 403);
 *   4. else a new contributor is created.
 *
 * Email and externalId are never settable through an HTTP body: they enter
 * the database only here, from a verified assertion.
 *
 * Prisma P2002 shapes (verified against Postgres 16 / Prisma 5, COOK-23
 * verify-first row, and pinned by test/identity.test.js):
 *   - unique on email:                 meta.target = ['email']
 *   - unique on externalId:            meta.target = ['externalId']
 *   - raw index Contributor_lower_name_key:  meta.target = ['lower(name)']
 *     (the EXPRESSION, not the index name)
 *   - several columns colliding at once report only the first violated index
 *     (email before externalId before lower(name)).
 * So a collision on email/externalId means another request of this person won
 * the race (re-read), and one on lower(name) means the NAME is taken (retry
 * with the next number). If the target is unrecognised we re-read first and
 * only then fall back to treating it as a name collision.
 */
export class IdentityConflictError extends Error {
  constructor(reason) {
    super(`identity conflict: ${reason}`);
    this.reason = reason;
  }
}

const MAX_NAME_ATTEMPTS = 20;

const isP2002 = (e) => e?.code === 'P2002';
const targetHas = (e, ...names) => {
  const t = e?.meta?.target;
  const list = Array.isArray(t) ? t : t ? [t] : [];
  return list.some((x) => names.includes(x));
};

async function reread(prisma, { email, sub }) {
  return (
    (await prisma.contributor.findUnique({ where: { externalId: sub } })) ??
    (await prisma.contributor.findUnique({ where: { email } }))
  );
}

/** Bind `sub` to an email-matched row that has none, or refuse. */
async function bindOnce(prisma, row, { sub }, log) {
  if (row.externalId === sub) return row;
  if (row.externalId) throw new IdentityConflictError('email held by a different identity');
  let count;
  try {
    ({ count } = await prisma.contributor.updateMany({
      where: { id: row.id, externalId: null },
      data: { externalId: sub }
    }));
  } catch (e) {
    // This sub already belongs to another row (a concurrent create): use that.
    if (isP2002(e)) {
      const owner = await prisma.contributor.findUnique({ where: { externalId: sub } });
      if (owner) return owner;
    }
    throw e;
  }
  if (count === 1) {
    log?.(`auth.contributor bound id=${row.id}`);
    return { ...row, externalId: sub };
  }
  // Someone else bound it between our read and write: same sub = this person
  // won elsewhere; a different sub = a different identity holds the address.
  const fresh = await prisma.contributor.findUnique({ where: { id: row.id } });
  if (fresh?.externalId === sub) return fresh;
  throw new IdentityConflictError('email bound to a different identity concurrently');
}

export async function resolveContributor(prisma, identity, { log } = {}) {
  const email = identity.email.trim().toLowerCase();
  const sub = identity.sub;
  const id = { email, sub };

  const bySub = await prisma.contributor.findUnique({ where: { externalId: sub } });
  if (bySub) return bySub;

  const byEmail = await prisma.contributor.findUnique({ where: { email } });
  if (byEmail) return bindOnce(prisma, byEmail, id, log);

  // Create. The display name is a neutral placeholder ("Cook N"): the owner
  // names people at invite time, because GET /api/contributors is public.
  const base = (await prisma.contributor.count()) + 1;
  for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt += 1) {
    const name = `Cook ${base + attempt}`;
    try {
      const created = await prisma.contributor.create({ data: { name, email, externalId: sub } });
      log?.(`auth.contributor created id=${created.id}`);
      return created;
    } catch (e) {
      if (!isP2002(e)) throw e;
      if (targetHas(e, 'email', 'externalId')) {
        const existing = await reread(prisma, id);
        if (existing) return bindOnce(prisma, existing, id, log);
        throw e;
      }
      // lower(name), or an unrecognised target: if this person's row exists
      // now, use it; otherwise the name is taken, try the next number.
      const existing = await reread(prisma, id);
      if (existing) return bindOnce(prisma, existing, id, log);
    }
  }
  const err = new Error('could not allocate a unique contributor name');
  err.status = 500;
  throw err;
}

/**
 * Boot warning: a contributor that owns recipes but can never be signed in as
 * (no email, no externalId) usually means the owner's `magos` email UPDATE was
 * missed. Returns the offending rows so tests can assert on them.
 */
export async function findUnboundOwners(prisma) {
  return prisma.contributor.findMany({
    where: { email: null, externalId: null, recipes: { some: {} } },
    select: { id: true, name: true, _count: { select: { recipes: true } } }
  });
}

export async function warnUnboundOwners(prisma, warn = console.warn) {
  const rows = await findUnboundOwners(prisma);
  for (const r of rows) {
    warn(`auth.boot warning: contributor ${r.id} (${r.name}) owns ${r._count.recipes} recipe(s) but has no email or externalId, so nobody can sign in as them. See docs/runbook.md (Binding the owner).`);
  }
  return rows;
}
