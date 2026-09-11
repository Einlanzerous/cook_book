# Stage 1: Build frontend
FROM node:24-alpine AS build-frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production
FROM node:24-slim
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

# Build identity (SERV-128). Reported by /api/health, which Switchyard's
# delivery reconciler polls to record what is actually running (the SWY-192
# contract).
#
# Both default to EMPTY, and the fallback lives in backend/src/buildIdentity.js
# rather than here — an ARG that is declared but never passed expands to an
# empty string, so `ENV APP_VERSION=${APP_VERSION}` sets the key to "" whatever
# default is written above it. A default of the release version is deliberately
# absent: an image built outside the release workflow must not claim to be one.
#
# APP_VERSION is bare semver, no "v" prefix — it is compared with strict
# equality against org.opencontainers.image.version, which metadata-action
# stamps bare. GIT_SHA is the full 40-char commit, reported verbatim.
#
# Placed last, after every COPY: an ENV is image config and a changed value
# invalidates every layer beneath it. GIT_SHA changes on every release build, so
# higher up this would re-run `npm ci` and `prisma generate` each time.
ARG APP_VERSION=
ARG GIT_SHA=
ENV APP_VERSION=${APP_VERSION}
ENV GIT_SHA=${GIT_SHA}

ENTRYPOINT ["docker-entrypoint.sh"]
