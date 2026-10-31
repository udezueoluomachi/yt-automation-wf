/**
 * Type definitions for the YouTube Shorts Production Engine.
 */

export type CalendarStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'APPROVED'
  | 'FAILED';

export type SlotName = 'Morning' | 'Afternoon' | 'Evening';
export type ScheduledTime = '08:00' | '13:00' | '18:00';

export interface TimeSlotConfig {
  time: ScheduledTime;
  name: SlotName;
}

export interface Clip {
  clipIndex: number;
  durationSeconds: number;
  visualAction: string;
  spokenLine: string;
  sfxCue: string;
}

export interface CalendarEntry {
  serialId: string;
  scheduledDate: string;
  slot: number;
  scheduledTime?: ScheduledTime | string;
  slotName?: SlotName | string;
  status: CalendarStatus;
  topic: string;
  title?: string;
  targetDurationSeconds: number;
  clips: Clip[];
}

export interface ReviewEmailOptions {
  serialId: string;
  title: string;
  videoPath: string;
  recipientEmail?: string;
}

export interface PipelineExecutionOptions {
  force?: boolean;
  dryRun?: boolean;
  calendarPath?: string;
}
