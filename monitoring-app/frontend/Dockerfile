# ==============================================================================
# SentinelOpsAI — SRE Command Center Frontend Container
# Stage 1: Build React/Vite SPA
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
RUN npm ci

# Copy source files
COPY . .

# Build production bundle
RUN npm run build

# ==============================================================================
# Stage 2: Production Nginx Server
# ==============================================================================
FROM nginx:alpine

# Copy built application assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O - http://localhost/ || exit 1

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
