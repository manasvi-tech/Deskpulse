# =============================================================================
# WTF LivePulse — Backend Dockerfile
# Node.js 20-alpine + Express + ws + node-cron
# All dependencies (including devDeps) are installed so that
#   docker exec backend npm test
# works without any additional steps on the host.
# =============================================================================

FROM node:20-alpine AS base

WORKDIR /app

# Install ALL dependencies (including Jest + Supertest for test runs)
# Done inside the image — no npm install required on the host machine
COPY package*.json ./
RUN npm ci

# Copy application source
COPY . .

# Expose backend port
EXPOSE 3001

# Healthcheck — polls /api/health endpoint
HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=30s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "src/app.js"]
