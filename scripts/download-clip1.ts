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

async function downloadClip1() {
  console.log('[CLIP 1] Starting network capture...');
  await bridgeCall('network', { cmd: 'start' });

  console.log('[CLIP 1] Clicking Download media button if menu is not open...');
  const menuOpen = await evalInPage(`(() => {
    return document.querySelectorAll('.mat-mdc-menu-item, [role="menuitem"]').length > 0;
  })()`);

  if (!menuOpen) {
    await bridgeCall('click', { selector: 'button[aria-label="Download media"]' });
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('[CLIP 1] Clicking 720p / Original size...');
  const clicked720 = await evalInPage(`(() => {
    const items = [...document.querySelectorAll('[role="menuitem"], .mat-mdc-menu-item')];
    const orig = items.find(e => /720p|original/i.test(e.innerText));
    if (orig) {
      orig.click();
      return orig.innerText.replace(/\\s+/g, ' ');
    }
    return null;
  })()`);
  console.log(`[CLIP 1] Clicked 720p item: ${clicked720}`);

  console.log('[CLIP 1] Capturing signed video URL from network...');
  let videoUrl = '';
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const list = await bridgeCall('network', { cmd: 'list' });
    const req = list.requests?.find((r: any) => r.url.includes('flow-content.google/video') || (r.url.includes('googleusercontent.com') && r.url.includes('video')));
    if (req) {
      videoUrl = req.url;
      console.log(`[CLIP 1] Found video URL: ${videoUrl.slice(0, 80)}...`);
      break;
    }
  }

  if (!videoUrl) {
    const list = await bridgeCall('network', { cmd: 'list' });
    console.log('Available network requests:', list.requests?.map((r: any) => r.url.slice(0, 80)));
    throw new Error('Failed to capture video URL for Clip 1');
  }

  console.log('[CLIP 1] Fetching video buffer in-page...');
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

  if (!b64DataUri || !b64DataUri.startsWith('data:')) {
    throw new Error('Failed to fetch video data in-page for Clip 1');
  }

  const base64Data = b64DataUri.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  const tempPath = join(FLOW_OUT_DIR, 'VID-028-clip1_raw.mp4');
  const finalClipPath = join(CLIPS_DIR, 'VID-028-clip1.mp4');
  writeFileSync(tempPath, buffer);
  copyFileSync(tempPath, finalClipPath);
  copyFileSync(tempPath, join(CLIPS_DIR, 'clip1.mp4'));
  console.log(`[CLIP 1] SUCCESS! Saved ${finalClipPath}: ${buffer.length} bytes`);
}

downloadClip1().catch(err => {
  console.error('[CLIP 1] Error:', err);
  process.exit(1);
});
