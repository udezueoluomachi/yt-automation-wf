import { describe, it, expect } from 'vitest';
import { generateEditManifest, resolveEditAssets } from '../src/mailer.js';
import type { CalendarEntry } from '../src/types/calendar.js';

describe('Mailer Asset Resolution and Manifest Generator', () => {
  const mockEntry: CalendarEntry = {
    serialId: 'VID-999',
    scheduledDate: '2026-11-01',
    slot: 1,
    status: 'PENDING',
    topic: 'What if your bones were carbon fiber?',
    targetDurationSeconds: 15,
    clips: [
      {
        clipIndex: 1,
        durationSeconds: 5,
        visualAction: 'Skeletal hand morphing to carbon weave',
        spokenLine: 'Imagine every bone replaced by woven carbon fibers.',
        sfxCue: 'Carbon weave friction sound',
      },
      {
        clipIndex: 2,
        durationSeconds: 5,
        visualAction: 'Stress test showing 10x tensile strength',
        spokenLine: 'It would take immense hydraulic pressure to fracture.',
        sfxCue: 'Hydraulic press hum',
      },
      {
        clipIndex: 3,
        durationSeconds: 5,
        visualAction: 'High leap impact absorbing zero shock',
        spokenLine: 'Landing from heights with zero bone fractures.',
        sfxCue: 'Heavy dull thud',
      },
    ],
  };

  it('should generate a comprehensive editable manifest', () => {
    const manifest = generateEditManifest(mockEntry);
    expect(manifest).toContain('VID-999');
    expect(manifest).toContain('What if your bones were carbon fiber?');
    expect(manifest).toContain('--- ACT 1 (5s) ---');
    expect(manifest).toContain('Imagine every bone replaced by woven carbon fibers.');
    expect(manifest).toContain('VID-999_Final_Render.mp4');
    expect(manifest).toContain('VID-999_Voiceover.mp3');
    expect(manifest).toContain('VID-999_Raw_Clip_01.mp4');
    expect(manifest).toContain('MOBILE EDITING TIPS');
  });

  it('should resolve manifest attachment even when media paths do not exist', () => {
    const assets = resolveEditAssets({
      serialId: 'VID-999',
      title: 'What if your bones were carbon fiber?',
      videoPath: '/tmp/nonexistent.mp4',
      entry: mockEntry,
    });

    expect(assets.manifest.filename).toBe('VID-999_Edit_Manifest.txt');
    expect(assets.manifest.content).toContain('VID-999');
    expect(assets.finalRender).toBeUndefined();
  });
});
