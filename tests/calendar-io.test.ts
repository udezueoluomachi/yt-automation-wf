import { describe, it, expect } from 'vitest';
import {
  exportCalendarJson,
  exportCalendarCsv,
  importAndAppendCalendar,
} from '../src/calendar-io.js';
import type { CalendarEntry } from '../src/types/calendar.js';

describe('Calendar Import and Export Engine', () => {
  const baseCalendar: CalendarEntry[] = [
    {
      serialId: 'VID-001',
      scheduledDate: '2026-11-01',
      slot: 1,
      scheduledTime: '08:00',
      slotName: 'Morning',
      status: 'DONE',
      topic: 'Femur torsion spring replacement',
      targetDurationSeconds: 16,
      clips: [],
    },
    {
      serialId: 'VID-002',
      scheduledDate: '2026-11-01',
      slot: 2,
      scheduledTime: '13:00',
      slotName: 'Afternoon',
      status: 'PENDING',
      topic: 'Heart maglev turbine pump',
      targetDurationSeconds: 16,
      clips: [],
    },
  ];

  it('should export valid JSON matching full calendar length', () => {
    const json = exportCalendarJson(baseCalendar);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].serialId).toBe('VID-001');
  });

  it('should export valid CSV formatted for spreadsheets', () => {
    const csv = exportCalendarCsv(baseCalendar);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('serialId,scheduledDate,slot');
    expect(lines[1]).toContain('"VID-001"');
    expect(lines[2]).toContain('"VID-002"');
  });

  it('should import and append new items with automatic ID continuation', () => {
    const newItems = [
      { topic: 'What if your lungs were vortex chambers?' },
      { topic: 'What if your teeth were synthetic diamond?' },
    ];

    const result = importAndAppendCalendar(baseCalendar, newItems);
    expect(result.addedCount).toBe(2);
    expect(result.updatedCalendar).toHaveLength(4);

    expect(result.addedItems[0]!.serialId).toBe('VID-003');
    expect(result.addedItems[0]!.slot).toBe(3);
    expect(result.addedItems[0]!.slotName).toBe('Evening');
    expect(result.addedItems[0]!.scheduledTime).toBe('18:00');

    // Next item should roll over to next day Slot 1 (Morning 08:00)
    expect(result.addedItems[1]!.serialId).toBe('VID-004');
    expect(result.addedItems[1]!.slot).toBe(1);
    expect(result.addedItems[1]!.slotName).toBe('Morning');
    expect(result.addedItems[1]!.scheduledTime).toBe('08:00');
    expect(result.addedItems[1]!.scheduledDate).toBe('2026-11-02');
  });

  it('should generate default 3-act CGI clip breakdown if incoming entry omits clips', () => {
    const newItems = [{ topic: 'What if your skin was graphene?' }];
    const result = importAndAppendCalendar(baseCalendar, newItems);
    const item = result.addedItems[0]!;

    expect(item.clips).toHaveLength(3);
    expect(item.clips[0]!.spokenLine).toContain('What if your skin was graphene?');
    expect(item.clips[1]!.clipIndex).toBe(2);
    expect(item.clips[2]!.clipIndex).toBe(3);
  });
});
