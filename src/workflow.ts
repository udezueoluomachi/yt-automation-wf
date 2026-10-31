import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import type {
  CalendarEntry,
  PipelineExecutionOptions,
} from './types/calendar.js';
import { sendReviewEmail } from './mailer.js';
import { renderShortVideo } from './render.js';
import { getCalendarPath, getOutDir } from './paths.js';

dotenv.config();

/**
 * Loads the calendar array from disk.
 * Uses universal path resolution without __dirname or import.meta.
 */
export function loadCalendar(customPath?: string): CalendarEntry[] {
  const calendarPath = customPath || getCalendarPath();

  if (!fs.existsSync(calendarPath)) {
    throw new Error(`calendar.json not found in data/ directory: ${calendarPath}`);
  }

  const raw = fs.readFileSync(calendarPath, 'utf-8');
  return JSON.parse(raw) as CalendarEntry[];
}

/**
 * Persists the calendar back to disk.
 */
export function saveCalendar(
  calendar: CalendarEntry[],
  customPath?: string
): void {
  const calendarPath = customPath || getCalendarPath();
  fs.writeFileSync(calendarPath, JSON.stringify(calendar, null, 2), 'utf-8');
}

/**
 * Runs the timed pipeline logic.
 */
export async function runTimedPipeline(
  options: PipelineExecutionOptions = {}
): Promise<{ processed: boolean; task?: CalendarEntry }> {
  const { force = false, dryRun = false, calendarPath } = options;
  const calendar = loadCalendar(calendarPath);

  const now = new Date();
  const currentDate = now.toISOString().split('T')[0]!;
  const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"

  console.log(`🕒 Checking queue for Date: ${currentDate}, Time: ${currentTime} (Force: ${force}, DryRun: ${dryRun})`);

  // Find pending task
  let task: CalendarEntry | undefined;

  if (force) {
    // Pick the earliest pending task regardless of time
    task = calendar.find((t) => t.status === 'PENDING');
  } else {
    // Find task due right now or earlier today that is still pending
    task = calendar.find((t) => {
      const isPending = t.status === 'PENDING';
      const isToday = t.scheduledDate === currentDate;
      const isDue = (t.scheduledTime ?? '00:00') <= currentTime;
      return isPending && isToday && isDue;
    });
  }

  if (!task) {
    console.log('💤 No pending video scheduled for this time slot. Exiting cleanly.');
    return { processed: false };
  }

  const title = task.title || task.topic;
  console.log(
    `🚀 Triggering pipeline for [${task.serialId}] (${task.slotName || 'Slot ' + task.slot}): "${title}"`
  );

  try {
    // STEP 1: Antigravity executes Google Flow MCP tools to generate & download clips
    console.log('📥 Calling Google Flow MCP tools for asset generation...');
    console.log(`   Task contains ${task.clips.length} clip cues.`);

    // STEP 2: Remotion Local Render & Compilation
    console.log('🎬 Compiling clips and rendering via Remotion...');
    const outDir = getOutDir();
    const outputVideoPath = path.join(outDir, `${task.serialId}.mp4`);

    if (dryRun) {
      console.log(`[DryRun] Simulated compilation to: ${outputVideoPath}`);
    } else {
      await renderShortVideo(task);
    }

    // STEP 3: Dispatch Email Notification with Video Attachment
    console.log('📤 Dispatching review email via SMTP...');
    if (dryRun) {
      console.log(`[DryRun] Simulated email notification sent for ${task.serialId} ("${title}")`);
    } else {
      await sendReviewEmail({
        serialId: task.serialId,
        title,
        videoPath: outputVideoPath,
      });
    }

    // STEP 4: Update calendar status to DONE
    if (!dryRun) {
      task.status = 'DONE';
      saveCalendar(calendar, calendarPath);
      console.log(`✅ Task ${task.serialId} successfully marked as DONE in calendar.`);
    } else {
      console.log(`[DryRun] Calendar update skipped.`);
    }

    return { processed: true, task };
  } catch (error) {
    console.error(`❌ Error processing task ${task.serialId}:`, error);
    task.status = 'FAILED';
    if (!dryRun) {
      saveCalendar(calendar, calendarPath);
    }
    throw error;
  }
}

// Auto-run if executed directly
if (process.argv[1]?.includes('workflow')) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');

  runTimedPipeline({ force, dryRun }).catch((err) => {
    console.error('[Workflow Error]', (err as Error).message);
    process.exit(1);
  });
}
