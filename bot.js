import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { NewMessage } from 'teleproto/events';
import client from './src/client/client.js';
import authenticateClient from './src/auth/auth.js';
import prisma from './src/prisma.js';

import { handleStartCommand, resolveAuthorizedUser } from './handlers/auth.handler.js';
import { handleVideoMessage } from './handlers/video.handler.js';
import { isVideoMessage } from './utils/telegram.utils.js';
import { clearStaleDownloadQueue, startDownloadWorker } from './services/download.service.js';
import { startSendWorker } from './services/send.service.js';

/**
 * Central incoming message dispatcher.
 */
const onMessage = async (event) => {
  const message = event.message;
  if (!message) return;

  // Route /start command
  if (await handleStartCommand(message)) return;

  // Authorize sender
  const user = await resolveAuthorizedUser(message);
  if (!user) {
    if (isVideoMessage(message)) {
      await message.reply({
        message: '🚫 Not authorized.\nSend /start <pass_key> to authenticate.',
      }).catch(() => {});
    }
    return;
  }

  // Dispatch to specific handlers
  await handleVideoMessage(message, user);
};

const startBot = async () => {
  console.log('=========================================');
  console.log('       Reso Bot Starting Up              ');
  console.log('=========================================');

  await authenticateClient(client);

  // Clear stale queue entries left over from previous run
  await clearStaleDownloadQueue();

  // Register event handlers
  client.addEventHandler(onMessage, new NewMessage({}));
  console.log('[Bot] Listening for messages...');

  // Start background workers
  const downloadWorker = startDownloadWorker(client);
  const sendWorker = startSendWorker(client);

  // Lightweight HTTP health check for Coolify / Docker
  const healthPort = process.env.PORT || 3000;
  const healthServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  });
  healthServer.listen(healthPort, () => {
    console.log(`[Health] Server listening on port ${healthPort}`);
  });

  const shutdown = async () => {
    console.log('\n[Bot] Shutting down...');
    healthServer.close();
    downloadWorker.stop();
    sendWorker.stop();
    try {
      await client.disconnect();
      await prisma.$disconnect();
    } catch (err) {
      console.error('[Bot] Error during shutdown:', err.message);
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

startBot().catch((err) => {
  console.error('[Bot] Fatal error:', err);
  process.exit(1);
});
