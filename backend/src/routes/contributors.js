import { Router } from 'express';
import { listContributors, getContributorProfile, createContributor } from '../services/contributors.js';

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

// Create a cook. 409 on a case-insensitive duplicate name (unique index).
// There is deliberately no DELETE: Recipe.contributorId is ON DELETE RESTRICT.
router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await createContributor(req.prisma, req.body));
  } catch (error) {
    next(error);
  }
});

export default router;
