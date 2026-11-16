/**
 * Resolve a verified gateway identity to an ALREADY-BOUND contributor
 * (COOK-49). Read-only by construction: this module has no create, update or
 * upsert in it, and tests pin that rows are unchanged after a call.
 *
 * Why this is not services/identity.js `resolveContributor`: that one creates
 * a contributor for any new verified email and binds `externalId` on first
 * sight. That is safe on the web only because /auth/sso sits behind an Access
 * policy that admits just the invited group. heitan's Access application has
 * its own, likely wider, policy, and its `sub` for one person may differ from
 * the web app's. Binding here could widen the contributor set or fix a heitan
 * `sub` onto the owner's row (and then fail the owner's next web sign-in).
 * So the web sign-in is the only way in, and MCP only recognises its results.
 *
 *   1. the row whose externalId equals the assertion's `sub`  -> matched 'sub'
 *   2. else the row whose email matches AND whose externalId is already set
 *      (the sub differs: heitan's app, same person)           -> matched 'email'
 *   3. else null (no row, or a row nobody has signed in as yet: NULL externalId)
 *
 * `sub` and `email` come from a verified assertion (email already trimmed and
 * lower-cased by the verifier), never from tool arguments.
 */

/** @returns {Promise<{ contributor: object, matched: 'sub'|'email' } | null>} */
export async function findBoundContributor(prisma, { email, sub }) {
  if (sub) {
    const bySub = await prisma.contributor.findUnique({ where: { externalId: sub } });
    if (bySub) return { contributor: bySub, matched: 'sub' };
  }
  if (email) {
    const byEmail = await prisma.contributor.findUnique({ where: { email } });
    if (byEmail && byEmail.externalId) return { contributor: byEmail, matched: 'email' };
  }
  return null;
}
