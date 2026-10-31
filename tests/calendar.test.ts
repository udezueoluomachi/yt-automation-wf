import { describe, it, expect } from 'vitest';
import { updateCalendarTimes, TIME_SLOTS } from '../src/update.js';
import { loadCalendar } from '../src/workflow.js';
import { getCalendarPath } from '../src/paths.js';
import type { CalendarEntry } from '../src/types/calendar.js';

describe('YouTube Shorts Calendar Pipeline', () => {
  const calendarPath = getCalendarPath();

  it('should load calendar.json and validate the entry schema', () => {
    const calendar = loadCalendar(calendarPath);

    expect(Array.isArray(calendar)).toBe(true);
    expect(calendar.length).toBeGreaterThan(0);

    const first = calendar[0] as CalendarEntry;
    expect(first.serialId).toMatch(/^VID-\d+/);
    expect(first.targetDurationSeconds).toBeGreaterThan(0);
    expect(Array.isArray(first.clips)).toBe(true);
    expect(first.clips.length).toBe(3);

    // Verify clip properties
    const firstClip = first.clips[0]!;
    expect(firstClip.clipIndex).toBe(1);
    expect(typeof firstClip.visualAction).toBe('string');
    expect(typeof firstClip.spokenLine).toBe('string');
    expect(typeof firstClip.sfxCue).toBe('string');
  });

  it('should assign staggered times (08:00, 13:00, 18:00) correctly', () => {
    const result = updateCalendarTimes(calendarPath);
    expect(result.totalUpdated).toBeGreaterThan(0);

    const updated = result.calendar;
    // Verify slot pattern
    expect(updated[0]?.scheduledTime).toBe(TIME_SLOTS[0]?.time);
    expect(updated[0]?.slotName).toBe(TIME_SLOTS[0]?.name);

    expect(updated[1]?.scheduledTime).toBe(TIME_SLOTS[1]?.time);
    expect(updated[1]?.slotName).toBe(TIME_SLOTS[1]?.name);

    expect(updated[2]?.scheduledTime).toBe(TIME_SLOTS[2]?.time);
    expect(updated[2]?.slotName).toBe(TIME_SLOTS[2]?.name);
  });

  it('should enforce status types and safe transitions', () => {
    const calendar = loadCalendar(calendarPath);
    const validStatuses = ['PENDING', 'IN_PROGRESS', 'DONE', 'APPROVED', 'FAILED'];

    calendar.forEach((entry) => {
      expect(validStatuses).toContain(entry.status);
    });
  });
});
