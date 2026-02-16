import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import recipesRouter from './routes/recipes.js';
import tagsRouter from './routes/tags.js';
import importRouter from './routes/import.js';
import { errorHandler } from './middleware/errorHandler.js';

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
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
