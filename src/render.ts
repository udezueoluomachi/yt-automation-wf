import path from 'path';
import fs from 'fs';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import type { CalendarEntry } from './types/calendar.js';
import { resolveProjectPath, getOutDir } from './paths.js';

let cachedBundleLocation: string | null = null;

/**
 * Pre-bundles the Remotion entry point for rendering.
 */
export async function getRemotionBundle(): Promise<string> {
  if (cachedBundleLocation && fs.existsSync(cachedBundleLocation)) {
    return cachedBundleLocation;
  }

  const entryPoint = resolveProjectPath('src', 'remotion', 'index.ts');
  if (!fs.existsSync(entryPoint)) {
    throw new Error(`Remotion entry point not found at: ${entryPoint}`);
  }

  console.log(`[Remotion] Bundling composition from: ${entryPoint}...`);
  const publicDir = resolveProjectPath('public');
  cachedBundleLocation = await bundle({
    entryPoint,
    publicDir,
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        extensionAlias: {
          '.js': ['.ts', '.tsx', '.js'],
          '.mjs': ['.mts', '.mjs'],
        },
      },
    }),
  });

  console.log(`[Remotion] Bundled successfully.`);
  return cachedBundleLocation;
}

/**
 * Renders a calendar short into out/[serialId].mp4 via Remotion.
 */
export async function renderShortVideo(
  entry: CalendarEntry,
  onProgress?: (percent: number) => void
): Promise<string> {
  const outDir = getOutDir();
  const outputPath = path.join(outDir, `${entry.serialId}.mp4`);

  console.log(`\n🎬 Starting Remotion render for: ${entry.serialId}`);
  console.log(`📌 Topic: ${entry.topic}`);
  console.log(`💾 Output: ${outputPath}`);

  const bundleLocation = await getRemotionBundle();

  const totalDuration =
    entry.targetDurationSeconds ||
    entry.clips.reduce((acc, c) => acc + (c.durationSeconds || 0), 0) ||
    28;

  const audioCandidate = path.join(
    resolveProjectPath('public'),
    'audio',
    `${entry.serialId}.mp3`
  );
  const audioVoiceoverPath = fs.existsSync(audioCandidate)
    ? `audio/${entry.serialId}.mp3`
    : (entry as { audioVoiceoverPath?: string }).audioVoiceoverPath;

  const inputProps = {
    serialId: entry.serialId,
    topic: entry.topic || entry.title || '',
    targetDurationSeconds: totalDuration,
    audioVoiceoverPath,
    clips: entry.clips.map((c, i) => ({
      ...c,
      mediaPath:
        (c as { mediaPath?: string }).mediaPath ||
        `clips/clip${c.clipIndex || i + 1}.mp4`,
    })),
  };

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: 'ShortComposition',
    inputProps,
  });

  const durationInFrames = Math.round(totalDuration * composition.fps);

  const browserExecutable =
    process.env.CHROME_EXECUTABLE_PATH ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    undefined;

  await renderMedia({
    composition: {
      ...composition,
      durationInFrames,
    },
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    browserExecutable,
    chromiumOptions: {
      gl: 'angle',
      headless: true,
    },
    concurrency: 2,
    onProgress: ({ progress }) => {
      const percent = Math.round(progress * 100);
      if (onProgress) onProgress(percent);
      process.stdout.write(`\r[Remotion Render] ${percent}%`);
    },
  });

  console.log(`\n✅ Render completed: ${outputPath}`);
  return outputPath;
}
