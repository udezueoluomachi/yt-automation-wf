import 'dotenv/config';
import nodemailer from 'nodemailer';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { generateEditManifest } from '../src/mailer.js';

async function sendWithRetry(mailOptions: any, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[DISPATCH] (Attempt ${attempt}/${maxRetries}) Sending to ${mailOptions.to}...`);
      const transporter = nodemailer.createTransport({
        host: 'mail.privateemail.com',
        port: 587,
        secure: false, // STARTTLS
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        connectionTimeout: 60000,
        greetingTimeout: 60000,
        socketTimeout: 600000, // 10 minutes for slow cellular uploads
      });

      const t0 = Date.now();
      const info = await transporter.sendMail(mailOptions);
      transporter.close();
      console.log(`[DISPATCH] Sent in ${((Date.now() - t0) / 1000).toFixed(1)}s! MessageId: ${info.messageId}`);
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
  const entry = calendar.find((e: any) => e.serialId === 'VID-027');
  if (!entry) throw new Error('VID-027 not found in calendar.json');

  const senderEmail = process.env.SMTP_USER || 'hello@blockbytes.co';
  const targetEmail = process.env.NOTIFICATION_EMAIL || 'basilchimaobi2@gmail.com';
  const serialId = entry.serialId;
  const title = entry.title || entry.topic;

  const manifestContent = generateEditManifest(entry, serialId, title);
  const manifest = {
    filename: `${serialId}_Edit_Manifest.txt`,
    content: manifestContent,
  };

  const voiceoverPath = join(process.cwd(), 'public', 'audio', `${serialId}.mp3`);

  // Part 1 Voiceover + Manifest
  console.log(`[DISPATCH] Sending Part 1 (Audio & Manifest): Voiceover + Manifest...`);
  await sendWithRetry({
    from: `"AI Shorts Engine" <${senderEmail}>`,
    to: targetEmail,
    subject: `🎬 [Part 1/4 - Audio] Master Voiceover & Manifest: [${serialId}] - ${title}`,
    text: `Your autonomous 9:16 vertical YouTube Short [${serialId}] audio track & edit manifest are ready!\n\nTitle: ${title}\nDuration: ${entry.targetDurationSeconds}s\n\nAttached:\n1. ${serialId}_Voiceover.mp3 (Google AI Studio Ludo 3.8 Flash TTS)\n2. ${serialId}_Edit_Manifest.txt (Complete act-by-act breakdown)\n\n(Rendered video was dispatched in Part 1 earlier). Raw 3D clips follow in Parts 2-4.`,
    attachments: [
      { filename: `${serialId}_Voiceover.mp3`, path: voiceoverPath },
      manifest
    ]
  });
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
    await sendWithRetry({
      from: `"AI Shorts Engine" <${senderEmail}>`,
      to: targetEmail,
      subject: `🎬 [Part ${clip.partNum}/4] Raw 3D Clip ${clip.clipNum}: [${serialId}] - ${title}`,
      text: `Attached is Raw 3D CGI Clip ${clip.clipNum} (${clip.filename}) for ${serialId}: "${title}".\n\nGenerated autonomously via Google Flow for mobile/desktop editing.`,
      attachments: [{ filename: clip.filename, path: clip.path }, manifest],
    });
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
  console.error('[DISPATCH ERROR]', err);
  process.exit(1);
});
