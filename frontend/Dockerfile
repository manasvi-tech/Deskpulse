# =============================================================================
# WTF LivePulse — Frontend Dockerfile
# React 18 + Vite built to nginx
# =============================================================================

# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build args for Vite (can be overridden via docker-compose environment)
ARG VITE_API_URL=http://localhost:3001
ARG VITE_WS_URL=ws://localhost:3001

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL

RUN npm run build

# ---- Serve stage ----
FROM nginx:stable-alpine AS serve

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Custom nginx config — SPA routing: all paths → index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
