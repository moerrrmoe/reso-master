import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import prisma from '../src/prisma.js';
import { deleteFile } from '../utils/file.utils.js';
import { getVideoDetails } from './encode.service.js';
import { Api } from 'teleproto';

let isSending = false;

/**
 * Processes all EncodedVideos with status 'awaiting_send':
 * - Sends each to the user who sent the original video via Telegram.
 * - Marks sent ones as 'sent'.
 * - Deletes the encoded file and the original download file from disk after sending all resolutions.
 * @param {Object} client - Teleproto TelegramClient
 */
export const processAwaitingSends = async (client) => {
  if (isSending) return;
  isSending = true;

  try {
    const pending = await prisma.encodedVideo.findMany({
      where: { status: 'awaiting_send' },
      include: {
        video: { include: { sentBy: true, encodedVideos: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const ev of pending) {
      const recipientChatId = ev.video?.sentBy?.chatId;

      if (!recipientChatId) {
        console.warn(`[SendWorker] No recipient for EncodedVideo #${ev.id}. Skipping.`);
        await prisma.encodedVideo.update({ where: { id: ev.id }, data: { status: 'failed_no_recipient' } });
        continue;
      }

      if (!fs.existsSync(ev.location)) {
        console.error(`[SendWorker] File missing for EncodedVideo #${ev.id}: ${ev.location}`);
        await prisma.encodedVideo.update({ where: { id: ev.id }, data: { status: 'failed_file_missing' } });
        continue;
      }

      const fileName = path.basename(ev.location);
      console.log(`[SendWorker] Sending "${fileName}" -> chat ${recipientChatId} ...`);

      try {
        const videoDetails = await getVideoDetails(ev.location);

        await client.sendFile(recipientChatId, {
          file: ev.location,
          caption: `✅ Encoded video ready:\n${fileName}`,
          supportsStreaming: true,
          attributes: [
            new Api.DocumentAttributeVideo({
              w: videoDetails.width,
              h: videoDetails.height,
              duration: videoDetails.duration,
            })
          ]
        });

        await prisma.encodedVideo.update({ where: { id: ev.id }, data: { status: 'sent' } });
        console.log(`[SendWorker] EncodedVideo #${ev.id} sent.`);

        // Delete the encoded file from disk
        deleteFile(ev.location);

        // If ALL encoded resolutions for this video are now sent, also delete the original download
        const allSiblings = await prisma.encodedVideo.findMany({ where: { videoId: ev.videoId } });
        const allSent = allSiblings.every((s) => s.id === ev.id || s.status === 'sent');
        if (allSent) {
          deleteFile(ev.video?.location);
          console.log(`[SendWorker] All encoded versions of Video #${ev.videoId} sent. Deleted original download.`);
        }
      } catch (sendErr) {
        console.error(`[SendWorker] Failed to send EncodedVideo #${ev.id}:`, sendErr.message);
      }
    }
  } catch (err) {
    console.error('[SendWorker Error]:', err.message);
  } finally {
    isSending = false;
  }
};

/**
 * Start the periodic encoded-video send worker.
 * @param {Object} client
 * @param {number} [intervalMs=10000]
 * @returns {{ stop: () => void }}
 */
export const startSendWorker = (client, intervalMs = 10000) => {
  const timer = setInterval(() => processAwaitingSends(client), intervalMs);
  console.log(`[SendWorker] Started (interval: ${intervalMs / 1000}s).`);
  return { stop: () => { clearInterval(timer); console.log('[SendWorker] Stopped.'); } };
};
