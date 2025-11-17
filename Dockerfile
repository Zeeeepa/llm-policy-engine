# Multi-stage Dockerfile for LLM-Policy-Engine

# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:18-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1000 llmpolicy && \
    adduser -D -u 1000 -G llmpolicy llmpolicy

WORKDIR /app

# Copy built application and dependencies
COPY --from=builder --chown=llmpolicy:llmpolicy /app/dist ./dist
COPY --from=builder --chown=llmpolicy:llmpolicy /app/node_modules ./node_modules
COPY --from=builder --chown=llmpolicy:llmpolicy /app/package*.json ./
COPY --from=builder --chown=llmpolicy:llmpolicy /app/proto ./proto

# Switch to non-root user
USER llmpolicy

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Expose ports
EXPOSE 3000 50051 9090

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command (can be overridden)
CMD ["node", "dist/api/server.js"]
