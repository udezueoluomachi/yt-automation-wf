import nodemailer from 'nodemailer';
import type { SentMessageInfo } from 'nodemailer';
import fs from 'fs';
import type { CalendarEntry, ReviewEmailOptions } from './types/calendar.js';
import { resolveProjectPath } from './paths.js';

/**
 * Creates and configures the nodemailer SMTP transporter.
 */
export function getMailTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true'; // true for 465, false for 587
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 60000,
    greetingTimeout: 30000,
    socketTimeout: 300000, // 5 minutes for uploading large attachments
  });
}

/**
 * Verifies that the SMTP configuration is valid.
 */
export async function verifySmtpConnection(): Promise<boolean> {
  const transporter = getMailTransporter();
  try {
    await transporter.verify();
    return true;
  } catch (error) {
    console.warn(`[SMTP] Connection verification failed: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Generates an editable production manifest text file.
 */
export function generateEditManifest(
  entry?: CalendarEntry,
  serialId?: string,
  title?: string
): string {
  const id = serialId || entry?.serialId || 'SHORT';
  const t = title || entry?.title || entry?.topic || 'Untitled';
  const duration = entry?.targetDurationSeconds || 16;

  let manifest = `================================================================================\n`;
  manifest += `YOUTUBE SHORTS PRODUCTION & EDITING MANIFEST\n`;
  manifest += `Serial ID: ${id}\n`;
  manifest += `Title: ${t}\n`;
  manifest += `Target Duration: ${duration}s | Aspect Ratio: 9:16 Vertical (1080x1920)\n`;
  manifest += `================================================================================\n\n`;

  manifest += `[PACKAGE INVENTORY]\n`;
  manifest += `1. ${id}_Final_Render.mp4 - Fully compiled short with kinetic captions & audio\n`;
  manifest += `2. ${id}_Voiceover.mp3    - Raw voiceover track (Ludo, Google AI Studio TTS)\n`;
  if (entry?.clips?.length) {
    entry.clips.forEach((_, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      manifest += `${idx + 3}. ${id}_Raw_Clip_${num}.mp4 - Raw 3D CGI visual clip (Google Flow Veo)\n`;
    });
  }
  manifest += `\n[ACT-BY-ACT BREAKDOWN & TIMINGS]\n`;

  if (entry?.clips && entry.clips.length > 0) {
    entry.clips.forEach((clip, idx) => {
      manifest += `--- ACT ${clip.clipIndex || idx + 1} (${clip.durationSeconds}s) ---\n`;
      manifest += `Spoken Line: "${clip.spokenLine}"\n`;
      manifest += `Visual Action: ${clip.visualAction}\n`;
      manifest += `SFX Cue: ${clip.sfxCue}\n\n`;
    });
  } else {
    manifest += `No act breakdown specified.\n\n`;
  }

  manifest += `[MOBILE EDITING TIPS (CapCut, VN, Premiere Rush)]\n`;
  manifest += `1. Import all Raw_Clip files onto track 1 in sequence.\n`;
  manifest += `2. Import ${id}_Voiceover.mp3 onto the primary audio track.\n`;
  manifest += `3. Line up cuts with the end of each narration sentence.\n`;
  manifest += `4. Add a quick 105% -> 100% scale punch on cut transitions.\n`;
  manifest += `5. Add kinetic centered captions with bold drop shadows.\n`;
  manifest += `================================================================================\n`;

  return manifest;
}

interface AttachmentItem {
  filename: string;
  path?: string;
  content?: string;
}

/**
 * Resolves all raw assets (video, audio, clips, manifest) for an edit.
 */
export function resolveEditAssets(options: ReviewEmailOptions): {
  finalRender?: AttachmentItem;
  voiceover?: AttachmentItem;
  rawClips: AttachmentItem[];
  manifest: AttachmentItem;
} {
  const { serialId, videoPath, audioPath, rawClips, entry, title } = options;

  // 1. Final Render
  let finalRender: AttachmentItem | undefined;
  if (videoPath && fs.existsSync(videoPath)) {
    finalRender = {
      filename: `${serialId}_Final_Render.mp4`,
      path: videoPath,
    };
  }

  // 2. Voiceover Audio
  let voiceover: AttachmentItem | undefined;
  const audioCandidate =
    audioPath ||
    resolveProjectPath('public', 'audio', `${serialId}.mp3`);
  if (fs.existsSync(audioCandidate)) {
    voiceover = {
      filename: `${serialId}_Voiceover.mp3`,
      path: audioCandidate,
    };
  } else {
    const wavCandidate = resolveProjectPath('public', 'audio', `${serialId}.wav`);
    if (fs.existsSync(wavCandidate)) {
      voiceover = {
        filename: `${serialId}_Voiceover.wav`,
        path: wavCandidate,
      };
    }
  }

  // 3. Raw Video Clips
  const resolvedClips: AttachmentItem[] = [];
  if (rawClips && rawClips.length > 0) {
    rawClips.forEach((clipPath, idx) => {
      if (fs.existsSync(clipPath)) {
        const num = String(idx + 1).padStart(2, '0');
        resolvedClips.push({
          filename: `${serialId}_Raw_Clip_${num}.mp4`,
          path: clipPath,
        });
      }
    });
  } else {
    // Check entry clips or public/clips
    const clipsCount = entry?.clips?.length || 3;
    for (let i = 1; i <= clipsCount; i++) {
      const num = String(i).padStart(2, '0');
      // Candidate 1: public/clips/[serialId]-clip[i].mp4
      const p1 = resolveProjectPath('public', 'clips', `${serialId}-clip${i}.mp4`);
      // Candidate 2: public/clips/clip[i].mp4
      const p2 = resolveProjectPath('public', 'clips', `clip${i}.mp4`);

      if (fs.existsSync(p1)) {
        resolvedClips.push({
          filename: `${serialId}_Raw_Clip_${num}.mp4`,
          path: p1,
        });
      } else if (fs.existsSync(p2)) {
        resolvedClips.push({
          filename: `${serialId}_Raw_Clip_${num}.mp4`,
          path: p2,
        });
      }
    }
  }

  // 4. Manifest
  const manifestContent = generateEditManifest(entry, serialId, title);
  const manifest: AttachmentItem = {
    filename: `${serialId}_Edit_Manifest.txt`,
    content: manifestContent,
  };

  return {
    finalRender,
    voiceover,
    rawClips: resolvedClips,
    manifest,
  };
}

/**
 * Sends a review email with all production assets attached.
 */
export async function sendReviewEmail(
  options: ReviewEmailOptions
): Promise<SentMessageInfo | null> {
  const { serialId, title, recipientEmail, entry } = options;
  const senderEmail = process.env.SMTP_USER || 'no-reply@youtube-engine.local';
  const targetEmail = recipientEmail || process.env.NOTIFICATION_EMAIL || senderEmail;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(
      `[SMTP] SMTP credentials not set in .env. Skipping live email dispatch for ${serialId}.`
    );
    return null;
  }

  const transporter = getMailTransporter();
  const assets = resolveEditAssets(options);

  const allAttachments: AttachmentItem[] = [];
  if (assets.finalRender) allAttachments.push(assets.finalRender);
  if (assets.voiceover) allAttachments.push(assets.voiceover);
  allAttachments.push(...assets.rawClips);
  allAttachments.push(assets.manifest);

  const clipsHtml = (entry?.clips || [])
    .map(
      (c, i) => `
      <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <strong style="color: #111827;">Act ${c.clipIndex || i + 1} (${c.durationSeconds}s)</strong>
          <span style="font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">Clip ${i + 1}</span>
        </div>
        <p style="margin: 4px 0; color: #1e293b; font-size: 13px;"><b>🎙️ Spoken:</b> "${c.spokenLine}"</p>
        <p style="margin: 4px 0; color: #64748b; font-size: 12px;"><b>🎬 Visual:</b> ${c.visualAction}</p>
        <p style="margin: 4px 0; color: #94a3b8; font-size: 11px;"><b>🔊 SFX:</b> ${c.sfxCue}</p>
      </div>`
    )
    .join('');

  const attachmentsListHtml = allAttachments
    .map((a) => {
      let sizeLabel = '';
      if (a.path && fs.existsSync(a.path)) {
        const mb = (fs.statSync(a.path).size / 1024 / 1024).toFixed(1);
        sizeLabel = ` (${mb} MB)`;
      }
      return `<li style="margin-bottom: 4px;"><code>${a.filename}</code>${sizeLabel}</li>`;
    })
    .join('');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #fafafa;">
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="color: #111827; margin: 0; font-size: 18px;">🎬 YouTube Short Production Package</h2>
        <span style="background-color: #10b981; color: #ffffff; font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 9999px;">READY FOR REVIEW</span>
      </div>

      <div style="background-color: #f1f5f9; padding: 14px; border-radius: 8px; margin-bottom: 16px;">
        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">SERIAL ID: <b style="color: #0f172a;">${serialId}</b></div>
        <div style="font-size: 16px; font-weight: bold; color: #0f172a;">${title}</div>
      </div>

      <h3 style="font-size: 14px; color: #334155; margin: 16px 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em;">📦 Attached Production & Edit Files</h3>
      <p style="font-size: 13px; color: #475569; margin-top: 0;">All raw assets and final renders are attached below so you can review or edit directly on mobile or desktop:</p>
      <ul style="font-size: 13px; color: #334155; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 12px 12px 28px; margin: 0 0 16px 0;">
        ${attachmentsListHtml}
      </ul>

      <h3 style="font-size: 14px; color: #334155; margin: 16px 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em;">📝 Script & Act Cues</h3>
      ${clipsHtml}

      <div style="margin-top: 20px; padding: 12px; background-color: #fefce8; border: 1px solid #fef08a; border-radius: 8px;">
        <strong style="font-size: 12px; color: #854d0e;">📱 Quick Mobile Editing:</strong>
        <p style="font-size: 11px; color: #a16207; margin: 4px 0 0 0;">
          Save the raw clip files and voiceover to your phone gallery / files app. Import them into CapCut, VN, or Premiere Rush to make manual adjustments or re-time transitions anywhere.
        </p>
      </div>

      <p style="font-size: 11px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px; text-align: center;">
        Automated YouTube Shorts Engine • Generated autonomously with Antigravity
      </p>
    </div>
  `;

  const mailOptions = {
    from: `"AI Shorts Engine" <${senderEmail}>`,
    to: targetEmail,
    subject: `🎬 Complete Production Pack: [${serialId}] - ${title}`,
    html,
    attachments: allAttachments,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Review email with all production assets sent successfully for ${serialId}: messageId=${info.messageId}`);
    return info;
  } catch (error) {
    const errMsg = (error as Error).message || '';
    console.warn(`[SMTP] Combined asset dispatch error: ${errMsg}`);

    // If size limit exceeded or connection closed on large payload, split into 2 emails (Part 1: Master + Audio, Part 2: Raw Clips)
    if (
      errMsg.includes('size') ||
      errMsg.includes('552') ||
      errMsg.includes('too large') ||
      errMsg.includes('Connection closed') ||
      errMsg.includes('ECONNECTION') ||
      (error as { code?: string }).code === 'ECONNECTION'
    ) {
      console.log(`[SMTP] Attempting split dispatch due to attachment size (waiting 4s for socket cleanup)...`);
      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Part 1: Render + Audio + Manifest
      const part1Attachments = [assets.finalRender, assets.voiceover, assets.manifest].filter(
        Boolean
      ) as AttachmentItem[];
      const splitTransporter1 = getMailTransporter();
      const info1 = await splitTransporter1.sendMail({
        ...mailOptions,
        subject: `🎬 [Part 1/2] Final Render & Audio: [${serialId}] - ${title}`,
        attachments: part1Attachments,
      });

      console.log(`📧 Part 1 sent: ${info1.messageId}. Pausing 4s before Part 2...`);
      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Part 2: Raw Clips
      const part2Attachments = [...assets.rawClips, assets.manifest];
      const splitTransporter2 = getMailTransporter();
      const info2 = await splitTransporter2.sendMail({
        ...mailOptions,
        subject: `🎬 [Part 2/2] Raw 3D Clips Pack: [${serialId}] - ${title}`,
        attachments: part2Attachments,
      });

      console.log(`📧 Split emails sent successfully: Part 1=${info1.messageId}, Part 2=${info2.messageId}`);
      return info1;
    }
    throw error;
  }
}
