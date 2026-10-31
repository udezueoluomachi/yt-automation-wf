import type { CalendarEntry, ScheduledTime, SlotName } from './types/calendar.js';

/**
 * Formats calendar into clean indented JSON string.
 */
export function exportCalendarJson(calendar: CalendarEntry[]): string {
  return JSON.stringify(calendar, null, 2);
}

/**
 * Formats calendar into CSV for Google Sheets / Excel.
 */
export function exportCalendarCsv(calendar: CalendarEntry[]): string {
  const headers = [
    'serialId',
    'scheduledDate',
    'slot',
    'scheduledTime',
    'slotName',
    'status',
    'topic',
    'targetDurationSeconds',
    'clipsCount',
  ];

  const rows = calendar.map((c) => [
    `"${c.serialId}"`,
    `"${c.scheduledDate}"`,
    c.slot,
    `"${c.scheduledTime || ''}"`,
    `"${c.slotName || ''}"`,
    `"${c.status}"`,
    `"${(c.topic || '').replace(/"/g, '""')}"`,
    c.targetDurationSeconds || 16,
    c.clips?.length || 0,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Appends new items to existing calendar with automatic ID assignment and schedule continuation.
 */
export function importAndAppendCalendar(
  existingCalendar: CalendarEntry[],
  incomingItems: Partial<CalendarEntry>[]
): { updatedCalendar: CalendarEntry[]; addedItems: CalendarEntry[]; addedCount: number } {
  let maxNum = existingCalendar.reduce((max, c) => {
    const match = c.serialId.match(/VID-(\d+)/);
    const num = match && match[1] ? parseInt(match[1], 10) : 0;
    return num > max ? num : max;
  }, 0);

  let lastDate =
    existingCalendar.length > 0
      ? existingCalendar[existingCalendar.length - 1]!.scheduledDate
      : new Date().toISOString().split('T')[0]!;
  let lastSlot =
    existingCalendar.length > 0
      ? existingCalendar[existingCalendar.length - 1]!.slot || 3
      : 3;

  const addedItems: CalendarEntry[] = [];

  for (const item of incomingItems) {
    if (!item.topic && !item.title) continue;

    maxNum++;
    const isConflict =
      existingCalendar.some((c) => c.serialId === item.serialId) ||
      addedItems.some((c) => c.serialId === item.serialId);

    const serialId =
      item.serialId && !isConflict
        ? item.serialId
        : `VID-${String(maxNum).padStart(3, '0')}`;

    let slot = item.slot;
    let scheduledDate = item.scheduledDate;

    if (!slot || !scheduledDate) {
      if (lastSlot >= 3) {
        const d = new Date(lastDate);
        d.setDate(d.getDate() + 1);
        scheduledDate = d.toISOString().split('T')[0]!;
        slot = 1;
      } else {
        scheduledDate = lastDate;
        slot = lastSlot + 1;
      }
      lastDate = scheduledDate;
      lastSlot = slot;
    }

    const timeMap: Record<number, { time: ScheduledTime; name: SlotName }> = {
      1: { time: '08:00', name: 'Morning' },
      2: { time: '13:00', name: 'Afternoon' },
      3: { time: '18:00', name: 'Evening' },
    };

    const slotInfo = timeMap[slot] || { time: '08:00', name: 'Morning' };

    const topic = item.topic || item.title || 'Untitled Short';
    const title = item.title || topic;

    const cleanEntry: CalendarEntry = {
      serialId,
      scheduledDate,
      slot,
      scheduledTime: item.scheduledTime || slotInfo.time,
      slotName: item.slotName || slotInfo.name,
      status: (item.status as CalendarEntry['status']) || 'PENDING',
      topic,
      title,
      targetDurationSeconds: item.targetDurationSeconds || 16,
      clips:
        item.clips && item.clips.length > 0
          ? item.clips
          : [
              {
                clipIndex: 1,
                durationSeconds: 5.3,
                visualAction: `Establish opening premise for: ${topic}. 3D CGI model visualization.`,
                spokenLine: `${topic}`,
                sfxCue: 'Impact whoosh / cinematic chime',
              },
              {
                clipIndex: 2,
                durationSeconds: 5.0,
                visualAction: `Escalate visual mechanics and anatomical reaction in 3D CGI model.`,
                spokenLine: `Here is what happens as the tension rapidly increases.`,
                sfxCue: 'Mechanical ratchet / high tension hum',
              },
              {
                clipIndex: 3,
                durationSeconds: 5.7,
                visualAction: `Climactic resolution and impossible physical result in 3D render.`,
                spokenLine: `The stored power releases all at once with incredible force.`,
                sfxCue: 'Release boom / snap',
              },
            ],
    };

    addedItems.push(cleanEntry);
  }

  const updatedCalendar = [...existingCalendar, ...addedItems];
  return { updatedCalendar, addedItems, addedCount: addedItems.length };
}
