import { existsSync, readdirSync, statSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BRIDGE_URL = 'http://127.0.0.1:10086/command';
const SESSION = 'flow-production';

const SCENES = [
  {
    index: 1,
    target: 'VID-031-clip1',
    prompt: 'stylized 3D CGI model, digital mannequin, Octane 3D anatomical render. Extreme macro anatomical cross-section of a stylized 3D digital mannequin wrist; metallic surface smoothly retracts with precision mechanical seams to reveal an embedded industrial blue laser diode core, miniature focusing optics, and micro copper heat sinks. Volumetric clinical lighting, crisp mechanical 3D CGI render, 9:16 vertical, zero real humans, no photo, no live action.'
  },
  {
    index: 2,
    target: 'VID-031-clip2',
    prompt: 'stylized 3D CGI model, digital mannequin, Octane 3D anatomical render. Close-up of the stylized 3D digital mannequin hand aiming its wrist at a heavy steel padlock shackle; a razor-sharp brilliant blue laser beam fires, violently melting and slicing through the red-hot glowing metal with molten sparks showering out. Cinematic sci-fi lighting, dynamic sparks, 9:16 vertical, zero real humans, no photo, no live action.'
  },
  {
    index: 3,
    target: 'VID-031-clip3',
    prompt: 'stylized 3D CGI model, digital mannequin, Octane 3D anatomical render. Macro shot of the stylized 3D digital mannequin wrist as the laser diode powers down; a protective sapphire crystal lens shutter glides smoothly into place with a mechanical iris click and watertight magnetic seal. Octane render, minimalist dark backdrop, volumetric lighting, 9:16 vertical, zero real humans, no photo, no live action.'
  }
];

const FLOW_OUT_DIR = join(homedir(), 'flow-mcp-out', 'VID-031');
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
  if (!data.ok) {
    throw new Error(`Kimi Bridge Error (${action}): ${JSON.stringify(data.error)}`);
  }
  return data.data;
}

async function evalInPage(code: string): Promise<any> {
  const res = await bridgeCall('evaluate', { code });
  return res.value;
}

async function startSceneGeneration(scene: typeof SCENES[0]): Promise<void> {
  console.log(`\n==================================================`);
  console.log(`[FLOW] Starting Scene ${scene.index}: ${scene.target}`);
  console.log(`[FLOW] Prompt: ${scene.prompt.slice(0, 90)}...`);
  console.log(`==================================================`);

  const alreadyRendering = await evalInPage(`(() => {
    const topTile = document.querySelectorAll('flow-grid-tile-container')[0];
    if (!topTile) return false;
    const label = (topTile.getAttribute('aria-label') || '').toLowerCase();
    const text = (topTile.innerText || '').toLowerCase();
    if (${scene.index} === 1 && (label.includes('laser diode') || label.includes('wrist') || text.includes('diode'))) return true;
    if (${scene.index} === 2 && (label.includes('padlock') || label.includes('slicing') || label.includes('sparks') || text.includes('padlock'))) return true;
    if (${scene.index} === 3 && (label.includes('sapphire') || label.includes('crystal') || label.includes('shutter') || text.includes('sapphire'))) return true;
    return text.includes(${JSON.stringify(scene.prompt.slice(0, 40).toLowerCase())});
  })()`);

  if (alreadyRendering) {
    console.log(`[FLOW] Scene ${scene.index} is already active/rendering in top tile.`);
    return;
  }

  await bridgeCall('send_keys', { keys: 'Escape' });
  await new Promise(r => setTimeout(r, 400));

  console.log(`[FLOW] Clicking ProseMirror...`);
  await bridgeCall('click', { selector: '.ProseMirror' });
  await new Promise(r => setTimeout(r, 500));

  console.log(`[FLOW] Filling prompt...`);
  await bridgeCall('fill', { selector: '.ProseMirror', value: scene.prompt });
  await new Promise(r => setTimeout(r, 800));

  console.log(`[FLOW] Enabling Start generation button...`);
  await evalInPage(`(() => {
    const btn = document.querySelector('button[aria-label="Start generation"]');
    if (btn) {
      btn.removeAttribute('disabled');
      btn.classList.remove('mat-mdc-button-disabled');
    }
  })()`);

  await new Promise(r => setTimeout(r, 500));

  console.log(`[FLOW] Dispatching click on Start generation...`);
  try {
    await bridgeCall('mouse_click', { selector: 'button[aria-label="Start generation"]' });
  } catch (err: any) {
    console.log(`[FLOW] Start click note: ${err.message}`);
  }
  await new Promise(r => setTimeout(r, 4000));
}

