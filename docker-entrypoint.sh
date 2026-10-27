#!/bin/sh
set -e

# Sanitize or fallback DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL="file:/app/prisma/dev.db"
else
  # Strip surrounding quotes if user entered them literally in Coolify UI
  DATABASE_URL=$(echo "$DATABASE_URL" | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//')
  # Prepend file: if missing
  case "$DATABASE_URL" in
    file:*) ;;
    *) DATABASE_URL="file:$DATABASE_URL" ;;
  esac
  export DATABASE_URL
fi

echo "[Entrypoint] Using DATABASE_URL: $DATABASE_URL"

# Fast schema push without regenerating client (already generated during docker build)
npx prisma db push --skip-generate

# Hand over PID 1 to pm2-runtime so Docker SIGTERM stops immediately (no 10-30s timeout)
exec pm2-runtime start ecosystem.config.cjs
