import 'dotenv/config';
import { getMailTransporter, generateEditManifest } from '../src/mailer.js';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

async function sendWithRetry(mailOptions: any, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const transporter = getMailTransporter();
      const info = await transporter.sendMail(mailOptions);
      transporter.close();
      return info;
    } catch (err: any) {
      console.warn(`[DISPATCH] Attempt ${attempt} failed: ${err.message}`);
      if (attempt === maxRetries) throw err;
      console.log(`[DISPATCH] Waiting 10s before retry...`);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}

async function main() {
  const calPath = 'data/calendar.json';
  const calendar = JSON.parse(readFileSync(calPath, 'utf8'));
  const entry = calendar.find((e: any) => e.serialId === 'VID-022');
  if (!entry) throw new Error('VID-022 not found in calendar.json');

  const senderEmail = process.env.SMTP_USER || 'no-reply@youtube-engine.local';
  const targetEmail = process.env.NOTIFICATION_EMAIL || 'basilchimaobi2@gmail.com';
  const serialId = entry.serialId;
  const title = entry.title || entry.topic;

  const manifestContent = generateEditManifest(entry, serialId, title);
  const manifest = {
    filename: `${serialId}_Edit_Manifest.txt`,
    content: manifestContent,
  };

  const finalRenderPath = join(process.cwd(), 'out', `${serialId}.mp4`);
  const voiceoverPath = join(process.cwd(), 'public', 'audio', `${serialId}.mp3`);

  // Part 1: Rendered Video + Master Voiceover + Manifest
  console.log(`[DISPATCH] Sending Part 1: Rendered Video + Voiceover + Manifest...`);
  const p1Info = await sendWithRetry({
    from: `"AI Shorts Engine" <${senderEmail}>`,
    to: targetEmail,
    subject: `🎬 [Part 1/4] YouTube Short Ready for Review: [${serialId}] - ${title}`,
    text: `Your autonomous 9:16 vertical YouTube Short [${serialId}] is compiled and ready for review!\n\nTitle: ${title}\nDuration: ${entry.targetDurationSeconds}s\n\nAttached:\n1. ${serialId}_Final_Render.mp4 (Kinetic captions, Ludo voiceover, clean 9:16 vertical)\n2. ${serialId}_Voiceover.mp3 (Google AI Studio Ludo 3.8 Flash TTS)\n3. ${serialId}_Edit_Manifest.txt (Complete act-by-act breakdown)\n\nRaw 3D visual clips will follow in Parts 2-4.`,
    attachments: [
      { filename: `${serialId}_Final_Render.mp4`, path: finalRenderPath },
      { filename: `${serialId}_Voiceover.mp3`, path: voiceoverPath },
      manifest
    ]
  });
  console.log(`📧 Part 1 sent: ${p1Info?.messageId}`);
  console.log(`[DISPATCH] Pausing 8s before raw clips...`);
  await new Promise((r) => setTimeout(r, 8000));

  // Parts 2-4: Raw clips
  const rawClips = [
    {
      filename: `${serialId}_Raw_Clip_01.mp4`,
      path: join(process.cwd(), 'public', 'clips', `${serialId}-clip1_opt.mp4`),
      partNum: 2,
      clipNum: 1,
    },
    {
      filename: `${serialId}_Raw_Clip_02.mp4`,
      path: join(process.cwd(), 'public', 'clips', `${serialId}-clip2_opt.mp4`),
      partNum: 3,
      clipNum: 2,
    },
    {
      filename: `${serialId}_Raw_Clip_03.mp4`,
      path: join(process.cwd(), 'public', 'clips', `${serialId}-clip3_opt.mp4`),
      partNum: 4,
      clipNum: 3,
    },
  ];

  for (const clip of rawClips) {
    console.log(`[DISPATCH] Uploading ${clip.filename} (${(statSync(clip.path).size / 1024 / 1024).toFixed(1)} MB)...`);
    const info = await sendWithRetry({
      from: `"AI Shorts Engine" <${senderEmail}>`,
      to: targetEmail,
      subject: `🎬 [Part ${clip.partNum}/4] Raw 3D Clip ${clip.clipNum}: [${serialId}] - ${title}`,
      text: `Attached is Raw 3D CGI Clip ${clip.clipNum} (${clip.filename}) for ${serialId}: "${title}".\n\nGenerated autonomously via Google Flow for mobile/desktop editing.`,
      attachments: [{ filename: clip.filename, path: clip.path }, manifest],
    });
    console.log(`📧 Raw clip ${clip.clipNum} sent: ${info?.messageId}`);
    console.log(`[DISPATCH] Pausing 8s between uploads...`);
    await new Promise((r) => setTimeout(r, 8000));
  }

  // Mark status: DONE in calendar.json
  entry.status = 'DONE';
  entry.renderedAt = new Date().toISOString();
  writeFileSync(calPath, JSON.stringify(calendar, null, 2), 'utf8');
  console.log(`[CALENDAR] Successfully marked ${entry.serialId} as DONE in ${calPath}!`);
}

main().catch((err) => {
  console.error('[DISPATCH] Error:', err);
  process.exit(1);
});
