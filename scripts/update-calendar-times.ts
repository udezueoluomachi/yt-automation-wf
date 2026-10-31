import fs from 'fs';
import path from 'path';

interface Clip {
  clipIndex: number;
  durationSeconds?: number;
  duration?: number;
  visualAction: string;
  sfxCue?: string;
  sfx?: string;
  spokenLine: string;
}

interface CalendarEntry {
  serialId: string;
  scheduledDate: string;
  slot?: number;
  scheduledTime?: string;
  slotName?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'APPROVED' | 'FAILED';
  topic?: string;
  title?: string;
  targetDurationSeconds?: number;
  clips: Clip[];
}

function resolveCalendarPath(): string {
  if (process.env.CALENDAR_PATH && fs.existsSync(process.env.CALENDAR_PATH)) {
    return process.env.CALENDAR_PATH;
  }

  const candidates = [
    path.resolve(process.cwd(), 'data', 'calendar.json'),
    path.resolve(process.cwd(), '..', 'data', 'calendar.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.resolve(process.cwd(), 'data', 'calendar.json');
}

function updateCalendarTimes() {
  const calendarPath = resolveCalendarPath();
  if (!fs.existsSync(calendarPath)) {
    console.error(`❌ calendar.json not found at: ${calendarPath}`);
    return;
  }

  const rawData = fs.readFileSync(calendarPath, 'utf-8');
  const calendar: CalendarEntry[] = JSON.parse(rawData);

  console.log(`🔄 Processing ${calendar.length} calendar entries to add staggered timestamps...`);

  const timeSlots = [
    { time: '08:00', name: 'Morning' },
    { time: '13:00', name: 'Afternoon' },
    { time: '18:00', name: 'Evening' },
  ];

  const updatedCalendar = calendar.map((entry, index) => {
    const slotIndex = (entry.slot ? entry.slot - 1 : index) % 3;
    const assignedSlot = timeSlots[slotIndex] ?? timeSlots[0]!;

    return {
      ...entry,
      title: entry.title || entry.topic,
      scheduledTime: assignedSlot.time,
      slotName: assignedSlot.name,
    };
  });

  fs.writeFileSync(calendarPath, JSON.stringify(updatedCalendar, null, 2), 'utf-8');
  console.log(`✅ Successfully updated all calendar entries with staggered time slots (08:00, 13:00, 18:00)!`);
}

updateCalendarTimes();
