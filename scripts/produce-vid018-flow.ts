import { existsSync, readdirSync, statSync, copyFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const BRIDGE_URL = 'http://127.0.0.1:10086/command';
const SESSION = 'yt-production';

const SCENES = [
  {
    index: 1,
    target: 'VID-018-clip1',
    prompt: 'stylized 3D CGI model, digital mannequin, Octane 3D anatomical render. Extreme macro anatomical cutaway push-in of a stylized 3D digital mannequin neck, showing cervical vertebrae seamlessly replaced by an articulated polished stainless steel 360-degree ball-and-socket swivel bearing with flexible glowing fiber-optic conduits. Studio rim lighting, clean mechanical cross-section. High-end 3D render, zero real humans, no photo, no live action.'
  },
  {
    index: 2,
    target: 'VID-018-clip2',
    prompt: 'stylized 3D CGI model, digital mannequin, Octane 3D anatomical render. Medium shot of a stylized 3D digital mannequin standing motionless with torso facing forward. The mannequin\'s head rotates smoothly 180 degrees completely backward, glowing cyan optical sensors inspecting the space behind them. Slow cinematic camera orbit, futuristic industrial laboratory lighting. High-end 3D render, zero real humans, no photo, no live action.'
  },
  {
    index: 3,
    target: 'VID-018-clip3',
    prompt: 'stylized 3D CGI model, digital mannequin, Octane 3D anatomical render. Close-up cutaway of the mechanical neck bearing as the head rotates a full 360 degrees smoothly back into front-facing position. Internal gold-plated slip-ring contacts maintain seamless electrical connections with zero wire twisting, locking securely into place with a subtle cyan energy pulse. High-end 3D render, zero real humans, no photo, no live action.'
  }
];

const DOWNLOADS_DIR = join(homedir(), 'Downloads');
const FLOW_OUT_DIR = join(homedir(), 'flow-mcp-out', 'VID-018');
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

async function main() {
  console.log('[FLOW] Connecting to Flow tab via Kimi WebBridge...');
  
  // Find Flow tab
  const tabList = await bridgeCall('list_tabs');
  const flowTab = tabList.tabs?.find((t: any) => t.url.includes('flow.google.com'));
  if (!flowTab) {
    throw new Error('Google Flow tab not found in active session!');
  }

  await bridgeCall('attach_tab', { tabId: flowTab.tabId });
  console.log(`[FLOW] Attached to tab: ${flowTab.tabId} (${flowTab.title})`);

  // Verify settings: ensure Video mode, 720p, 9:16
  const settingsStatus = await evalInPage(`(() => {
    const trigger = document.querySelector('button[aria-label="Settings trigger"]');
    return trigger ? trigger.innerText.replace(/\\n+/g, ' ') : null;
  })()`);
  console.log(`[FLOW] Current settings trigger: ${settingsStatus}`);

  for (const scene of SCENES) {
    const finalClipPath = join(CLIPS_DIR, `${scene.target}.mp4`);
    if (existsSync(finalClipPath) && statSync(finalClipPath).size > 100000) {
      console.log(`[FLOW] ${scene.target}.mp4 already exists (${statSync(finalClipPath).size} bytes), skipping.`);
      continue;
    }

    console.log(`\n==================================================`);
    console.log(`[FLOW] Generating Scene ${scene.index}: ${scene.target}`);
    console.log(`[FLOW] Prompt: ${scene.prompt.slice(0, 90)}...`);
    console.log(`==================================================`);

    // Dismiss popups
    await bridgeCall('send_keys', { keys: 'Escape' });
    await new Promise(r => setTimeout(r, 400));

    // Fill prompt into ProseMirror
    console.log(`[FLOW] Filling prompt...`);
    await bridgeCall('fill', { selector: '.ProseMirror', value: scene.prompt });
    await new Promise(r => setTimeout(r, 800));

    // Verify Start generation button is enabled
    const isStartReady = await evalInPage(`(() => {
      const btn = document.querySelector('button[aria-label="Start generation"]');
      return btn && !btn.hasAttribute('disabled') && !btn.classList.contains('mat-mdc-button-disabled');
    })()`);

    if (!isStartReady) {
      throw new Error(`Start generation button is disabled for ${scene.target}`);
    }

    const beforeDownloads = new Set(readdirSync(DOWNLOADS_DIR));

    console.log(`[FLOW] Clicking Start generation...`);
    await evalInPage(`(() => {
      document.querySelector('button[aria-label="Start generation"]').click();
    })()`);

    await new Promise(r => setTimeout(r, 5000));

    // Poll for generation completion (up to 7 minutes)
    console.log(`[FLOW] Waiting for 3D CGI video generation to complete...`);
    let completed = false;

    for (let wait = 0; wait < 210; wait++) {
      await new Promise(r => setTimeout(r, 2000));

      const status = await evalInPage(`(() => {
        const topTile = document.querySelectorAll('flow-grid-tile-container')[0];
        if (!topTile) return { percent: null, finished: false };
        const text = topTile.innerText || '';
        const m = text.match(/\\d+%/);
        const hasVideo = Boolean(topTile.querySelector('flow-video-tile, video, [data-icon="play_circle"]'));
        const hasSpinner = Boolean(topTile.querySelector('.spinner, [role="progressbar"]'));
        return {
          percent: m ? m[0] : null,
          finished: hasVideo && !m && !hasSpinner
        };
      })()`);

      if (status.percent) {
        process.stdout.write(`\r[FLOW] Progress: ${status.percent}   `);
      }

      if (status.finished) {
        console.log(`\n[FLOW] Scene ${scene.index} finished rendering!`);
        completed = true;
        break;
      }
    }

    if (!completed) {
      throw new Error(`Timed out waiting for ${scene.target} to render in Flow.`);
    }

    // Trigger download
    console.log(`[FLOW] Opening download menu for ${scene.target}...`);
    await new Promise(r => setTimeout(r, 2000));

    // Hover top tile and click More options
    await evalInPage(`(() => {
      const topTile = document.querySelectorAll('flow-grid-tile-container')[0];
      if (topTile) {
        topTile.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const moreBtn = topTile.querySelector('button[aria-label="More options"]');
        if (moreBtn) moreBtn.click();
      }
    })()`);

    await new Promise(r => setTimeout(r, 1000));

    // Click Download in menu
    const dlClicked = await evalInPage(`(() => {
      const items = [...document.querySelectorAll('[role="menuitem"]')];
      const dl = items.find(e => /download/i.test(e.innerText));
      if (dl) { dl.click(); return true; }
      return false;
    })()`);

    if (!dlClicked) {
      throw new Error(`Download menu item not found for ${scene.target}`);
    }

    await new Promise(r => setTimeout(r, 1000));

    // Click Original size if submenu opened
    await evalInPage(`(() => {
      const items = [...document.querySelectorAll('[role="menuitem"]')];
      const orig = items.find(e => /original|720p/i.test(e.innerText));
      if (orig) orig.click();
    })()`);

    // Wait for downloaded file in Downloads dir
    console.log(`[FLOW] Waiting for MP4 file to appear in ${DOWNLOADS_DIR}...`);
    let downloadedPath = '';
    for (let i = 0; i < 45; i++) {
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
      throw new Error(`Failed to download ${scene.target}`);
    }

    console.log(`[FLOW] Downloaded to: ${downloadedPath} (${statSync(downloadedPath).size} bytes)`);

    // Copy to flow-mcp-out, public/clips/VID-018-clipX.mp4, and public/clips/clipX.mp4
    const flowOutPath = join(FLOW_OUT_DIR, `scene-0${scene.index}.mp4`);
    copyFileSync(downloadedPath, flowOutPath);
    copyFileSync(downloadedPath, finalClipPath);
    copyFileSync(downloadedPath, join(CLIPS_DIR, `clip${scene.index}.mp4`));

    console.log(`[FLOW] Staged to ${finalClipPath} and clip${scene.index}.mp4`);

    // Natural pause between scenes
    console.log(`[FLOW] Pausing 6 seconds before next scene...`);
    await new Promise(r => setTimeout(r, 6000));
  }

  // Optimize staged clips with ffmpeg
  console.log(`\n[FFMPEG] Optimizing 3 raw clips to 1080x1920 30fps...`);
  for (let i = 1; i <= 3; i++) {
    const p = join(CLIPS_DIR, `VID-018-clip${i}.mp4`);
    const tmp = join(CLIPS_DIR, `VID-018-clip${i}_opt.mp4`);
    execSync(`ffmpeg -y -i "${p}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -r 30 -c:v libx264 -crf 23 -preset fast -an "${tmp}"`, { stdio: 'ignore' });
    copyFileSync(tmp, p);
    copyFileSync(tmp, join(CLIPS_DIR, `clip${i}.mp4`));
    execSync(`rm -f "${tmp}"`);
    console.log(`Optimized clip ${i}: ${statSync(p).size} bytes`);
  }

  console.log(`\n🎉 All 3 clips for VID-018 successfully generated and staged!`);
}

main().catch(err => {
  console.error('[FLOW] Fatal error:', err);
  process.exit(1);
});
