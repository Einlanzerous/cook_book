/**
 * Contributor read/write service (COOK-11). Shared by the REST routes and,
 * later, the MCP list_contributors tool (COOK-13) and first-sign-in creation
 * (COOK-23), so there is one data path.
 *
 * Source counting rule (binding, COOK-6): group on lower(trim(source)) and
 * exclude 'manual' (no label) and blank. email / externalId are never exposed.
 */
import { recipeInclude, presentRecipe, sourceLabel } from './recipeShape.js';
import { HttpError } from './recipeWrite.js';

export const sourceKey = (source) => (source ?? '').trim().toLowerCase();

export function presentContributor(c, { recipeCount = 0, sourceCount = 0 } = {}) {
  return {
    id: c.id,
    name: c.name,
    bio: c.bio ?? null,
    portraitUrl: c.portraitUrl ?? null,
    joinedAt: c.joinedAt,
    recipeCount,
    sourceCount
  };
}

/**
 * Distinct cited sources with counts, most cited first.
 * @param {Array<{source: string|null, n?: number}>} rows  n defaults to 1
 * @returns {Array<{name: string, count: number}>}
 */
export function summariseSources(rows) {
  const byKey = new Map();
  for (const { source, n = 1 } of rows) {
    const label = sourceLabel(source);
    if (!label) continue;
    const key = sourceKey(source);
    const hit = byKey.get(key);
    if (hit) hit.count += n;
    else byKey.set(key, { name: label, count: n });
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function listContributors(prisma) {
  const [contributors, groups] = await Promise.all([
    prisma.contributor.findMany(),
    prisma.recipe.groupBy({ by: ['contributorId', 'source'], _count: { _all: true } })
  ]);
  const perCook = new Map();
  for (const g of groups) {
    if (!g.contributorId) continue;
    if (!perCook.has(g.contributorId)) perCook.set(g.contributorId, []);
    perCook.get(g.contributorId).push({ source: g.source, n: g._count._all });
  }
  return contributors
    .map((c) => {
      const rows = perCook.get(c.id) ?? [];
      return presentContributor(c, {
        recipeCount: rows.reduce((t, r) => t + r.n, 0),
        sourceCount: summariseSources(rows).length
      });
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export async function getContributorProfile(prisma, id) {
  const c = await prisma.contributor.findUnique({ where: { id } });
  if (!c) return null;
  const recipes = await prisma.recipe.findMany({
    where: { contributorId: id },
    include: recipeInclude,
    orderBy: { createdAt: 'desc' }
  });
  const sources = summariseSources(recipes);
  return {
    ...presentContributor(c, { recipeCount: recipes.length, sourceCount: sources.length }),
    stats: { recipes: recipes.length, sources: sources.length, since: c.joinedAt },
    sources,
    recipes: recipes.map(presentRecipe)
  };
}

const optionalText = (body, field) => {
  const v = body[field];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new HttpError(400, `${field} must be a string`);
  return v.trim() || null;
};

export async function createContributor(prisma, body) {
  body = body ?? {};
  if (typeof body.name !== 'string' || !body.name.trim()) {
    throw new HttpError(400, 'name is required');
  }
  const created = await prisma.contributor.create({
    data: {
      name: body.name.trim(),
      bio: optionalText(body, 'bio'),
      portraitUrl: optionalText(body, 'portraitUrl')
      // email and externalId are deliberately NOT accepted here: they are the
      // keys COOK-23's first-sign-in creation binds an identity to, and this
      // route is open. A caller who could set them could pre-claim a sign-in.
    }
  });
  return presentContributor(created);
}
