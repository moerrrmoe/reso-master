import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import prisma from '../src/prisma.js';
import { sanitizeFilename } from '../utils/file.utils.js';

const DEFAULT_DOWNLOAD_DIR = path.resolve(process.env.DOWNLOAD_VIDEOS_PATH);

// In-memory cache for live Telegram message objects: msgId -> message, or `${chatId}_${msgId}` -> message
const messageCache = new Map();

/**
 * Cache a live Telegram message for use during download.
 * @param {Object} message
 */
export const cacheMessage = (message) => {
  if (!message?.id) return;
  const chatId =
    message.chatId?.toString() ||
    message.peerId?.userId?.toString() ||
    message.peerId?.channelId?.toString() ||
    message.peerId?.chatId?.toString();
  if (chatId) messageCache.set(`${chatId}_${message.id}`, message);
  messageCache.set(message.id, message);
};

/**
 * Evict a message from the cache.
 * @param {number} msgId
 * @param {string} [chatId]
 */
const evictCache = (msgId, chatId) => {
  messageCache.delete(msgId);
  if (chatId) messageCache.delete(`${chatId}_${msgId}`);
};

/**
 * Enqueue a video for download.
 * @param {{ title: string, msgId: number, chatId?: string, userId?: number }}
 * @returns {Promise<Object>}
 */
export const enqueueDownload = async ({ title, msgId, chatId, userId }) => {
  const item = await prisma.videoDownloadQueue.create({
    data: {
      title,
      msgId: Number(msgId),
      chatId: String(chatId || ''),
      userId: userId ? Number(userId) : null,
    },
  });
  console.log(`[DownloadQueue] Queued "${title}" (msgId: ${msgId}, chatId: ${chatId})`);
  return item;
};

/**
 * Resolve the Telegram message object for a queue item.
 * Falls back to fetching from Telegram via chatId.
 * @param {Object} client
 * @param {Object} queueItem
 * @returns {Promise<Object|null>}
 */
const resolveMessage = async (client, queueItem) => {
  const fromCache =
    (queueItem.chatId ? messageCache.get(`${queueItem.chatId}_${queueItem.msgId}`) : null) ||
    messageCache.get(queueItem.msgId);
  if (fromCache) return fromCache;

  const peer = queueItem.chatId;
  if (!peer || !client?.getMessages) return null;

  try {
    const msgs = await client.getMessages(peer, { ids: [queueItem.msgId] });
    return msgs?.[0] || null;
  } catch {
    try {
      const entity = await client.getEntity(peer);
      const msgs = await client.getMessages(entity, { ids: [queueItem.msgId] });
      return msgs?.[0] || null;
    } catch (err) {
      console.error(`[DownloadQueue] Could not resolve message ${queueItem.msgId} from chat ${peer}:`, err.message);
      return null;
    }
  }
};

/**
 * Download the next pending item in the queue.
 * Creates a Video record, an EncodeQueue job, and removes the queue entry.
 * @param {Object} client
 * @returns {Promise<boolean>} true if an item was processed
 */
export const processNextDownload = async (client) => {
  const item = await prisma.videoDownloadQueue.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!item) return false;

  if (!fs.existsSync(DEFAULT_DOWNLOAD_DIR)) {
    fs.mkdirSync(DEFAULT_DOWNLOAD_DIR, { recursive: true });
  }

  const safeTitle = sanitizeFilename(item.title);
  const targetPath = path.join(DEFAULT_DOWNLOAD_DIR, `${item.msgId}_${safeTitle}`);

  console.log(`[DownloadQueue] Downloading "${item.title}" -> ${targetPath}`);

  const message = await resolveMessage(client, item);
  if (!message) {
    console.error(`[DownloadQueue] Could not locate message ${item.msgId} in chat ${item.chatId}. Dropping item.`);
    await prisma.videoDownloadQueue.delete({ where: { id: item.id } });
    return true;
  }

  const downloadedPath = await client.downloadMedia(message, {
    outputFile: targetPath,
    progressCallback: (downloaded, total) => {
      if (total) {
        const pct = ((Number(downloaded) / Number(total)) * 100).toFixed(1);
        process.stdout.write(`\r[Download] ${pct}% (${downloaded}/${total} bytes)`);
      }
    },
  });

  const finalPath = downloadedPath || targetPath;
  console.log(`\n[DownloadQueue] Finished: ${finalPath}`);

  await prisma.$transaction(async (tx) => {
    const video = await tx.video.create({
      data: { title: item.title, msgId: item.msgId, location: finalPath, sentById: item.userId || null },
    });
    await tx.encodeQueue.create({ data: { videoId: video.id, status: 'pending' } });
    await tx.videoDownloadQueue.delete({ where: { id: item.id } });
  });

  evictCache(item.msgId, item.chatId);
  return true;
};

/**
 * Clear all stale download queue entries (run at startup).
 */
export const clearStaleDownloadQueue = async () => {
  const deleted = await prisma.videoDownloadQueue.deleteMany({});
  if (deleted.count > 0) {
    console.log(`[DownloadQueue] Cleared ${deleted.count} stale download queue entries on startup.`);
  }
};

/**
 * Start the background download queue worker loop.
 * @param {Object} client
 * @param {Object} [options]
 * @param {number} [options.pollIntervalMs=5000]
 * @returns {{ stop: () => void }}
 */
export const startDownloadWorker = (client, options = {}) => {
  const pollMs = options.pollIntervalMs ?? 5000;
  let running = true;

  (async () => {
    while (running) {
      try {
        const processed = await processNextDownload(client);
        if (!processed) await new Promise((r) => setTimeout(r, pollMs));
      } catch (err) {
        console.error('[DownloadWorker Error]:', err.message);
        await new Promise((r) => setTimeout(r, pollMs));
      }
    }
  })();

  return { stop: () => { running = false; console.log('[DownloadWorker] Stopped.'); } };
};
