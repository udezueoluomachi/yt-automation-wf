import path from 'path';
import fs from 'fs';

/**
 * Universal project root resolver.
 * Searches current and parent directories for data/calendar.json or package.json.
 * Completely avoids __dirname and import.meta to guarantee 100% compatibility across
 * both CommonJS and ES Modules, tsx, ts-node, and compiled outputs.
 */
export function getProjectRoot(): string {
  const cwd = process.cwd();

  // 1. Direct check in cwd
  if (fs.existsSync(path.join(cwd, 'data', 'calendar.json'))) {
    return cwd;
  }

  // 2. Upward search for workspace root
  let currentDir = cwd;
  for (let i = 0; i < 4; i++) {
    if (
      fs.existsSync(path.join(currentDir, 'data', 'calendar.json')) ||
      (fs.existsSync(path.join(currentDir, 'package.json')) &&
        fs.existsSync(path.join(currentDir, 'data')))
    ) {
      return currentDir;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return cwd;
}

/**
 * Resolves an absolute path relative to the project root.
 */
export function resolveProjectPath(...segments: string[]): string {
  return path.resolve(getProjectRoot(), ...segments);
}

/**
 * Resolves the calendar.json path reliably.
 */
export function getCalendarPath(): string {
  if (process.env.CALENDAR_PATH && fs.existsSync(process.env.CALENDAR_PATH)) {
    return path.resolve(process.env.CALENDAR_PATH);
  }
  return resolveProjectPath('data', 'calendar.json');
}

/**
 * Resolves and ensures output directory exists.
 */
export function getOutDir(): string {
  const outDir = process.env.OUTPUT_DIR || resolveProjectPath('out');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  return outDir;
}
