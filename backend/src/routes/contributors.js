import { Router } from 'express';
import { listContributors, getContributorProfile } from '../services/contributors.js';

const router = Router();

// List every cook with counts. Ordered by name, case-insensitive.
router.get('/', async (req, res, next) => {
  try {
    res.json(await listContributors(req.prisma));
  } catch (error) {
    next(error);
  }
});

// One cook's profile: stats, sources cited, and their recipes (recipe-list shape).
router.get('/:id', async (req, res, next) => {
  try {
    const profile = await getContributorProfile(req.prisma, req.params.id);
    if (!profile) return res.status(404).json({ error: 'Contributor not found' });
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

// There is deliberately no POST or DELETE: contributors are created only by a
// verified first sign-in (services/identity.js), and Recipe.contributorId is
// ON DELETE RESTRICT.

export default router;
