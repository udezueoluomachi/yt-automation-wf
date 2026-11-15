import 'dotenv/config';
import nodemailer from 'nodemailer';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { generateEditManifest } from '../src/mailer.js';

async function main() {
  const calPath = 'data/calendar.json';
  const calendar = JSON.parse(readFileSync(calPath, 'utf8'));
  const entry = calendar.find((e: any) => e.serialId === 'VID-024');
  if (!entry) throw new Error('VID-024 not found');

  const senderEmail = process.env.SMTP_USER || 'hello@blockbytes.co';
  const targetEmail = process.env.NOTIFICATION_EMAIL || 'basilchimaobi2@gmail.com';
  const serialId = entry.serialId;
  const title = entry.title || entry.topic;

  const manifestContent = generateEditManifest(entry, serialId, title);
  const manifest = {
    filename: `${serialId}_Edit_Manifest.txt`,
    content: manifestContent,
  };

  const clipPath = join(process.cwd(), 'public', 'clips', `${serialId}-clip3_opt.mp4`);
  const clipSize = (statSync(clipPath).size / 1024 / 1024).toFixed(1);
  console.log(`[DISPATCH] Preparing Part 4/4: ${clipPath} (${clipSize} MB)...`);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.privateemail.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 60000,
    greetingTimeout: 30000,
    socketTimeout: 300000,
    debug: true,
    logger: true,
  });

  console.log(`[DISPATCH] Verifying transporter...`);
  await transporter.verify();
  console.log(`[DISPATCH] Verified! Sending mail...`);

  const info = await transporter.sendMail({
    from: `"AI Shorts Engine" <${senderEmail}>`,
    to: targetEmail,
    subject: `🎬 [Part 4/4] Raw 3D Clip 3: [${serialId}] - ${title}`,
    text: `Attached is Raw 3D CGI Clip 3 (${serialId}_Raw_Clip_03.mp4) for ${serialId}: "${title}".\n\nGenerated autonomously via Google Flow for mobile/desktop editing.`,
    attachments: [
      { filename: `${serialId}_Raw_Clip_03.mp4`, path: clipPath },
      manifest
    ],
  });

  console.log(`📧 Raw clip 3 sent successfully: ${info.messageId}`);
  transporter.close();

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
