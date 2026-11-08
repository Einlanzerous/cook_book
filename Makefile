.PHONY: test test-backend test-frontend test-db all check install setup db-create db-migrate db-migrate-new db-seed db-seed-force db-reset db-studio dev dev-backend dev-frontend build build-frontend clean clean-db help

# Default target
all: check install setup

# Configuration - uses peer auth by default (no password, current user)
# Override with: make DB_USER=postgres DB_PASSWORD=secret DB_HOST=localhost dev
DB_NAME := recipe_book
DB_USER := $(shell whoami)
DB_PASSWORD :=
DB_HOST :=
DB_PORT := 5432
# Local sign-in identity for `make dev` (AUTH_MODE=dev; refused in production and off loopback)
DEV_AUTH_EMAIL ?= dev@example.com

# Build connection string based on whether host is specified
ifdef DB_HOST
  ifdef DB_PASSWORD
    DATABASE_URL := postgresql://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)?schema=public
    PSQL_CONN := PGPASSWORD=$(DB_PASSWORD) psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER)
  else
    DATABASE_URL := postgresql://$(DB_USER)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)?schema=public
    PSQL_CONN := psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER)
  endif
else
  # Local peer authentication (Unix socket) - include username for Prisma
  DATABASE_URL := postgresql://$(DB_USER)@localhost/$(DB_NAME)?host=/var/run/postgresql
  PSQL_CONN := psql
endif

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

#---------------------------------------------------------------------------
# Prerequisites Check
#---------------------------------------------------------------------------

check: check-node check-npm check-postgres
	@echo "$(GREEN)✓ All prerequisites met$(NC)"

check-node:
	@echo "Checking for Node.js..."
	@command -v node >/dev/null 2>&1 || { echo "$(RED)✗ Node.js is required but not installed. Please install Node.js 18+$(NC)"; exit 1; }
	@echo "$(GREEN)✓ Node.js $(shell node --version)$(NC)"

check-npm:
	@echo "Checking for npm..."
	@command -v npm >/dev/null 2>&1 || { echo "$(RED)✗ npm is required but not installed$(NC)"; exit 1; }
	@echo "$(GREEN)✓ npm $(shell npm --version)$(NC)"

check-postgres:
	@echo "Checking for PostgreSQL..."
	@command -v psql >/dev/null 2>&1 || { echo "$(RED)✗ PostgreSQL client (psql) is required but not installed$(NC)"; exit 1; }
	@echo "$(GREEN)✓ PostgreSQL client found$(NC)"
	@echo "Checking PostgreSQL server connection..."
	@$(PSQL_CONN) -c '\q' 2>/dev/null || { echo "$(RED)✗ Cannot connect to PostgreSQL. Is the server running?$(NC)"; echo "$(YELLOW)  Try: sudo systemctl start postgresql$(NC)"; exit 1; }
	@echo "$(GREEN)✓ PostgreSQL server is running$(NC)"

#---------------------------------------------------------------------------
# Installation
#---------------------------------------------------------------------------

install: install-backend install-frontend
	@echo "$(GREEN)✓ All dependencies installed$(NC)"

install-backend:
	@echo "Installing backend dependencies..."
	@cd backend && npm install

install-frontend:
	@echo "Installing frontend dependencies..."
	@cd frontend && npm install

#---------------------------------------------------------------------------
# Database Setup
#---------------------------------------------------------------------------

setup: db-create db-migrate db-seed
	@echo "$(GREEN)✓ Database setup complete$(NC)"

db-create:
	@echo "Creating database $(DB_NAME)..."
	@$(PSQL_CONN) -tc "SELECT 1 FROM pg_database WHERE datname = '$(DB_NAME)'" | grep -q 1 || \
		$(PSQL_CONN) -c "CREATE DATABASE $(DB_NAME)"
	@echo "$(GREEN)✓ Database $(DB_NAME) ready$(NC)"

