import { renderShortVideo } from '../src/render.js';
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

async function main() {
  const calPath = 'data/calendar.json';
  const calendar = JSON.parse(readFileSync(calPath, 'utf8'));
  const entry = calendar.find((e: any) => e.serialId === 'VID-020');
  if (!entry) throw new Error('VID-020 not found in calendar.json');

  // Update target duration and act durations to match voiceover (19.85s total)
  entry.targetDurationSeconds = 19.85;
  entry.audioVoiceoverPath = 'audio/VID-020.mp3';
  entry.clips[0].durationSeconds = 6.15;
  entry.clips[1].durationSeconds = 7.45;
  entry.clips[2].durationSeconds = 6.25;
  writeFileSync(calPath, JSON.stringify(calendar, null, 2), 'utf8');
  console.log('[CALENDAR] Updated VID-020 timings to match voiceover (19.85s total)');

  console.log('[REMOTION] Rendering video for entry:', entry.serialId, entry.title);
  const outPath = await renderShortVideo(entry, (pct) => {
    if (Math.round(pct) % 20 === 0) {
      console.log(`[REMOTION] Render progress: ${Math.round(pct)}%`);
    }
  });

  console.log(`[REMOTION] Successfully rendered video to: ${outPath}`);

  // Optimize final video with ffmpeg to ~1400k bitrate for optimal email delivery
  const optPath = join(process.cwd(), 'out', 'VID-020_opt.mp4');
  console.log(`[FFMPEG] Compressing video to ${optPath}...`);
  execSync(`ffmpeg -y -i "${outPath}" -c:v libx264 -b:v 1400k -maxrate 1600k -bufsize 2000k -preset slow -c:a aac -b:a 128k "${optPath}"`, { stdio: 'inherit' });
  copyFileSync(optPath, outPath);
  console.log(`[FFMPEG] Replaced original with optimized video at ${outPath}`);

  // Extract keyframe artifacts for act 1, 2, 3
  const brainDir = '/home/oluomachi-c-udezue/.gemini/antigravity-cli/brain/fcdb013c-7946-4c00-8518-a92ebcf45cdd';
  console.log(`[ARTIFACTS] Extracting act keyframes to ${brainDir}...`);
  // Act 1 at ~3.0s, Act 2 at ~10.0s, Act 3 at ~16.5s
  execSync(`ffmpeg -y -ss 00:00:03.000 -i "${outPath}" -vframes 1 -q:v 2 "${join(brainDir, 'vid020_act1.jpg')}"`, { stdio: 'inherit' });
  execSync(`ffmpeg -y -ss 00:00:10.000 -i "${outPath}" -vframes 1 -q:v 2 "${join(brainDir, 'vid020_act2.jpg')}"`, { stdio: 'inherit' });
  execSync(`ffmpeg -y -ss 00:00:16.500 -i "${outPath}" -vframes 1 -q:v 2 "${join(brainDir, 'vid020_act3.jpg')}"`, { stdio: 'inherit' });
  console.log(`[ARTIFACTS] Keyframes saved successfully.`);
}

main().catch(err => {
  console.error('[REMOTION] Render error:', err);
  process.exit(1);
});
