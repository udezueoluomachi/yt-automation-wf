import { existsSync, readdirSync, statSync, copyFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const BRIDGE_URL = 'http://127.0.0.1:10086/command';
const SESSION = 'yt-production';

const SCENES = [
  {
    index: 1,
    target: 'VID-021-clip1',
    promptSnippet: 'Extreme macro anatomical cross-section push-in of a stylized 3D digital mannequin nasal cavity',
    prompt: 'stylized 3D CGI model, digital mannequin, Octane 3D anatomical render. Extreme macro anatomical cross-section push-in of a stylized 3D digital mannequin nasal cavity and skull profile. Intricate glowing sapphire-blue micro-sensors and miniature mass spectrometer titanium gas analyzer hardware wired along the olfactory nerve pathways, pulsing with holographic data streams. Medical volumetric studio rim lighting, high-end 3D render, zero real humans, no photo, no live action.'
  },
  {
    index: 2,
    target: 'VID-021-clip2',
    promptSnippet: 'Medium shot of a stylized 3D digital mannequin standing in an abandoned dark industrial room',
    prompt: 'stylized 3D CGI model, digital mannequin, Octane 3D anatomical render. Medium shot of a stylized 3D digital mannequin standing in an abandoned dark industrial room filled with eerie glowing green toxic vapor fumes. A glowing amber holographic augmented reality HUD floats before the mannequin eyes displaying live chemical molecular readouts: CO 850 PPM TOXIC DETECTED. High-end 3D render, zero real humans, no photo, no live action.'
  },
  {
    index: 3,
    target: 'VID-021-clip3',
    promptSnippet: 'Close-up slow-motion macro shot of the stylized 3D digital mannequin nostrils and airway',
    prompt: 'stylized 3D CGI model, digital mannequin, Octane 3D anatomical render. Close-up slow-motion macro shot of the stylized 3D digital mannequin nostrils and airway as internal titanium micro-filter shutter vents snap shut with an airtight hermetic mechanical seal, completely blocking the green toxic vapor outside while the mannequin remains calm and protected. High-end 3D render, zero real humans, no photo, no live action.'
  }
];

const DOWNLOADS_DIR = join(homedir(), 'Downloads');
const FLOW_OUT_DIR = join(homedir(), 'flow-mcp-out', 'VID-021');
const CLIPS_DIR = join(process.cwd(), 'public', 'clips');

mkdirSync(DOWNLOADS_DIR, { recursive: true });
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

async function waitForSceneCompletion(scene: typeof SCENES[0]): Promise<void> {
  console.log(`[FLOW] Waiting for ${scene.target} to complete rendering...`);
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
      process.stdout.write(`\r[FLOW] Progress: ${status.percent} (${status.text.slice(0, 45)}...)   `);
    }

    // Once we've seen progress, when percent disappears and video exists, it's finished!
    if (hasSeenProgress && !status.hasPercent && status.hasVideo && !status.hasSpinner) {
      console.log(`\n[FLOW] ${scene.target} finished rendering!`);
      return;
    }
  }

  throw new Error(`Timed out waiting for ${scene.target} to complete.`);
}

