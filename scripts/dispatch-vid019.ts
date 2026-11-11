import 'dotenv/config';
import { getMailTransporter, generateEditManifest } from '../src/mailer.js';
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  const calPath = 'data/calendar.json';
  const calendar = JSON.parse(readFileSync(calPath, 'utf8'));
  const entry = calendar.find((e: any) => e.serialId === 'VID-019');
  if (!entry) throw new Error('VID-019 not found in calendar.json');

  const senderEmail = process.env.SMTP_USER || 'no-reply@youtube-engine.local';
  const targetEmail = process.env.NOTIFICATION_EMAIL || 'basilchimaobi2@gmail.com';
  const serialId = entry.serialId;
  const title = entry.title || entry.topic;

  console.log(`[DISPATCH] Sending Raw Clips package for ${serialId} ("${title}")...`);

  const rawClips = [
    {
      filename: `${serialId}_Raw_Clip_01.mp4`,
      path: join(process.cwd(), 'public', 'clips', `${serialId}-clip1.mp4`),
    },
    {
      filename: `${serialId}_Raw_Clip_02.mp4`,
      path: join(process.cwd(), 'public', 'clips', `${serialId}-clip2.mp4`),
    },
    {
      filename: `${serialId}_Raw_Clip_03.mp4`,
      path: join(process.cwd(), 'public', 'clips', `${serialId}-clip3.mp4`),
    },
  ];

  const manifestContent = generateEditManifest(entry, serialId, title);
  const manifest = {
    filename: `${serialId}_Edit_Manifest.txt`,
    content: manifestContent,
  };

  // Dispatch each raw clip individually to guarantee rapid upload without socket resets
  for (let i = 0; i < rawClips.length; i++) {
    const clip = rawClips[i];
    console.log(`[DISPATCH] Uploading ${clip.filename} (${(statSync(clip.path).size / 1024 / 1024).toFixed(1)} MB)...`);
    const transporter = getMailTransporter();
    const info = await transporter.sendMail({
      from: `"AI Shorts Engine" <${senderEmail}>`,
      to: targetEmail,
      subject: `🎬 [Part ${i + 2}/4] Raw 3D Clip ${i + 1}: [${serialId}] - ${title}`,
      text: `Attached is Raw 3D CGI Clip ${i + 1} (${clip.filename}) for ${serialId}: "${title}".\n\nGenerated autonomously via Google Flow for mobile/desktop editing.`,
      attachments: [clip, manifest],
    });
    console.log(`📧 Raw clip ${i + 1} sent: ${info.messageId}`);
    await new Promise(r => setTimeout(r, 2000));
  }

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
