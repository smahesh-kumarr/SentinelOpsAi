# ==========================================
# Stage 1: Build & Dependencies
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci --only=production

# ==========================================
# Stage 2: Production Runtime
# ==========================================
FROM node:20-alpine

WORKDIR /app

# Copy production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY . .

# Expose backend port
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Start server
CMD ["node", "server.js"]
