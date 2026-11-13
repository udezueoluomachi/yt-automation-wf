import { readdirSync, statSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const BRIDGE_URL = 'http://127.0.0.1:10086/command';
const SESSION = 'yt-production';
const DOWNLOADS_DIR = join(homedir(), 'Downloads');
const FLOW_OUT_DIR = join(homedir(), 'flow-mcp-out', 'VID-021');
const CLIPS_DIR = join(process.cwd(), 'public', 'clips');

async function bridgeCall(action: string, args: Record<string, any> = {}): Promise<any> {
  const res = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args, session: SESSION })
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Kimi Bridge Error (${action}): ${JSON.stringify(data.error)}`);
  }
  return data.data;
}

async function evalInPage(code: string): Promise<any> {
  const res = await bridgeCall('evaluate', { code });
  return res.value;
}

async function main() {
  console.log('[FLOW] Waiting for Scene 3 to complete rendering...');
  let hasSeenProgress = false;

  for (let wait = 0; wait < 240; wait++) {
    await new Promise(r => setTimeout(r, 2000));

    const status = await evalInPage(`(() => {
      const topTile = document.querySelectorAll('flow-grid-tile-container')[0];
      if (!topTile) return { percent: null, finished: false, text: '' };
      const text = topTile.innerText || '';
      const m = text.match(/(\\d+)%/);
      const hasVideo = Boolean(topTile.querySelector('flow-video-tile, video, [data-icon="play_circle"]'));
      const hasSpinner = Boolean(topTile.querySelector('.spinner, [role="progressbar"]'));
      return {
        percent: m ? m[1] + '%' : null,
        hasPercent: Boolean(m),
        hasVideo,
        hasSpinner,
        text: text.slice(0, 100).replace(/\\s+/g, ' ')
      };
    })()`);

    if (status.percent) {
      hasSeenProgress = true;
      process.stdout.write(`\r[FLOW] Scene 3 Progress: ${status.percent} (${status.text.slice(0, 45)}...)   `);
    }

    if (hasSeenProgress && !status.hasPercent && status.hasVideo && !status.hasSpinner) {
      console.log(`\n[FLOW] Scene 3 finished rendering!`);
      break;
    }
  }

  // Trigger download of Scene 3
  console.log(`[FLOW] Triggering download of Scene 3...`);
  const beforeDownloads = new Set(readdirSync(DOWNLOADS_DIR));

  await bridgeCall('send_keys', { keys: 'Escape' });
  await new Promise(r => setTimeout(r, 500));

  // Click More options on top tile
  await evalInPage(`(() => {
    const topTile = document.querySelectorAll('flow-grid-tile-container')[0];
    if (topTile) {
      topTile.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const moreBtn = topTile.querySelector('button[aria-label="More options"]');
      if (moreBtn) moreBtn.click();
    }
  })()`);

  await new Promise(r => setTimeout(r, 1200));

  // Click Download in menu
  await evalInPage(`(() => {
    const items = [...document.querySelectorAll('[role="menuitem"], .mat-mdc-menu-item')];
    const dl = items.find(e => /download/i.test(e.innerText));
    if (dl) dl.click();
  })()`);

  await new Promise(r => setTimeout(r, 1200));

  // Click 720p / Original size in submenu
  await evalInPage(`(() => {
    const items = [...document.querySelectorAll('[role="menuitem"], .mat-mdc-menu-item')];
    const orig = items.find(e => /720p|original/i.test(e.innerText));
    if (orig) orig.click();
  })()`);

  console.log(`[FLOW] Waiting for Scene 3 MP4 download...`);
  let downloadedPath = '';
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const after = readdirSync(DOWNLOADS_DIR);
    for (const f of after) {
      if (!beforeDownloads.has(f) && !f.endsWith('.crdownload') && f.endsWith('.mp4')) {
        downloadedPath = join(DOWNLOADS_DIR, f);
        break;
      }
    }
    if (downloadedPath) break;
  }

  if (!downloadedPath) {
    throw new Error('Scene 3 download timed out!');
  }

  console.log(`[FLOW] Scene 3 downloaded to: ${downloadedPath} (${statSync(downloadedPath).size} bytes)`);
  copyFileSync(downloadedPath, join(FLOW_OUT_DIR, 'scene-03.mp4'));
  copyFileSync(downloadedPath, join(CLIPS_DIR, 'VID-021-clip3.mp4'));
  copyFileSync(downloadedPath, join(CLIPS_DIR, 'clip3.mp4'));

  // Optimize all 3 clips with ffmpeg
  console.log(`\n[FFMPEG] Optimizing all 3 raw clips to 1080x1920 30fps (crf 26)...`);
  for (let i = 1; i <= 3; i++) {
    const p = join(CLIPS_DIR, `VID-021-clip${i}.mp4`);
    const opt = join(CLIPS_DIR, `VID-021-clip${i}_opt.mp4`);
    console.log(`Optimizing Clip ${i}: ${p}...`);
    execSync(`ffmpeg -y -i "${p}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -r 30 -c:v libx264 -crf 26 -preset fast -an "${opt}"`, { stdio: 'inherit' });
    copyFileSync(opt, p);
    copyFileSync(opt, join(CLIPS_DIR, `clip${i}.mp4`));
    console.log(`Clip ${i} optimized: ${statSync(opt).size} bytes`);
  }

  console.log(`\n🎉 All 3 raw clips for VID-021 are fully generated, downloaded, and optimized!`);
}

main().catch(err => {
  console.error('[FINISH] Error:', err);
  process.exit(1);
});
