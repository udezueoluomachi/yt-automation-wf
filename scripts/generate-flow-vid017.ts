import { chromium } from '../tools/flow-mcp/node_modules/playwright-core/index.mjs';
import { existsSync, readdirSync, statSync, copyFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SCENES = [
  {
    index: 1,
    target: 'VID-017-clip1',
    prompt: 'stylized 3D CGI model, digital mannequin, Octane 3D anatomical render. Extreme macro anatomical cutaway push-in of a stylized 3D digital mannequin foot sole, showing the biological sole split open to reveal concentric rare-earth copper and neodymium electromagnet coils glowing with electric cyan energy lines wired into synthetic nerve conduits. Studio rim lighting, subtle electrical sparks. High-end 3D render, zero real humans, no photo, no live action.'
  },
  {
    index: 2,
    target: 'VID-017-clip2',
    prompt: 'stylized 3D CGI model, digital mannequin, Octane 3D anatomical render. Wide tracking shot of a stylized 3D digital mannequin walking completely upside down along the corrugated steel ceiling of a futuristic industrial transit tunnel. Each magnetic footstep clamps down firmly with a pulsing cyan magnetic shockwave, resisting gravity with ease. Dynamic low-angle perspective, cinematic studio lighting, high-end 3D render, zero real humans, no photo, no live action.'
  },
  {
    index: 3,
    target: 'VID-017-clip3',
    prompt: 'stylized 3D CGI model, digital mannequin, Octane 3D anatomical render. Slow-motion tracking shot of the stylized 3D digital mannequin upside down on the metal ceiling. As the cyan magnetic coils power down, the magnetic field releases with a quick spark and the mannequin drops smoothly downward, performing a clean, balanced three-point landing on the steel floor below. Smooth camera tilt, high-end 3D render, zero real humans, no photo, no live action.'
  }
];

const DOWNLOADS_DIR = join(homedir(), 'Downloads');
const FLOW_OUT_DIR = join(homedir(), 'flow-mcp-out', 'VID-017');
const CLIPS_DIR = join(process.cwd(), 'public', 'clips');

mkdirSync(DOWNLOADS_DIR, { recursive: true });
mkdirSync(FLOW_OUT_DIR, { recursive: true });
mkdirSync(CLIPS_DIR, { recursive: true });

async function main() {
  console.log('[FLOW] Connecting to Chrome session on port 9333...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().includes('flow.google.com'));

  if (!page) {
    throw new Error('No Google Flow tab found in Chrome session!');
  }

  console.log(`[FLOW] Attached to Flow tab: ${page.url()}`);

  // Set download behavior over CDP
  const client = await context.newCDPSession(page);
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DOWNLOADS_DIR,
    eventsEnabled: true,
  });

  // Ensure Agent mode chip is disabled
  const agentChip = page.locator('button.agent-mode-chip');
  if ((await agentChip.count()) > 0) {
    const isChecked = await agentChip.getAttribute('aria-pressed');
    if (isChecked === 'true') {
      console.log('[FLOW] Disabling Agent mode chip to ensure Video mode...');
      await page.$eval('button.agent-mode-chip', (b: any) => b.click());
      await page.waitForTimeout(1000);
    }
  }

  // Dismiss any leftover popups
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Log current settings
  const trigger = page.locator('button[aria-label="Settings trigger"]').first();
  if (await trigger.isVisible()) {
    console.log(`[FLOW] Active Mode & Settings: ${(await trigger.innerText()).replace(/\n+/g, ' ')}`);
  }

  for (const scene of SCENES) {
    const finalClipPath = join(CLIPS_DIR, `${scene.target}.mp4`);
    if (existsSync(finalClipPath) && statSync(finalClipPath).size > 100000) {
      console.log(`[FLOW] ${scene.target}.mp4 already exists (${statSync(finalClipPath).size} bytes), skipping generation.`);
      continue;
    }

    console.log(`\n==================================================`);
    console.log(`[FLOW] Generating Scene ${scene.index}: ${scene.target}`);
    console.log(`[FLOW] Prompt: ${scene.prompt.slice(0, 90)}...`);
    console.log(`==================================================`);

    // Ensure prompt editor is clear and focused
    const box = page.locator('.ProseMirror').first();
    await box.focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await page.keyboard.type(scene.prompt, { delay: 6 });
    await page.waitForTimeout(800);

    // Verify Start generation button is enabled
    const startBtn = page.locator('button[aria-label="Start generation"]').first();
    if (!(await startBtn.isEnabled())) {
      throw new Error(`Start generation button disabled for ${scene.target}`);
    }

    // Capture files in Downloads before triggering
    const beforeDownloads = new Set(readdirSync(DOWNLOADS_DIR));

    console.log(`[FLOW] Clicking Start generation...`);
    await startBtn.click();
    await page.waitForTimeout(5000);

    // Poll for generation completion (up to 7 minutes)
    console.log(`[FLOW] Waiting for 3D CGI video generation to complete...`);
    let completed = false;
    for (let wait = 0; wait < 210; wait++) {
      await page.waitForTimeout(2000);

      const topTile = page.locator('flow-grid-tile-container').first();
      const text = await topTile.innerText().catch(() => '');

      const percentMatch = text.match(/\d+%/);
      if (percentMatch) {
        process.stdout.write(`\r[FLOW] Progress: ${percentMatch[0]}   `);
      }

      const isFinishedVideo = await topTile.evaluate((el: HTMLElement) => {
        const hasVideo = Boolean(el.querySelector('flow-video-tile, video, [data-icon="play_circle"]'));
        const hasPercent = Boolean(el.innerText.match(/\d+%/));
        const hasSpinner = Boolean(el.querySelector('.spinner, [role="progressbar"]'));
        return hasVideo && !hasPercent && !hasSpinner;
      }).catch(() => false);

      if (isFinishedVideo) {
        console.log(`\n[FLOW] Scene ${scene.index} finished rendering!`);
        completed = true;
        break;
      }
    }

    if (!completed) {
      throw new Error(`Timed out waiting for ${scene.target} video to render in Flow.`);
    }

    // Download top tile
    console.log(`[FLOW] Downloading ${scene.target}...`);
    await page.waitForTimeout(2500);
    const topTile = page.locator('flow-grid-tile-container').first();
    await topTile.scrollIntoViewIfNeeded();

    const box_rect = await topTile.boundingBox();
    if (box_rect) {
      await page.mouse.move(box_rect.x + box_rect.width / 2, box_rect.y + box_rect.height / 2);
    } else {
      await topTile.hover();
    }
    await page.waitForTimeout(1000);

    let moreBtn = topTile.locator('button[aria-label="More options"]').first();
    if ((await moreBtn.count()) === 0 || !(await moreBtn.isVisible())) {
      await topTile.click({ button: 'right' });
    } else {
      await moreBtn.click();
    }
    await page.waitForTimeout(800);

    const dlItem = page.locator('[role="menuitem"]:has-text("Download")').first();
    await dlItem.waitFor({ state: 'visible', timeout: 6000 });
    await dlItem.click();

    // Check submenu for original/720p
    const originalSub = page.locator('[role="menuitem"]').filter({ hasText: /original|720p/i }).first();
    if (await originalSub.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) {
      await originalSub.click();
    }

    // Wait for downloaded file in Downloads dir
    console.log(`[FLOW] Waiting for MP4 file to appear in ${DOWNLOADS_DIR}...`);
    let downloadedPath = '';
    for (let i = 0; i < 45; i++) {
      await page.waitForTimeout(1000);
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

    // Copy to flow-mcp-out, public/clips/VID-017-clipX.mp4, and public/clips/clipX.mp4
    const flowOutPath = join(FLOW_OUT_DIR, `scene-0${scene.index}.mp4`);
    copyFileSync(downloadedPath, flowOutPath);
    copyFileSync(downloadedPath, finalClipPath);
    copyFileSync(downloadedPath, join(CLIPS_DIR, `clip${scene.index}.mp4`));

    console.log(`[FLOW] Staged to ${finalClipPath} and clip${scene.index}.mp4`);

    // Natural human pause between scenes
    console.log(`[FLOW] Pausing 6 seconds before next scene...`);
    await page.waitForTimeout(6000);
  }

  await browser.close();
  console.log(`\n🎉 All 3 clips for VID-017 successfully generated and staged!`);
}

main().catch((err) => {
  console.error('[FLOW] Generation error:', err);
  process.exit(1);
});
