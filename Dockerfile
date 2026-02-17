# Stage 1: Build frontend
FROM node:20-alpine AS build-frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production
FROM node:20-slim
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy backend files and install production dependencies
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend source and prisma schema
COPY backend/ ./

# Generate Prisma client
RUN npx prisma generate

# Copy built frontend into backend/public
COPY --from=build-frontend /app/frontend/dist ./public/

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
