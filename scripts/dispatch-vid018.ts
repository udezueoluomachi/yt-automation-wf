import 'dotenv/config';
import { sendReviewEmail } from '../src/mailer.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  const calPath = 'data/calendar.json';
  const calendar = JSON.parse(readFileSync(calPath, 'utf8'));
  const entry = calendar.find((e: any) => e.serialId === 'VID-018');
  if (!entry) throw new Error('VID-018 not found in calendar.json');

  console.log(`[DISPATCH] Preparing review email package for ${entry.serialId} ("${entry.title}")...`);
  const videoPath = join(process.cwd(), 'out', `${entry.serialId}.mp4`);
  const audioPath = join(process.cwd(), 'public', 'audio', `${entry.serialId}.mp3`);
  const rawClips = [
    join(process.cwd(), 'public', 'clips', `${entry.serialId}-clip1.mp4`),
    join(process.cwd(), 'public', 'clips', `${entry.serialId}-clip2.mp4`),
    join(process.cwd(), 'public', 'clips', `${entry.serialId}-clip3.mp4`),
  ];

  const result = await sendReviewEmail({
    serialId: entry.serialId,
    title: entry.title || entry.topic,
    videoPath,
    audioPath,
    rawClips,
    entry,
    recipientEmail: process.env.NOTIFICATION_EMAIL || 'basilchimaobi2@gmail.com',
  });

  console.log(`[DISPATCH] Email dispatch result:`, result ? 'SUCCESS' : 'FAILED / SKIPPED');

  // Mark status: DONE in calendar.json
  entry.status = 'DONE';
  entry.renderedAt = new Date().toISOString();
  writeFileSync(calPath, JSON.stringify(calendar, null, 2), 'utf8');
  console.log(`[CALENDAR] Successfully marked ${entry.serialId} as DONE in ${calPath}!`);
}

main().catch(err => {
  console.error('[DISPATCH] Error:', err);
  process.exit(1);
});
