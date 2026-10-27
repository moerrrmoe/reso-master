#!/bin/sh
set -e

# Fast schema push without regenerating client (already generated during docker build)
npx prisma db push --skip-generate

# Hand over PID 1 to pm2-runtime so Docker SIGTERM stops immediately (no 10-30s timeout)
exec pm2-runtime start ecosystem.config.cjs