# Apply pending migrations (what the container entrypoint does on start).
db-migrate:
	@echo "Applying pending database migrations..."
	@cd backend && DATABASE_URL="$(DATABASE_URL)" npx prisma migrate deploy
	@echo "$(GREEN)✓ Migrations complete$(NC)"

# Start a new migration: writes the SQL file only, never applies it, so you can
# hand-edit it (backfills, expression indexes). See docs/runbook.md.
#   make db-migrate-new NAME=add_thing
db-migrate-new:
	@test -n "$(NAME)" || { echo "$(RED)usage: make db-migrate-new NAME=<snake_case_name>$(NC)"; exit 1; }
	@cd backend && DATABASE_URL="$(DATABASE_URL)" npx prisma migrate dev --create-only --name $(NAME)

db-seed:
	@echo "Seeding database with sample recipes..."
	@cd backend && DATABASE_URL="$(DATABASE_URL)" npx prisma db seed
	@echo "$(GREEN)✓ Database seeded$(NC)"

# Wipe recipes, tags and contributors, then reseed. Development databases only:
# seed.js still refuses under NODE_ENV=production even with --force.
db-seed-force:
	@echo "$(YELLOW)Re-seeding (deletes all recipes, tags and contributors)...$(NC)"
	@cd backend && DATABASE_URL="$(DATABASE_URL)" node prisma/seed.js --force
	@echo "$(GREEN)✓ Database re-seeded$(NC)"

db-reset:
	@echo "$(YELLOW)Resetting database...$(NC)"
	@cd backend && DATABASE_URL="$(DATABASE_URL)" npx prisma migrate reset --force
	@echo "$(GREEN)✓ Database reset complete$(NC)"

db-studio:
	@echo "Opening Prisma Studio..."
	@cd backend && DATABASE_URL="$(DATABASE_URL)" npx prisma studio

#---------------------------------------------------------------------------
# Development Servers
#---------------------------------------------------------------------------

dev:
	@echo "$(GREEN)Starting development servers...$(NC)"
	@echo "$(YELLOW)Backend: http://localhost:3000$(NC)"
	@echo "$(YELLOW)Frontend: http://localhost:5173$(NC)"
	@echo ""
	@make -j2 dev-backend dev-frontend

dev-backend:
	@cd backend && DATABASE_URL="$(DATABASE_URL)" AUTH_MODE=dev PUBLIC_ORIGIN=http://localhost:5173 DEV_AUTH_EMAIL="$(DEV_AUTH_EMAIL)" npm run dev

dev-frontend:
	@cd frontend && npm run dev

#---------------------------------------------------------------------------
# Build
#---------------------------------------------------------------------------

build: build-frontend
	@echo "$(GREEN)✓ Build complete$(NC)"

build-frontend:
	@echo "Building frontend for production..."
	@cd frontend && npm run build

#---------------------------------------------------------------------------
# Tests
#---------------------------------------------------------------------------

# Plain `make test` needs no database: DB-backed backend tests are skipped
# unless COOK_TEST_DATABASE_URL is set (its database name must end in _test).
# CI sets COOK_REQUIRE_DB=1 so a skip there is a failure.
test: test-backend test-frontend

test-backend:
	@cd backend && npm test

test-frontend:
	@cd frontend && npm test

