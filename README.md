# Recipe Book

A modern recipe book web application built with Vue 3 and Express.

## Features

- Create, edit, and delete recipes
- Import recipes from HelloFresh URLs
- Tag-based organization with tabbed navigation
- Search across recipes, ingredients, and tags
- Responsive TailwindUI-inspired design

## Screenshots

### Home View
Browse all recipes in a clean card grid layout with tag-based filtering tabs.

![Home View](docs/images/example_home.png)

### Recipe Detail
View full recipe details including ingredients with serving size toggle and step-by-step directions.

![Recipe Detail](docs/images/example_recipe.png)

### Add Recipe
Create new recipes with a comprehensive form for ingredients, directions, and tags.

![Add Recipe](docs/images/example_add_recipe.png)

## Tech Stack

### Frontend
- Vue 3 with Composition API
- Vite for build tooling
- Tailwind CSS for styling
- Pinia for state management
- Vue Router for navigation
- Axios for API calls

### Backend
- Node.js + Express REST API
- PostgreSQL database
- Prisma ORM

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (running with user `postgres`, password `postgres`)

### Quick Start (Makefile)

The easiest way to get started is using the provided Makefile:

```bash
# Check prerequisites, install dependencies, and setup database
make

# Start both frontend and backend
make dev
```

The app will be available at http://localhost:5173

### Available Make Commands

| Command | Description |
|---------|-------------|
| `make` | Run all checks, install deps, and setup database |
| `make check` | Verify all prerequisites are installed |
| `make install` | Install all npm dependencies |
| `make setup` | Create database, run migrations, and seed data |
| `make dev` | Start both backend and frontend servers |
| `make dev-backend` | Start only the backend server |
| `make dev-frontend` | Start only the frontend server |
| `make db-reset` | Reset database (drop and recreate) |
| `make db-studio` | Open Prisma Studio GUI |
| `make build` | Build frontend for production |
| `make clean` | Remove node_modules and build artifacts |
| `make help` | Show all available commands |

### Manual Setup

If you prefer not to use the Makefile:

1. Create a PostgreSQL database:
   ```sql
   CREATE DATABASE recipe_book;
   ```

2. Update the database connection in `backend/.env`:
   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/recipe_book?schema=public"
   ```

3. Backend setup:
   ```bash
   cd backend
   npm install
   npx prisma migrate dev --name init
   npx prisma db seed
   npm run dev
   ```

4. Frontend setup (in a new terminal):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

The API will be available at http://localhost:3000
The app will be available at http://localhost:5173

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/recipes | List all recipes (optional `?tag=` filter) |
| GET | /api/recipes/:id | Get single recipe |
| POST | /api/recipes | Create recipe |
| PUT | /api/recipes/:id | Update recipe |
| DELETE | /api/recipes/:id | Delete recipe |
| GET | /api/tags | List all tags with recipe counts |
| GET | /api/tags/:name/recipes | Get recipes by tag |
| GET | /api/search?q= | Search recipes |
| POST | /api/import/hellofresh | Import from HelloFresh URL |

## Project Structure

```
cook_book/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   ├── recipe/
│   │   │   └── import/
│   │   ├── views/
│   │   ├── stores/
│   │   ├── services/
│   │   └── router/
│   └── ...
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   └── middleware/
│   └── prisma/
└── README.md
```

## Sample Recipes

The seed script includes 8 sample recipes:
- Teriyaki Chicken Bowl
- One-Pan Lemon Herb Salmon
- Classic Beef Tacos
- Vegetable Stir Fry
- Creamy Tuscan Chicken
- Thai Basil Fried Rice
- Mediterranean Quinoa Salad
- Honey Garlic Shrimp
