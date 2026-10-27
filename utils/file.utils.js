import fs from 'fs';
import path from 'path';

/**
 * Deletes a file from disk if it exists, silently ignoring errors.
 * @param {string} filePath - Absolute path to the file
 */
export const deleteFile = (filePath) => {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn(`[FileUtils] Failed to delete file "${path.basename(filePath)}":`, err.message);
  }
};

/**
 * Sanitizes a string to be safe as a filename by removing illegal characters.
 * @param {string} name
 * @returns {string}
 */
export const sanitizeFilename = (name) => {
  return name.replace(/[/\\?%*:|"<>]/g, '_');
};