async function downloadTopClip(targetName: string, beforeDownloads: Set<string>): Promise<string> {
  console.log(`[FLOW] Triggering download for ${targetName}...`);

  await bridgeCall('send_keys', { keys: 'Escape' });
  await new Promise(r => setTimeout(r, 500));

  // Method 1: More options on top tile
  await evalInPage(`(() => {
    const topTile = document.querySelectorAll('flow-grid-tile-container')[0];
    if (topTile) {
      topTile.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const moreBtn = topTile.querySelector('button[aria-label="More options"]');
      if (moreBtn) moreBtn.click();
    }
  })()`);

  await new Promise(r => setTimeout(r, 1200));

  await evalInPage(`(() => {
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    const dl = items.find(e => /download/i.test(e.innerText));
    if (dl) dl.click();
  })()`);

  await new Promise(r => setTimeout(r, 1200));

  await evalInPage(`(() => {
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    const orig = items.find(e => /original|720p/i.test(e.innerText));
    if (orig) orig.click();
  })()`);

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const after = readdirSync(DOWNLOADS_DIR);
    for (const f of after) {
      if (!beforeDownloads.has(f) && !f.endsWith('.crdownload') && f.endsWith('.mp4')) {
        return join(DOWNLOADS_DIR, f);
      }
    }
  }

  // Fallback: editor view
  console.log(`[FLOW] Method 1 did not trigger download. Falling back to editor view...`);
  await bridgeCall('send_keys', { keys: 'Escape' });
  await new Promise(r => setTimeout(r, 500));

  await evalInPage(`(() => {
    const topTile = document.querySelectorAll('flow-grid-tile-container')[0];
    if (topTile) {
      const thumb = topTile.querySelector('.thumbnail, img, flow-video-tile');
      if (thumb) thumb.click();
    }
  })()`);

  await new Promise(r => setTimeout(r, 3000));

  await evalInPage(`(() => {
    const dlBtn = document.querySelector('button[aria-label="Download media"], button[aria-label="Download"]');
    if (dlBtn) dlBtn.click();
  })()`);

  await new Promise(r => setTimeout(r, 1200));

  await evalInPage(`(() => {
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    const orig = items.find(e => /original|720p/i.test(e.innerText));
    if (orig) orig.click();
  })()`);

  for (let i = 0; i < 35; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const after = readdirSync(DOWNLOADS_DIR);
    for (const f of after) {
      if (!beforeDownloads.has(f) && !f.endsWith('.crdownload') && f.endsWith('.mp4')) {
        return join(DOWNLOADS_DIR, f);
      }
    }
  }

  // Return to root
  await evalInPage(`(() => {
    const backBtn = document.querySelector('button[aria-label*="Back" i], button[aria-label="Home"]');
    if (backBtn) backBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 2000));

  throw new Error(`Failed to download ${targetName}`);
}

async function startSceneGeneration(scene: typeof SCENES[0]): Promise<void> {
  console.log(`\n==================================================`);
  console.log(`[FLOW] Starting Scene ${scene.index}: ${scene.target}`);
  console.log(`[FLOW] Prompt: ${scene.prompt.slice(0, 90)}...`);
  console.log(`==================================================`);

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

  console.log(`[FLOW] Dispatching mouse_click on Start generation...`);
  await bridgeCall('mouse_click', { selector: 'button[aria-label="Start generation"]' });
  await new Promise(r => setTimeout(r, 5000));
}

async function main() {
  console.log('[FLOW] Connecting to Flow tab via Kimi WebBridge...');
  
  const browserTabs = await bridgeCall('list_browser_tabs');
  const flowTab = browserTabs.tabs?.find((t: any) => t.url.includes('flow.google.com'));
  if (!flowTab) {
    throw new Error('Google Flow tab not found in active browser!');
  }

  await bridgeCall('attach_tab', { tabId: flowTab.tabId });
  console.log(`[FLOW] Attached to tab: ${flowTab.tabId} (${flowTab.title})`);

  // Ensure on project root
  const curUrl = await evalInPage('location.href');
  if (curUrl && curUrl.includes('/edit/')) {
    console.log('[FLOW] Currently in editor view, returning to project root...');
    await bridgeCall('navigate', { url: 'https://flow.google.com/project/842eb026-49ee-4e4a-9d29-2d7fb44628b0' });
    await new Promise(r => setTimeout(r, 3500));
  }

  for (const scene of SCENES) {
    const finalClipPath = join(CLIPS_DIR, `${scene.target}.mp4`);

    // For Scene 1, we already generated and verified it earlier
    if (scene.index === 1 && existsSync(finalClipPath) && statSync(finalClipPath).size > 1000000) {
      console.log(`[FLOW] Scene 1 (${scene.target}.mp4) is already verified on disk, skipping.`);
      continue;
    }

    const beforeDownloads = new Set(readdirSync(DOWNLOADS_DIR));

    // Check if this scene is already rendering on the top tile
    const topTileInfo = await evalInPage(`(() => {
      const topTile = document.querySelectorAll('flow-grid-tile-container')[0];
      const text = topTile?.innerText || '';
      const m = text.match(/(\\d+)%/);
      return {
        text: text.slice(0, 100).replace(/\\s+/g, ' '),
        hasPercent: Boolean(m)
      };
    })()`);

    if (scene.index === 2 && topTileInfo?.hasPercent) {
      console.log(`[FLOW] Scene 2 is already rendering in top tile (${topTileInfo.text}), attaching...`);
    } else {
      await startSceneGeneration(scene);
    }

    // Wait for render to finish
    await waitForSceneCompletion(scene);

    // Download clip
    const downloadedPath = await downloadTopClip(scene.target, beforeDownloads);
    console.log(`[FLOW] Downloaded to: ${downloadedPath} (${statSync(downloadedPath).size} bytes)`);

    const flowOutPath = join(FLOW_OUT_DIR, `scene-0${scene.index}.mp4`);
    copyFileSync(downloadedPath, flowOutPath);
    copyFileSync(downloadedPath, finalClipPath);
    copyFileSync(downloadedPath, join(CLIPS_DIR, `clip${scene.index}.mp4`));

    console.log(`[FLOW] Staged to ${finalClipPath} and clip${scene.index}.mp4`);
    console.log(`[FLOW] Pausing 6 seconds before next scene...`);
    await new Promise(r => setTimeout(r, 6000));
  }

  // Optimize staged clips with ffmpeg to 1080x1920 30fps with crf 26 for email safety
  console.log(`\n[FFMPEG] Optimizing 3 raw clips to 1080x1920 30fps (crf 26)...`);
  for (let i = 1; i <= 3; i++) {
    const p = join(CLIPS_DIR, `VID-021-clip${i}.mp4`);
    const opt = join(CLIPS_DIR, `VID-021-clip${i}_opt.mp4`);
    execSync(`ffmpeg -y -i "${p}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -r 30 -c:v libx264 -crf 26 -preset fast -an "${opt}"`, { stdio: 'ignore' });
    copyFileSync(opt, p);
    copyFileSync(opt, join(CLIPS_DIR, `clip${i}.mp4`));
    console.log(`Optimized clip ${i}: ${statSync(opt).size} bytes`);
  }

  console.log(`\n🎉 All 3 clips for VID-021 successfully generated and staged!`);
}

main().catch(err => {
  console.error('[FLOW] Fatal error:', err);
  process.exit(1);
});
