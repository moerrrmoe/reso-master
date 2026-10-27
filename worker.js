import dotenv from 'dotenv';
dotenv.config();

import { isEncodeBusy, runEncodeQueue, clearStaleEncodeJobs } from './services/encode.service.js';
import prisma from './src/prisma.js';

const POLL_INTERVAL_MS = 60_000; // 1 minute

const startWorker = async () => {
  console.log('=========================================');
  console.log('       Reso Encode Worker Starting       ');
  console.log('=========================================');

  // Reset any jobs stuck in 'encoding' state from a previous crash
  await clearStaleEncodeJobs();

  const interval = setInterval(async () => {
    if (await isEncodeBusy()) return;
    await runEncodeQueue();
  }, POLL_INTERVAL_MS);

  // Also run immediately on startup in case there are pending jobs
  if (!(await isEncodeBusy())) await runEncodeQueue();

  const shutdown = async () => {
    console.log('\n[Worker] Shutting down...');
    clearInterval(interval);
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

startWorker().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});
