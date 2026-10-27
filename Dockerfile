FROM node:20-bookworm-slim

# Install system dependencies (ffmpeg and OpenSSL for Prisma)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma client
RUN npm install && npx prisma generate

# Copy source code
COPY . .

# Ensure storage directories exist
RUN mkdir -p downloads encode_output bot_session prisma

# Install PM2 to run both bot & worker under a single managed container
RUN npm install -g pm2

# Push schema if needed and run both services with pm2-runtime
CMD ["sh", "-c", "npx prisma db push && pm2-runtime start ecosystem.config.cjs"]
