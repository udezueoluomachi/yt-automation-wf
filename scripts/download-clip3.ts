import { writeFileSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const BRIDGE_URL = 'http://127.0.0.1:10086/command';
const SESSION = 'flow-production';
const FLOW_OUT_DIR = join(homedir(), 'flow-mcp-out', 'VID-028');
const CLIPS_DIR = join(process.cwd(), 'public', 'clips');
mkdirSync(FLOW_OUT_DIR, { recursive: true });
mkdirSync(CLIPS_DIR, { recursive: true });

async function bridgeCall(action: string, args: Record<string, any> = {}): Promise<any> {
  const res = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args, session: SESSION })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Kimi error: ${JSON.stringify(data.error)}`);
  return data.data;
}

async function evalInPage(code: string): Promise<any> {
  const res = await bridgeCall('evaluate', { code });
  return res.value;
}

async function main() {
  const tabs = await bridgeCall('list_browser_tabs');
  const flowTab = tabs.tabs?.slice().reverse().find((t: any) => t.url.includes('flow.google.com') && t.title && t.title.includes('Google Flow'));
  if (!flowTab) throw new Error('No Flow tab found');
  await bridgeCall('attach_tab', { tabId: flowTab.tabId });
  console.log(`[CLIP 3] Attached to tab: ${flowTab.tabId} (${flowTab.title})`);

  // Start network capture
  await bridgeCall('network', { cmd: 'start' });

  // Check if we are on editor page or project root
  const curUrl = await evalInPage('location.href');
  console.log('[CLIP 3] Current URL:', curUrl);

  if (!curUrl.includes('/edit/')) {
    console.log('[CLIP 3] On project root, clicking top tile to open editor...');
    await bridgeCall('click', { selector: 'flow-grid-tile-container' });
    await new Promise(r => setTimeout(r, 2500));
  }

  // Now in editor view, click "Download media" button
  console.log('[CLIP 3] Clicking Download media button in editor view...');
  await evalInPage(`(() => {
    const btn = document.querySelector('button[aria-label="Download media"]');
    if (btn) btn.click();
  })()`);
  await new Promise(r => setTimeout(r, 1500));

  // Click 720p Original size
  console.log('[CLIP 3] Clicking 720p / Original size...');
  const clicked = await evalInPage(`(() => {
    const items = Array.from(document.querySelectorAll('.mat-mdc-menu-item, [role="menuitem"]'));
    const item720 = items.find(e => /720p/i.test(e.innerText));
    if (item720) {
      item720.click();
      return item720.innerText.replace(/\\s+/g, ' ');
    }
    return null;
  })()`);
  console.log('[CLIP 3] Clicked menu item:', clicked);

  // Capture video URL
  console.log('[CLIP 3] Capturing signed video URL from network...');
  let videoUrl = '';
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const list = await bridgeCall('network', { cmd: 'list' });
    const req = list.requests?.find((r: any) => r.url.includes('flow-content.google/video') || (r.url.includes('googleusercontent.com') && r.url.includes('video')));
    if (req) {
      videoUrl = req.url;
      console.log(`[CLIP 3] Found video URL: ${videoUrl.slice(0, 80)}...`);
      break;
    }
  }

  if (!videoUrl) {
    const list = await bridgeCall('network', { cmd: 'list' });
    console.log('Available network requests:', list.requests?.map((r: any) => r.url.slice(0, 80)));
    throw new Error('Failed to capture video URL for Clip 3');
  }

  console.log('[CLIP 3] Fetching video in-page and transferring buffer...');
  const b64DataUri = await evalInPage(`(async () => {
    const res = await fetch(${JSON.stringify(videoUrl)});
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  })()`);

  if (!b64DataUri || typeof b64DataUri !== 'string') {
    throw new Error('Failed to fetch video data in-page for Clip 3');
  }

  const base64Data = b64DataUri.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  const tempPath = join(FLOW_OUT_DIR, 'VID-028-clip3_raw.mp4');
  const finalClipPath = join(CLIPS_DIR, 'VID-028-clip3.mp4');
  writeFileSync(tempPath, buffer);
  copyFileSync(tempPath, finalClipPath);
  copyFileSync(tempPath, join(CLIPS_DIR, 'clip3.mp4'));
  console.log(`[CLIP 3] SUCCESS! Saved ${finalClipPath}: ${buffer.length} bytes`);
}

main().catch(err => {
  console.error('[CLIP 3] Fatal:', err);
  process.exit(1);
});
