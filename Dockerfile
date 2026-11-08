# ==============================================================================
# Multi-stage production Dockerfile for PayPilot AI
# Builds shared libraries, compiles API & React web app, and packages runtime.
# ==============================================================================

# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache openssl python3 make g++

# Copy package manifests
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy full source
COPY . .

# Generate Prisma Client
RUN npx prisma generate --schema prisma/schema.prisma

# Build all workspaces (packages/shared, apps/api, apps/web)
RUN npm run build

# Stage 2: Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install runtime dependencies (OpenSSL required by Prisma)
RUN apk add --no-cache openssl

# Copy package manifests & production dependencies
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --omit=dev && npx prisma generate --schema prisma/schema.prisma

# Copy built artifacts from builder stage
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

EXPOSE 4000

# Run migrations and start server
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node apps/api/dist/server.js"]

