import dotenv from 'dotenv';
dotenv.config();

import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobe from '@ffprobe-installer/ffprobe';
import fs from 'fs';
import path from 'path';
import prisma from '../src/prisma.js';
import { sanitizeFilename } from '../utils/file.utils.js';

const ENCODE_OUTPUT_DIR = path.resolve(process.env.ENCODED_VIDEOS_PATH);
if (!fs.existsSync(ENCODE_OUTPUT_DIR)) fs.mkdirSync(ENCODE_OUTPUT_DIR, { recursive: true });

const CODEC_TO_ENCODER = {
  h264: 'libx264',
  hevc: 'libx265',
  h265: 'libx265',
  vp8: 'libvpx',
  vp9: 'libvpx-vp9',
  av1: 'libsvtav1',
  prores: 'prores_ks',
};

const TARGET_RESOLUTIONS = [720, 480];

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobe.path);

/**
 * Encode a single video to the given output path at the given width.
 * Skips encoding if source width is already <= target width.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {{ width: number }} options
 * @returns {Promise<void>}
 */
const encodeVideo = (inputPath, outputPath, { width }) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      if (!videoStream) return reject(new Error('No video stream found'));

      const { width: srcWidth, codec_name } = videoStream;
      if (srcWidth <= width) {
        console.log(`[Encode] Skipping ${width}p – source is only ${srcWidth}px wide.`);
        return resolve(null); // null = skipped
      }

      ffmpeg(inputPath)
        .videoFilters(`scale=${width}:-2`)
        .videoCodec(CODEC_TO_ENCODER[codec_name] || 'libx264')
        .audioCodec('copy')
        .output(outputPath)
        .on('progress', ({ percent }) => {
          process.stdout.write(`\r[Encode ${width}p] ${Math.floor(percent || 0)}%`);
        })
        .on('end', () => { console.log(`\n[Encode] ${width}p done.`); resolve(outputPath); })
        .on('error', (e) => { console.error(`\n[Encode Error]:`, e.message); reject(e); })
        .run();
    });
  });
};

/**
 * Encode the next pending job from EncodeQueue.
 */
const encodeNextJob = async () => {
  const job = await prisma.encodeQueue.findFirst({ where: { status: 'pending' } });
  if (!job) return;

  await prisma.encodeQueue.update({ where: { id: job.id }, data: { status: 'encoding' } });

  const video = await prisma.video.findUnique({ where: { id: job.videoId } });
  if (!video) {
    console.error(`[Encode] Video #${job.videoId} not found for job #${job.id}.`);
    await prisma.encodeQueue.update({ where: { id: job.id }, data: { status: 'failed' } });
    return;
  }

  console.log(`[Encode] Starting job #${job.id} for Video #${video.id}: "${video.title}"`);

  for (const res of TARGET_RESOLUTIONS) {
    const safeName = sanitizeFilename(video.title);
    const outputPath = path.join(ENCODE_OUTPUT_DIR, `${safeName}_${res}.mp4`);

    try {
      const result = await encodeVideo(video.location, outputPath, { width: res });
      if (result !== null) {
        await prisma.encodedVideo.create({
          data: { videoId: video.id, location: outputPath, status: 'awaiting_send' },
        });
      }
    } catch (err) {
      console.error(`[Encode] Failed to encode ${res}p for Video #${video.id}:`, err.message);
    }
  }

  await prisma.encodeQueue.update({ where: { id: job.id }, data: { status: 'completed' } });
  console.log(`[Encode] Job #${job.id} completed.`);
};

/**
 * Returns true if there are pending encode jobs.
 */
const hasPendingJobs = async () => {
  const count = await prisma.encodeQueue.count({ where: { status: 'pending' } });
  return count > 0;
};

/**
 * Returns true if the encode worker is currently busy.
 */
export const isEncodeBusy = async () => {
  const count = await prisma.encodeQueue.count({ where: { status: 'encoding' } });
  return count > 0;
};

/**
 * Run all pending encode jobs sequentially, then return.
 */
export const runEncodeQueue = async () => {
  while (await hasPendingJobs()) {
    await encodeNextJob();
  }
  console.log('[Encode] Queue drained.');
};

/**
 * Clear stuck 'encoding' jobs from a previous crashed run (call at startup).
 */
export const clearStaleEncodeJobs = async () => {
  const reset = await prisma.encodeQueue.updateMany({
    where: { status: 'encoding' },
    data: { status: 'pending' },
  });
  if (reset.count > 0) {
    console.log(`[Encode] Reset ${reset.count} stuck 'encoding' jobs to 'pending' on startup.`);
  }
};
