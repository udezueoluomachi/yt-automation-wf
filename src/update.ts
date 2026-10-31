import fs from 'fs';
import type { CalendarEntry, TimeSlotConfig } from './types/calendar.js';
import { getCalendarPath } from './paths.js';

export const TIME_SLOTS: TimeSlotConfig[] = [
  { time: '08:00', name: 'Morning' },
  { time: '13:00', name: 'Afternoon' },
  { time: '18:00', name: 'Evening' },
];

/**
 * Updates calendar entries with staggered time slots (08:00, 13:00, 18:00).
 */
export function updateCalendarTimes(
  customPath?: string
): { totalUpdated: number; calendar: CalendarEntry[] } {
  const calendarPath = customPath || getCalendarPath();

  if (!fs.existsSync(calendarPath)) {
    throw new Error(`calendar.json not found at: ${calendarPath}`);
  }

  const rawData = fs.readFileSync(calendarPath, 'utf-8');
  const calendar: CalendarEntry[] = JSON.parse(rawData);

  const updatedCalendar: CalendarEntry[] = calendar.map((entry, index) => {
    const slotIndex = (entry.slot ? entry.slot - 1 : index) % 3;
    const assignedSlot = TIME_SLOTS[slotIndex] ?? TIME_SLOTS[0]!;

    return {
      ...entry,
      title: entry.title || entry.topic,
      scheduledTime: assignedSlot.time,
      slotName: assignedSlot.name,
    };
  });

  fs.writeFileSync(calendarPath, JSON.stringify(updatedCalendar, null, 2), 'utf-8');
  return { totalUpdated: updatedCalendar.length, calendar: updatedCalendar };
}
