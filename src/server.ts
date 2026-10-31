import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { loadCalendar, saveCalendar } from './workflow.js';
import { getOutDir, resolveProjectPath } from './paths.js';
import type { CalendarEntry } from './types/calendar.js';
import {
  exportCalendarJson,
  exportCalendarCsv,
  importAndAppendCalendar,
} from './calendar-io.js';
import { spawn } from 'child_process';

const app = express();
const PORT = parseInt(process.env.DASHBOARD_PORT || '4100', 10);

app.use(express.json());
app.use('/dashboard', express.static(resolveProjectPath('public', 'dashboard')));
app.use('/out', express.static(getOutDir()));
app.use('/audio', express.static(resolveProjectPath('public', 'audio')));
app.use('/clips', express.static(resolveProjectPath('public', 'clips')));

// Redirect root to /dashboard
app.get('/', (_req: Request, res: Response): void => {
  res.redirect('/dashboard');
});

// GET /api/status - Overview stats
app.get('/api/status', (_req: Request, res: Response): void => {
  try {
    const calendar = loadCalendar();
    const total = calendar.length;
    const done = calendar.filter((c) => c.status === 'DONE').length;
    const pending = calendar.filter((c) => c.status === 'PENDING').length;
    const failed = calendar.filter((c) => c.status === 'FAILED').length;

    const nextPending = calendar.find((c) => c.status === 'PENDING');

    res.json({
      success: true,
      stats: { total, done, pending, failed },
      nextScheduled: nextPending
        ? {
            serialId: nextPending.serialId,
            title: nextPending.title || nextPending.topic,
            date: nextPending.scheduledDate,
            time: nextPending.scheduledTime,
            slot: nextPending.slotName || `Slot ${nextPending.slot}`,
          }
        : null,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /api/calendar - List all or filtered calendar entries
app.get('/api/calendar', (req: Request, res: Response): void => {
  try {
    const calendar = loadCalendar();
    const status = req.query.status as string;
    const search = (req.query.search as string)?.toLowerCase();

    let result = calendar;
    if (status && status !== 'ALL') {
      result = result.filter((c) => c.status === status);
    }
    if (search) {
      result = result.filter(
        (c) =>
          c.topic.toLowerCase().includes(search) ||
          c.title?.toLowerCase().includes(search) ||
          c.serialId.toLowerCase().includes(search)
      );
    }

    res.json({ success: true, count: result.length, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /api/calendar/export - Download calendar file as JSON or CSV
app.get('/api/calendar/export', (req: Request, res: Response): void => {
  try {
    const calendar = loadCalendar();
    const format = req.query.format as string;
    const nowStr = new Date().toISOString().split('T')[0]!;

    if (format === 'csv') {
      const csv = exportCalendarCsv(calendar);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="calendar-${nowStr}.csv"`
      );
      res.send(csv);
    } else {
      const json = exportCalendarJson(calendar);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="calendar-${nowStr}.json"`
      );
      res.send(json);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /api/calendar/import - Upload and append calendar items
app.post('/api/calendar/import', (req: Request, res: Response): void => {
  try {
    const calendar = loadCalendar();
    const body = req.body;
    let itemsToImport: Partial<CalendarEntry>[] = [];

    if (Array.isArray(body)) {
      itemsToImport = body;
    } else if (body && Array.isArray(body.items)) {
      itemsToImport = body.items;
    } else if (body && typeof body === 'object') {
      itemsToImport = [body];
    }

    if (itemsToImport.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid calendar items found to import.',
      });
      return;
    }

    const { updatedCalendar, addedItems, addedCount } = importAndAppendCalendar(
      calendar,
      itemsToImport
    );

    saveCalendar(updatedCalendar);

    res.json({
      success: true,
      message: `Successfully appended ${addedCount} new Shorts to the calendar.`,
      addedCount,
      totalCount: updatedCalendar.length,
      addedItems,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /api/calendar/:serialId - Get single entry
app.get('/api/calendar/:serialId', (req: Request, res: Response): void => {
  try {
    const calendar = loadCalendar();
    const entry = calendar.find((c) => c.serialId === req.params.serialId);
    if (!entry) {
      res.status(404).json({ success: false, error: 'Entry not found' });
      return;
    }

    const videoPath = path.join(getOutDir(), `${entry.serialId}.mp4`);
    const hasRender = fs.existsSync(videoPath);
    const audioPath = resolveProjectPath('public', 'audio', `${entry.serialId}.mp3`);
    const hasAudio = fs.existsSync(audioPath);

    res.json({
      success: true,
      data: {
        ...entry,
        hasRender,
        hasAudio,
        videoUrl: hasRender ? `/out/${entry.serialId}.mp4` : null,
        audioUrl: hasAudio ? `/audio/${entry.serialId}.mp3` : null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PUT /api/calendar/:serialId - Update an existing entry
app.put('/api/calendar/:serialId', (req: Request, res: Response): void => {
  try {
    const calendar = loadCalendar();
    const index = calendar.findIndex((c) => c.serialId === req.params.serialId);
    if (index === -1) {
      res.status(404).json({ success: false, error: 'Entry not found' });
      return;
    }

    const current = calendar[index]!;
    const updates = req.body;

    calendar[index] = {
      ...current,
      topic: updates.topic ?? current.topic,
      title: updates.title ?? current.title,
      status: updates.status ?? current.status,
      scheduledDate: updates.scheduledDate ?? current.scheduledDate,
      scheduledTime: updates.scheduledTime ?? current.scheduledTime,
      slot: updates.slot ?? current.slot,
      slotName: updates.slotName ?? current.slotName,
      targetDurationSeconds: updates.targetDurationSeconds ?? current.targetDurationSeconds,
      clips: updates.clips ?? current.clips,
    };

    saveCalendar(calendar);
    res.json({ success: true, data: calendar[index] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /api/calendar - Create a new Short in calendar
app.post('/api/calendar', (req: Request, res: Response): void => {
  try {
    const calendar = loadCalendar();
    const newEntry: CalendarEntry = req.body;

    if (!newEntry.serialId) {
      const highestNum = calendar.reduce((max, c) => {
        const num = parseInt(c.serialId.replace('VID-', ''), 10) || 0;
        return num > max ? num : max;
      }, 0);
      newEntry.serialId = `VID-${String(highestNum + 1).padStart(3, '0')}`;
    }

    if (calendar.some((c) => c.serialId === newEntry.serialId)) {
      res.status(400).json({ success: false, error: 'serialId already exists' });
      return;
    }

    newEntry.status = newEntry.status || 'PENDING';
    newEntry.targetDurationSeconds = newEntry.targetDurationSeconds || 16;
    newEntry.clips = newEntry.clips || [];

    calendar.push(newEntry);
    saveCalendar(calendar);

    res.status(201).json({ success: true, data: newEntry });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// DELETE /api/calendar/:serialId - Delete an entry
app.delete('/api/calendar/:serialId', (req: Request, res: Response): void => {
  try {
    const calendar = loadCalendar();
    const filtered = calendar.filter((c) => c.serialId !== req.params.serialId);
    if (filtered.length === calendar.length) {
      res.status(404).json({ success: false, error: 'Entry not found' });
      return;
    }

    saveCalendar(filtered);
    res.json({ success: true, message: `Deleted ${req.params.serialId}` });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Active background execution map
const activeJobs = new Map<string, { status: string; startedAt: string }>();

// POST /api/produce/:serialId - Trigger production on demand for a video
app.post('/api/produce/:serialId', (req: Request, res: Response): void => {
  const serialId = String(req.params.serialId);
  const calendar = loadCalendar();
  const entry = calendar.find((c) => c.serialId === serialId);

  if (!entry) {
    res.status(404).json({ success: false, error: 'Video not found' });
    return;
  }

  if (activeJobs.has(serialId)) {
    res.json({
      success: true,
      message: `Production for ${serialId} is already in progress.`,
      job: activeJobs.get(serialId),
    });
    return;
  }

  const agyBin = '/home/oluomachi-c-udezue/.local/bin/agy';
  const conversationId = 'fcdb013c-7946-4c00-8518-a92ebcf45cdd';
  const prompt = `Produce YouTube Short ${serialId} ("${entry.title || entry.topic}"). Generate 3D model clips via Google Flow, voiceover via Google AI Studio, assemble in Remotion, dispatch complete review package email, and mark as DONE.`;

  activeJobs.set(serialId, {
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
  });

  const child = spawn(
    agyBin,
    ['--conversation', conversationId, '-p', prompt, '--dangerously-skip-permissions'],
    {
      cwd: resolveProjectPath(),
      detached: true,
      stdio: 'ignore',
    }
  );

  child.unref();

  child.on('close', (code) => {
    if (code === 0) {
      activeJobs.set(serialId, {
        status: 'COMPLETED',
        startedAt: activeJobs.get(serialId)?.startedAt || '',
      });
    } else {
      activeJobs.set(serialId, {
        status: `FAILED (code ${code})`,
        startedAt: activeJobs.get(serialId)?.startedAt || '',
      });
    }
  });

  res.json({
    success: true,
    message: `Triggered autonomous production for ${serialId}. You will receive the full review pack in your email when ready.`,
    serialId,
  });
});

// GET /api/produce/status - Check running jobs
app.get('/api/produce/status', (_req: Request, res: Response): void => {
  res.json({
    success: true,
    activeJobs: Object.fromEntries(activeJobs.entries()),
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 YouTube Shorts Calendar Remote Dashboard running at:`);
  console.log(`   📱 Local:   http://localhost:${PORT}`);
  console.log(`   🌐 Network: http://192.168.100.2:${PORT}\n`);
});
