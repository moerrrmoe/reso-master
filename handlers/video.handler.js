import { isVideoMessage, extractVideoTitle, resolveChatId } from '../utils/telegram.utils.js';
import { enqueueDownload, cacheMessage } from '../services/download.service.js';

/**
 * Handle an incoming video message from an authorized user.
 * Caches the message and enqueues it for download.
 * @param {Object} message - teleproto message
 * @param {Object} user - authorized User record from DB
 */
export const handleVideoMessage = async (message, user) => {
  if (!isVideoMessage(message)) return;

  const title = extractVideoTitle(message);
  const chatId = resolveChatId(message);

  console.log(`[VideoHandler] Video from "${user.firstName}": "${title}" (msgId: ${message.id}, chatId: ${chatId})`);

  cacheMessage(message);

  try {
    await enqueueDownload({ title, msgId: message.id, chatId, userId: user.id });
    await message.reply({ message: `📥 Queued for download:\n"${title}"` }).catch(() => {});
  } catch (err) {
    console.error(`[VideoHandler] Failed to enqueue msgId ${message.id}:`, err.message);
    await message.reply({ message: `❌ Failed to queue: ${err.message}` }).catch(() => {});
  }
};