async function waitForSceneCompletion(scene: typeof SCENES[0]): Promise<void> {
  console.log(`[FLOW] Waiting for ${scene.target} to complete rendering...`);
  let hasSeenProgress = false;
  let samePercentCount = 0;
  let lastPercent = '';

  for (let wait = 0; wait < 240; wait++) {
    await new Promise(r => setTimeout(r, 2000));

    const status = await evalInPage(`(() => {
      const topTile = document.querySelectorAll('flow-grid-tile-container')[0];
      if (!topTile) return { percent: null, finished: false, text: '', isPending: true, hasMore: false };
      const text = topTile.innerText || '';
      const m = text.match(/(\\d+)%/);
      const isPending = Boolean(topTile.querySelector('flow-pending-tile'));
      const hasMore = Boolean(topTile.querySelector('button[aria-label="More options"], button[aria-label*="options"]'));
      return {
        percent: m ? m[1] + '%' : null,
        hasPercent: Boolean(m),
        isPending,
        hasMore,
        text: text.slice(0, 100).replace(/\\s+/g, ' ')
      };
    })()`);

    if (status.percent) {
      hasSeenProgress = true;
      if (status.percent === lastPercent) {
        samePercentCount++;
      } else {
        samePercentCount = 0;
        lastPercent = status.percent;
      }
      process.stdout.write(`\r[FLOW] Progress: ${status.percent} (${status.text.slice(0, 45)}...)   `);
    }

    // If stuck at 87% or any percent for more than 25 checks (~50s), reload tab to sync state
    if (samePercentCount >= 25) {
      console.log(`\n[FLOW] Progress unchanged at ${lastPercent} for 50s, reloading tab to sync state...`);
      await bridgeCall('reload');
      await new Promise(r => setTimeout(r, 6000));
      samePercentCount = 0;
      continue;
    }

    // If no longer pending and hasMore options is available
    if (!status.isPending && status.hasMore) {
      console.log(`\n[FLOW] ${scene.target} finished rendering!`);
      return;
    }
  }

  throw new Error(`Timed out waiting for ${scene.target} to complete.`);
}

async function downloadTopClip(targetName: string): Promise<string> {
  console.log(`[FLOW] Triggering direct in-page download for ${targetName}...`);

  // Start network capture
  await bridgeCall('network', { cmd: 'start' });

  // Check if we are on editor page or project root
  const curUrl = await evalInPage('location.href');
  if (curUrl && curUrl.includes('/edit/')) {
    console.log(`[FLOW] Downloading from editor view...`);
    await evalInPage(`(() => {
      const btn = document.querySelector('button[aria-label="Download media"]');
      if (btn) btn.click();
    })()`);
    await new Promise(r => setTimeout(r, 1500));
    await evalInPage(`(() => {
      const items = Array.from(document.querySelectorAll('.mat-mdc-menu-item, [role="menuitem"]'));
      const item720 = items.find(e => /720p/i.test(e.innerText));
      if (item720) item720.click();
    })()`);
  } else {
    // Project root grid view
    await bridgeCall('send_keys', { keys: 'Escape' });
    await new Promise(r => setTimeout(r, 600));

    await evalInPage(`(() => {
      const topTile = document.querySelectorAll('flow-grid-tile-container')[0];
      if (topTile) {
        topTile.scrollIntoView({ behavior: 'instant', block: 'center' });
        topTile.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        topTile.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        const moreBtn = topTile.querySelector('button[aria-label="More options"], button[aria-label*="options"]');
        if (moreBtn) moreBtn.click();
      }
    })()`);

    await new Promise(r => setTimeout(r, 1500));

    // Click Download menu item
    await evalInPage(`(() => {
      const items = [...document.querySelectorAll('[role="menuitem"], .mat-mdc-menu-item')];
      const dl = items.find(e => /download/i.test(e.innerText));
      if (dl) {
        dl.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        dl.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        dl.click();
      }
    })()`);

    await new Promise(r => setTimeout(r, 2000));

    // Click 720p / Original size submenu item
    await evalInPage(`(() => {
      const items = [...document.querySelectorAll('[role="menuitem"], .mat-mdc-menu-item')];
      const orig = items.find(e => /720p|original/i.test(e.innerText));
      if (orig) orig.click();
    })()`);
  }

  // Wait for flow-content video URL in network requests
  console.log(`[FLOW] Capturing signed video URL from network...`);
  let videoUrl = '';
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const list = await bridgeCall('network', { cmd: 'list' });
    const req = list.requests?.find((r: any) => r.url.includes('flow-content.google/video') || (r.url.includes('googleusercontent.com') && r.url.includes('video')));
    if (req) {
      videoUrl = req.url;
      console.log(`[FLOW] Found video URL: ${videoUrl.slice(0, 80)}...`);
      break;
    }
  }

  if (!videoUrl) {
    throw new Error(`Failed to capture video URL for ${targetName}`);
  }

  // Fetch in-page and convert to base64
  console.log(`[FLOW] Fetching video in-page and transferring buffer...`);
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
    throw new Error(`Failed to fetch video data in-page for ${targetName}`);
  }

  const base64Data = b64DataUri.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  const tempPath = join(FLOW_OUT_DIR, `${targetName}_raw.mp4`);
  writeFileSync(tempPath, buffer);
  console.log(`[FLOW] Successfully downloaded ${targetName}: ${buffer.length} bytes`);
  return tempPath;
}

