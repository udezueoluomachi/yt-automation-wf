import dns from 'dns';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { loadCalendar } from './workflow.js';
import { resolveProjectPath } from './paths.js';

dotenv.config();

const LOG_FILE = resolveProjectPath('cron.log');
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 180000; // 3 minutes

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf-8');
  } catch {
    // Ignore log write failure
  }
}

/**
 * Checks internet connectivity across all OSes via DNS lookup.
 */
async function waitForNetwork(maxAttempts = 12, delayMs = 5000): Promise<boolean> {
  log('Checking internet connectivity...');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await dns.promises.lookup('google.com');
      log('Internet connectivity confirmed.');
      return true;
    } catch {
      log(`Waiting for network connection (attempt ${attempt}/${maxAttempts})...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

/**
 * Checks if Kimi WebBridge is responding at 127.0.0.1:10086.
 */
async function ensureKimiWebBridge(): Promise<void> {
  try {
    // Any HTTP response (even 404) means the daemon is up and listening
    await fetch('http://127.0.0.1:10086/', { signal: AbortSignal.timeout(2000) });
    return;
  } catch {
    // Bridge not responding, attempt to launch
  }

  log('Kimi WebBridge not responding. Launching daemon...');
  const isWindows = process.platform === 'win32';
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const defaultBin = isWindows
    ? path.join(homeDir, '.kimi-webbridge', 'bin', 'kimi-webbridge.cmd')
    : path.join(homeDir, '.kimi-webbridge', 'bin', 'kimi-webbridge');
  const bin = process.env.KIMI_BIN_PATH || (fs.existsSync(defaultBin) ? defaultBin : 'kimi-webbridge');

  try {
    const child = spawn(bin, ['run', '--addr', '127.0.0.1:10086'], {
      detached: !isWindows,
      shell: isWindows,
      stdio: 'ignore',
    });
    child.on('error', (err) => {
      log(`Warning: Failed to auto-launch Kimi WebBridge: ${err.message}`);
    });
    child.unref();
    await new Promise((r) => setTimeout(r, 4000));
  } catch (err) {
    log(`Warning: Failed to auto-launch Kimi WebBridge: ${(err as Error).message}`);
  }
}

/**
 * Spawns Antigravity CLI and returns exit code.
 */
function runAgy(serialId: string, topic: string, conversationId: string): Promise<number> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const agyBin = process.env.AGY_BIN_PATH || (isWindows ? 'agy.cmd' : 'agy');
    const prompt = `Produce YouTube Short ${serialId} ("${topic}"). Generate 3D model clips via Google Flow, voiceover via Google AI Studio, assemble in Remotion, dispatch complete review package email, and mark as DONE.`;

    const args = ['--conversation', conversationId, '-p', prompt, '--dangerously-skip-permissions'];

    log(`Spawning ${agyBin} for task ${serialId}...`);
    const child = spawn(agyBin, args, {
      cwd: resolveProjectPath(),
      shell: isWindows,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (d) => {
      fs.appendFileSync(LOG_FILE, d.toString(), 'utf-8');
    });

    child.stderr?.on('data', (d) => {
      fs.appendFileSync(LOG_FILE, d.toString(), 'utf-8');
    });

    child.on('close', (code) => {
      resolve(code ?? 1);
    });

    child.on('error', (err) => {
      log(`Failed to start ${agyBin}: ${err.message}`);
      resolve(1);
    });
  });
}

/**
 * Cross-platform production job runner.
 */
export async function runProductionJob(): Promise<void> {
  log('==================================================');
  log('Starting cross-platform production job trigger...');

  // 1. Network check
  const hasNet = await waitForNetwork();
  if (!hasNet) {
    log('ERROR: Network offline after 60 seconds. Aborting run.');
    process.exit(1);
  }

  // 2. Kimi WebBridge check
  await ensureKimiWebBridge();

  // 3. Inspect calendar for due task
  const calendar = loadCalendar();
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]!;
  const timeStr = now.toTimeString().slice(0, 5);

  const dueTask = calendar.find(
    (t) =>
      t.status === 'PENDING' &&
      (t.scheduledDate < dateStr ||
        (t.scheduledDate === dateStr && (t.scheduledTime || '00:00') <= timeStr))
  );

  if (!dueTask) {
    log('No pending task due at this time. Exiting cleanly.');
    process.exit(0);
  }

  const conversationId = process.env.AGY_CONVERSATION_ID;
  if (!conversationId) {
    log('ERROR: AGY_CONVERSATION_ID is not set in .env. Exiting.');
    process.exit(1);
  }

  const title = dueTask.title || dueTask.topic;
  log(`Found due task: [${dueTask.serialId}] "${title}". Starting execution loop...`);

  // 4. Retry loop with exponential backoff
  let attempt = 1;
  let success = false;

  while (attempt <= MAX_RETRIES) {
    log(`Attempt ${attempt} of ${MAX_RETRIES}...`);
    const exitCode = await runAgy(dueTask.serialId, title, conversationId);

    if (exitCode === 0) {
      log(`Production job succeeded on attempt ${attempt}.`);
      success = true;
      break;
    }

    log(`Attempt ${attempt} failed with exit code ${exitCode}.`);
    if (attempt < MAX_RETRIES) {
      log(`Waiting ${RETRY_DELAY_MS / 1000} seconds before retry...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
    attempt++;
  }

  if (!success) {
    log(`All ${MAX_RETRIES} attempts failed for task ${dueTask.serialId}.`);
    process.exit(1);
  }
}

// Auto-run if executed directly
if (process.argv[1]?.includes('runner')) {
  runProductionJob().catch((err) => {
    log(`Fatal runner exception: ${(err as Error).message}`);
    process.exit(1);
  });
}
