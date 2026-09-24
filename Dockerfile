# Multi-stage Dockerfile for Metro Industrial CRM Backend

# Stage 1: Build stage
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install OpenSSL for Prisma CLI & engine
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package definitions and Prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy source code and TypeScript config
COPY tsconfig.json ./
COPY src ./src/

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript to JavaScript (dist)
RUN npm run build

# Stage 2: Production runtime stage
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Install runtime OpenSSL dependency for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=5000

# Copy package files, prisma schema, pre-built node_modules and dist from builder
COPY package*.json ./
COPY prisma ./prisma/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 5000

CMD ["node", "dist/server.js"]
