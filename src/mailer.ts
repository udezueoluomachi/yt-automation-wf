import nodemailer from 'nodemailer';
import type { SentMessageInfo } from 'nodemailer';
import fs from 'fs';
import type { ReviewEmailOptions } from './types/calendar.js';

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
 * Sends a review email for a compiled YouTube Short.
 */
export async function sendReviewEmail(
  options: ReviewEmailOptions
): Promise<SentMessageInfo | null> {
  const { serialId, title, videoPath, recipientEmail } = options;
  const senderEmail = process.env.SMTP_USER || 'no-reply@youtube-engine.local';
  const targetEmail = recipientEmail || process.env.NOTIFICATION_EMAIL || senderEmail;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(
      `[SMTP] SMTP credentials not set in .env. Skipping live email dispatch for ${serialId}.`
    );
    return null;
  }

  const transporter = getMailTransporter();
  const fileExists = fs.existsSync(videoPath);

  const mailOptions = {
    from: `"AI Shorts Engine" <${senderEmail}>`,
    to: targetEmail,
    subject: `🎬 Short Ready for Review: [${serialId}] - ${title}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #111827; margin-top: 0; font-size: 20px;">🎬 YouTube Short Compiled Successfully</h2>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Serial ID:</strong> <code style="background-color: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${serialId}</code></p>
          <p style="margin: 0;"><strong>Title:</strong> ${title}</p>
        </div>
        <p style="color: #374151; line-height: 1.5;">Your automated production pipeline has generated and compiled this short.</p>
        <p style="color: #374151; line-height: 1.5;">The task status has been updated to <b>DONE</b> in your content calendar.</p>
        <p style="font-size: 12px; color: #6b7280; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px;">Local Video Path: ${videoPath}</p>
      </div>
    `,
    attachments: fileExists
      ? [
          {
            filename: `${serialId}.mp4`,
            path: videoPath,
          },
        ]
      : [],
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`📧 Review email sent successfully for ${serialId}: messageId=${info.messageId}`);
  return info;
}
