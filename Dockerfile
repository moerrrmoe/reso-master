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

# Default environment variables
ENV DATABASE_URL="file:/app/prisma/dev.db"
ENV DOWNLOAD_VIDEOS_PATH="downloads"
ENV ENCODED_VIDEOS_PATH="encode_output"
ENV SESSION_PATH="bot_session"
ENV PORT=3000

# Install PM2 to run both bot & worker under a single managed container
RUN npm install -g pm2

# Make entrypoint executable
RUN chmod +x docker-entrypoint.sh

# Expose lightweight health check port for Coolify / Docker
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
