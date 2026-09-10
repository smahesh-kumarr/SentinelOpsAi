# ==========================================
# Stage 1: Build React/Vite SPA
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
RUN npm ci

# Copy source files
COPY . .

# Build-time API URL argument (optional, defaults to same-origin reverse proxy)
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Build production bundle
RUN npm run build

# ==========================================
# Stage 2: Production Nginx Web Server
# ==========================================
FROM nginx:alpine

# Copy built application assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration with reverse proxy support
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