# Run the full suite against a throwaway Postgres 16 on loopback. Port is
# overridable; 5432/5433/55434/55524/55526 are taken on the Construct box.
# NEVER point COOK_TEST_DATABASE_URL at a real database: the tests create and
# drop databases (the suite refuses any name not ending in _test).
TEST_PG_PORT      ?= 55540
TEST_PG_CONTAINER ?= cook-book-test-pg
test-db:
	@docker rm -f $(TEST_PG_CONTAINER) >/dev/null 2>&1 || true
	@docker run -d --name $(TEST_PG_CONTAINER) \
		-e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=cook_book_test \
		-p 127.0.0.1:$(TEST_PG_PORT):5432 postgres:16-alpine >/dev/null
	@echo "waiting for postgres..."
	@ready=0; for i in $$(seq 1 30); do \
		if docker exec $(TEST_PG_CONTAINER) pg_isready -U postgres -d cook_book_test >/dev/null 2>&1; then ready=1; break; fi; \
		sleep 1; \
	done; \
	if [ $$ready -ne 1 ]; then echo "postgres did not become ready"; docker rm -f $(TEST_PG_CONTAINER) >/dev/null 2>&1; exit 1; fi; \
	sleep 1; \
	COOK_REQUIRE_DB=1 COOK_TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:$(TEST_PG_PORT)/cook_book_test" \
		$(MAKE) test ; rc=$$? ; \
	docker rm -f $(TEST_PG_CONTAINER) >/dev/null 2>&1 ; exit $$rc

#---------------------------------------------------------------------------
# Cleanup
#---------------------------------------------------------------------------

clean:
	@echo "Cleaning up..."
	@rm -rf backend/node_modules frontend/node_modules
	@rm -rf frontend/dist
	@echo "$(GREEN)✓ Cleaned$(NC)"

clean-db:
	@echo "$(YELLOW)Dropping database $(DB_NAME)...$(NC)"
	@$(PSQL_CONN) -c "DROP DATABASE IF EXISTS $(DB_NAME)"
	@echo "$(GREEN)✓ Database dropped$(NC)"

#---------------------------------------------------------------------------
# Help
#---------------------------------------------------------------------------

help:
	@echo "Recipe Book - Available Commands"
	@echo ""
	@echo "$(GREEN)Setup:$(NC)"
	@echo "  make              - Run all checks, install deps, and setup database"
	@echo "  make check        - Verify all prerequisites are installed"
	@echo "  make install      - Install all npm dependencies"
	@echo "  make setup        - Create database, run migrations, and seed data"
	@echo ""
	@echo "$(GREEN)Development:$(NC)"
	@echo "  make dev          - Start both backend and frontend servers"
	@echo "  make dev-backend  - Start only the backend server"
	@echo "  make dev-frontend - Start only the frontend server"
	@echo ""
	@echo "$(GREEN)Database:$(NC)"
	@echo "  make db-create    - Create the PostgreSQL database"
	@echo "  make db-migrate   - Apply pending Prisma migrations (migrate deploy)"
	@echo "  make db-migrate-new NAME=x - Create a new migration file to hand-edit (--create-only)"
	@echo "  make db-seed      - Seed an empty database with sample recipes (refuses otherwise)"
	@echo "  make db-seed-force - Wipe and reseed a development database"
	@echo "  make db-reset     - Reset database (drop and recreate)"
	@echo "  make db-studio    - Open Prisma Studio GUI"
	@echo ""
	@echo "$(GREEN)Build:$(NC)"
	@echo "  make build        - Build frontend for production"
	@echo ""
	@echo "$(GREEN)Test:$(NC)"
	@echo "  make test         - Run backend and frontend tests (DB tests skipped)"
	@echo "  make test-db      - Same, with a throwaway Postgres in Docker (port TEST_PG_PORT=$(TEST_PG_PORT))"
	@echo ""
	@echo "$(GREEN)Cleanup:$(NC)"
	@echo "  make clean        - Remove node_modules and build artifacts"
	@echo "  make clean-db     - Drop the database"
	@echo ""
	@echo "$(GREEN)Current Configuration:$(NC)"
	@echo "  DB_NAME=$(DB_NAME)"
	@echo "  DB_USER=$(DB_USER)"
	@echo "  DB_HOST=$(if $(DB_HOST),$(DB_HOST),(local socket))"
	@echo "  DATABASE_URL=$(DATABASE_URL)"
	@echo ""
	@echo "$(GREEN)Override Examples:$(NC)"
	@echo "  make DB_HOST=localhost DB_USER=postgres DB_PASSWORD=secret dev"
	@echo "  make DB_NAME=my_recipes dev"
