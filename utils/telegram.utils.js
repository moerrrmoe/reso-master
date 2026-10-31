/**
 * Utility helpers for working with Telegram message objects (teleproto).
 */

/**
 * Extracts a friendly title/filename from a Telegram message.
 * @param {Object} message
 * @returns {string}
 */
export const extractVideoTitle = (message) => {
  const attributes = message.media?.document?.attributes || message.document?.attributes || [];
  for (const attr of attributes) {
    if (attr.fileName) return attr.fileName.split(".")[0];
  }
  if (message.file?.name) return message.file.name.split(".")[0];
  if (message.message?.trim().length > 0) {
    return `${message.message.trim().split('\n')[0].slice(0, 60)}`;
  }
  return `video_${message.id}`;
};

/**
 * Returns true if the message contains a video document.
 * @param {Object} message
 * @returns {boolean}
 */
export const isVideoMessage = (message) => {
  if (!message?.media) return false;
  if (message.video) return true;
  const mimeType = message.media?.document?.mimeType || message.document?.mimeType;
  return Boolean(mimeType && mimeType.startsWith('video/'));
};

/**
 * Resolves the effective chatId string from a teleproto message.
 * @param {Object} message
 * @param {Object} [sender]
 * @returns {string|null}
 */
export const resolveChatId = (message, sender = null) => {
  return (
    message.chatId?.toString() ||
    sender?.id?.toString() ||
    message.peerId?.userId?.toString() ||
    message.peerId?.channelId?.toString() ||
    message.peerId?.chatId?.toString() ||
    null
  );
};

/**
 * Safely resolves the sender of a message.
 * @param {Object} message
 * @returns {Promise<Object|null>}
 */
export const resolveSender = async (message) => {
  try {
    return await message.getSender();
  } catch {
    return message.sender || null;
  }
};
