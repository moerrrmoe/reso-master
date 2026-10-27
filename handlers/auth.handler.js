import prisma from '../src/prisma.js';
import { resolveChatId, resolveSender } from '../utils/telegram.utils.js';

/**
 * Handle /start <key> authentication command.
 * @param {Object} message
 * @returns {Promise<boolean>} true if the message was handled (consumed)
 */
export const handleStartCommand = async (message) => {
  const text = (message.message || message.text || '').trim();
  if (!text.startsWith('/start')) return false;

  const parts = text.split(/\s+/);
  const providedKey = parts[1];
  const expectedKey = process.env.SECRET_KEY?.trim();

  if (!expectedKey) {
    await message.reply({ message: '⚠️ Server configuration error: SECRET_KEY is not set.' }).catch(() => {});
    return true;
  }

  if (!providedKey || providedKey !== expectedKey) {
    await message.reply({
      message: '🚫 Access denied. Invalid or missing key.\nUsage: /start <pass_key>',
    }).catch(() => {});
    return true;
  }

  const sender = await resolveSender(message);
  const chatId = resolveChatId(message, sender);
  const firstName = sender?.firstName || sender?.title || sender?.username || 'Telegram User';

  if (!chatId) {
    await message.reply({ message: '⚠️ Could not determine your chat ID.' }).catch(() => {});
    return true;
  }

  const user = await prisma.user.upsert({
    where: { chatId },
    update: { firstName },
    create: { chatId, firstName },
  });

  console.log(`[Auth] "${firstName}" (chatId: ${chatId}, id: ${user.id}) authenticated.`);
  await message.reply({
    message: `✅ Welcome, ${firstName}! Access granted.\nYou can now send video files to be queued for download and encoding.`,
  }).catch(() => {});

  return true;
};

/**
 * Resolve the authorized User record for a message sender.
 * Returns null if the sender is not in the database.
 * @param {Object} message
 * @returns {Promise<Object|null>}
 */
export const resolveAuthorizedUser = async (message) => {
  const sender = await resolveSender(message);
  const chatId = resolveChatId(message, sender);
  const senderId = sender?.id?.toString() || null;

  return prisma.user.findFirst({
    where: {
      OR: [
        ...(chatId ? [{ chatId }] : []),
        ...(senderId && senderId !== chatId ? [{ chatId: senderId }] : []),
      ],
    },
  });
};
