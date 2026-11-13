import { readdirSync, statSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BRIDGE_URL = 'http://127.0.0.1:10086/command';
const SESSION = 'yt-production';
const DOWNLOADS_DIR = join(homedir(), 'Downloads');
const CLIPS_DIR = join(process.cwd(), 'public', 'clips');

async function bridgeCall(action: string, args: Record<string, any> = {}): Promise<any> {
  const res = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args, session: SESSION })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Bridge Error (${action}): ${JSON.stringify(data.error)}`);
  return data.data;
}

async function evalInPage(code: string): Promise<any> {
  const res = await bridgeCall('evaluate', { code });
  return res.value;
}

async function main() {
  const beforeDownloads = new Set(readdirSync(DOWNLOADS_DIR));
  console.log('[DL] Dismissing any open popups with Escape...');
  await bridgeCall('send_keys', { keys: 'Escape' });
  await new Promise(r => setTimeout(r, 600));

  console.log('[DL] Scrolling top tile into view and clicking More options...');
  const clickMore = await evalInPage(`(() => {
    const topTile = document.querySelectorAll('flow-grid-tile-container')[0];
    if (!topTile) return { error: 'No top tile' };
    topTile.scrollIntoView({ behavior: 'instant', block: 'center' });
    const moreBtn = topTile.querySelector('button[aria-label="More options"]');
    if (!moreBtn) return { error: 'No more button' };
    moreBtn.click();
    return { success: true };
  })()`);
  console.log('[DL] Click more result:', clickMore);

  await new Promise(r => setTimeout(r, 1500));

  console.log('[DL] Inspecting menu items...');
  const menuItems = await evalInPage(`(() => {
    const items = [...document.querySelectorAll('[role="menuitem"], .mat-mdc-menu-item')];
    return items.map(i => i.innerText.trim());
  })()`);
  console.log('[DL] Available menu items:', menuItems);

  console.log('[DL] Clicking Download menu item...');
  const clickDl = await evalInPage(`(() => {
    const items = [...document.querySelectorAll('[role="menuitem"], .mat-mdc-menu-item')];
    const dl = items.find(e => /download/i.test(e.innerText));
    if (dl) {
      dl.click();
      return { clicked: true, text: dl.innerText };
    }
    return { clicked: false };
  })()`);
  console.log('[DL] Click download result:', clickDl);

  await new Promise(r => setTimeout(r, 2000));

  console.log('[DL] Inspecting submenu items...');
  const subItems = await evalInPage(`(() => {
    const items = [...document.querySelectorAll('[role="menuitem"], .mat-mdc-menu-item')];
    return items.map(i => i.innerText.trim());
  })()`);
  console.log('[DL] Available submenu items:', subItems);

  console.log('[DL] Clicking 720p / Original size option...');
  const clickSub = await evalInPage(`(() => {
    const items = [...document.querySelectorAll('[role="menuitem"], .mat-mdc-menu-item')];
    const orig = items.find(e => /720p|original/i.test(e.innerText));
    if (orig) {
      orig.click();
      return { clicked: true, text: orig.innerText };
    }
    return { clicked: false };
  })()`);
  console.log('[DL] Click submenu result:', clickSub);

  console.log('[DL] Waiting for downloaded file in ~/Downloads...');
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const after = readdirSync(DOWNLOADS_DIR);
    for (const f of after) {
      if (!beforeDownloads.has(f) && !f.endsWith('.crdownload') && f.endsWith('.mp4')) {
        const fullPath = join(DOWNLOADS_DIR, f);
        console.log(`[DL] Found newly downloaded clip: ${fullPath} (${statSync(fullPath).size} bytes)`);
        
        const finalClipPath = join(CLIPS_DIR, 'VID-023-clip3.mp4');
        copyFileSync(fullPath, finalClipPath);
        copyFileSync(fullPath, join(CLIPS_DIR, 'clip3.mp4'));
        console.log(`[DL] Staged to ${finalClipPath} and clip3.mp4`);
        return;
      }
    }
  }

  throw new Error('Download timed out');
}

main().catch(err => {
  console.error('[DL] Fatal error:', err);
  process.exit(1);
});