async function main() {
  console.log('[FLOW] Connecting to Flow tab via Kimi WebBridge...');
  
  const browserTabs = await bridgeCall('list_browser_tabs');
  const flowTab = browserTabs.tabs?.slice().reverse().find((t: any) => t.url.includes('flow.google.com') && t.title && t.title.includes('Google Flow'));
  if (!flowTab) {
    throw new Error('Google Flow tab not found in active browser!');
  }

  await bridgeCall('attach_tab', { tabId: flowTab.tabId });
  console.log(`[FLOW] Attached to tab: ${flowTab.tabId} (${flowTab.title})`);

  // Dismiss any changelog modal / dialog if present
  await evalInPage(`(() => {
    const btn = document.querySelector(".mat-mdc-dialog-container button.flow-button-primary");
    if (btn) {
      btn.removeAttribute("disabled");
      btn.classList.remove("mat-mdc-button-disabled");
      btn.click();
    }
  })()`);
  await new Promise(r => setTimeout(r, 1000));

  // Ensure on project root
  const curUrl = await evalInPage('location.href');
  if (curUrl && curUrl.includes('/edit/')) {
    console.log('[FLOW] Currently in editor view, returning to project root...');
    await bridgeCall('navigate', { url: 'https://flow.google.com/project/842eb026-49ee-4e4a-9d29-2d7fb44628b0' });
    await new Promise(r => setTimeout(r, 3500));
  }

  for (const scene of SCENES) {
    const finalClipPath = join(CLIPS_DIR, `${scene.target}.mp4`);
    if (existsSync(finalClipPath) && statSync(finalClipPath).size > 1000000) {
      console.log(`[FLOW] ${scene.target}.mp4 already exists (${statSync(finalClipPath).size} bytes), skipping.`);
      continue;
    }

    // Start generation
    await startSceneGeneration(scene);

    // Wait for render to finish
    await waitForSceneCompletion(scene);

    // Download clip via network capture & in-page buffer
    const downloadedPath = await downloadTopClip(scene.target);
    console.log(`[FLOW] Downloaded to: ${downloadedPath} (${statSync(downloadedPath).size} bytes)`);

    const flowOutPath = join(FLOW_OUT_DIR, `scene-0${scene.index}.mp4`);
    copyFileSync(downloadedPath, flowOutPath);
    copyFileSync(downloadedPath, finalClipPath);
    copyFileSync(downloadedPath, join(CLIPS_DIR, `clip${scene.index}.mp4`));

    console.log(`[FLOW] Staged to ${finalClipPath} and clip${scene.index}.mp4`);
    console.log(`[FLOW] Pausing 6 seconds before next scene...`);
    await new Promise(r => setTimeout(r, 6000));
  }

  console.log('\n[FLOW] All scenes generated, downloaded, and staged successfully!');
}

main().catch(err => {
  console.error('[FLOW] Fatal error:', err);
  process.exit(1);
});
