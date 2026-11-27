import { renderShortVideo } from '../src/render.js';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

async function main() {
  const calPath = 'data/calendar.json';
  const calendar = JSON.parse(readFileSync(calPath, 'utf8'));
  const entry = calendar.find((e: any) => e.serialId === 'VID-038');
  if (!entry) throw new Error('VID-038 not found in calendar.json');

  // Exact durations from audio analysis (18.36s total)
  entry.targetDurationSeconds = 18.36;
  entry.audioVoiceoverPath = 'audio/VID-038.mp3';

  const act1Dur = 6.18;
  const act2Dur = 6.53;
  const act3Dur = 5.65;

  entry.clips[0].durationSeconds = act1Dur;
  entry.clips[0].spokenLine = "Embed a pressurized micro-propane jet nozzle and piezoelectric igniter inside the tip of your thumb.";
  entry.clips[1].durationSeconds = act2Dur;
  entry.clips[1].spokenLine = "Fire a three-thousand-degree blue plasma flame to weld steel pipes or ignite campfires in seconds.";
  entry.clips[2].durationSeconds = act3Dur;
  entry.clips[2].spokenLine = "Snap the fuel valve shut mentally as a heat-resistant ceramic cap seals flush over your thumb.";

  writeFileSync(calPath, JSON.stringify(calendar, null, 2), 'utf8');
  console.log(`[CALENDAR] Updated VID-038 timings: total ${entry.targetDurationSeconds}s (Act 1: ${act1Dur}s, Act 2: ${act2Dur}s, Act 3: ${act3Dur}s)`);

  console.log('[REMOTION] Rendering video for entry:', entry.serialId, entry.title);
  const outPath = await renderShortVideo(entry, (pct) => {
    if (Math.round(pct) % 20 === 0) {
      console.log(`[REMOTION] Render progress: ${Math.round(pct)}%`);
    }
  });

  console.log(`[REMOTION] Successfully rendered video to: ${outPath}`);

  // Optimize final video with ffmpeg to ~1400k bitrate for optimal email delivery
  const optPath = join(process.cwd(), 'out', 'VID-038_opt.mp4');
  console.log(`[FFMPEG] Compressing video to ${optPath}...`);
  execSync(`ffmpeg -y -i "${outPath}" -c:v libx264 -b:v 1400k -maxrate 1600k -bufsize 2000k -preset slow -c:a aac -b:a 128k "${optPath}"`, { stdio: 'inherit' });
  copyFileSync(optPath, outPath);
  console.log(`[FFMPEG] Replaced original with optimized video at ${outPath}`);

  // Extract keyframe artifacts for act 1, 2, 3 into brain directory
  const brainDir = '/home/oluomachi-c-udezue/.gemini/antigravity-cli/brain/fcdb013c-7946-4c00-8518-a92ebcf45cdd';
  console.log(`[ARTIFACTS] Extracting act keyframes to ${brainDir}...`);
  const t1 = (act1Dur * 0.5).toFixed(3);
  const t2 = (act1Dur + act2Dur * 0.5).toFixed(3);
  const t3 = (act1Dur + act2Dur + act3Dur * 0.5).toFixed(3);

  execSync(`ffmpeg -y -ss ${t1} -i "${outPath}" -vframes 1 -q:v 2 "${join(brainDir, 'vid038_act1.jpg')}"`, { stdio: 'inherit' });
  execSync(`ffmpeg -y -ss ${t2} -i "${outPath}" -vframes 1 -q:v 2 "${join(brainDir, 'vid038_act2.jpg')}"`, { stdio: 'inherit' });
  execSync(`ffmpeg -y -ss ${t3} -i "${outPath}" -vframes 1 -q:v 2 "${join(brainDir, 'vid038_act3.jpg')}"`, { stdio: 'inherit' });
  console.log(`[ARTIFACTS] Keyframes saved successfully.`);
}

main().catch(err => {
  console.error('[REMOTION] Render error:', err);
  process.exit(1);
});
