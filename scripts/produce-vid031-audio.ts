import { writeFileSync, mkdirSync, copyFileSync, statSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

const BRIDGE_URL = 'http://127.0.0.1:10086/command';
const SESSION = 'yt-production';

const SCRIPT_TEXT = 'Embed an industrial blue laser diode directly into the inner joint of each wrist. Slice through steel padlocks, reinforced chains, and thick cables with a pinpoint beam of concentrated heat. Retract the emitter safely behind a watertight sapphire crystal shield whenever not in use.';

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
  console.log('[TTS] Connecting to Google AI Studio tab...');
  const tabs = await bridgeCall('list_browser_tabs');
  const aiTabs = tabs.tabs.filter((t: any) => t.url.includes('aistudio.google.com/generate-speech'));
  const aiTab = aiTabs[aiTabs.length - 1];
  if (!aiTab) throw new Error('Google AI Studio tab not found!');
  await bridgeCall('attach_tab', { tabId: aiTab.tabId });
  console.log(`[TTS] Attached to tabId: ${aiTab.tabId}`);

  await new Promise(r => setTimeout(r, 2000));

  // Check if we need to click "Create new dialog" card
  const needsCreate = await evalInPage(`(() => {
    const card = document.querySelector(".create-dialog-card");
    const ta = document.querySelector("textarea[aria-label=\\"Speech block text\\"]");
    if (!ta && card) {
      card.click();
      return true;
    }
    return false;
  })()`);
  if (needsCreate) {
    console.log('[TTS] Clicked create-dialog-card, waiting 2s...');
    await new Promise(r => setTimeout(r, 2000));
  }

  // Ensure Speaker is Ludo
  const speakerInfo = await evalInPage(`(() => {
    const chip = document.querySelector(".voice-chip");
    return chip ? chip.innerText.trim() : "";
  })()`);
  console.log('[TTS] Current speaker chip:', speakerInfo);

  if (!speakerInfo.toLowerCase().includes('ludo')) {
    console.log('[TTS] Selecting Ludo voice...');
    await evalInPage(`(() => {
      const btn = document.querySelector(".active-voice-card-trigger") || document.querySelector(".voice-chip");
      if (btn) btn.click();
    })()`);
    await new Promise(r => setTimeout(r, 1200));

    await evalInPage(`(() => {
      const ludoEl = Array.from(document.querySelectorAll(".voice-row-primary, .voice-name")).find(el => el.innerText.trim() === "Ludo");
      if (ludoEl) ludoEl.click();
    })()`);
    await new Promise(r => setTimeout(r, 800));

    // Close voice picker modal if still open
    await evalInPage(`(() => {
      const closeBtn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.trim() === "close" || b.getAttribute("aria-label") === "Close");
      if (closeBtn) closeBtn.click();
    })()`);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Fill speech script into textarea
  console.log('[TTS] Filling script into Speech block text...');
  const fillRes = await evalInPage(`(() => {
    const ta = document.querySelector("textarea[aria-label=\\"Speech block text\\"]");
    if (!ta) return { success: false, reason: "no textarea" };
    ta.focus();
    ta.value = ${JSON.stringify(SCRIPT_TEXT)};
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
    return { success: true, len: ta.value.length };
  })()`);
  console.log('[TTS] Textarea filled:', fillRes);

  await new Promise(r => setTimeout(r, 600));

  // Clear previous audio src if any
  await evalInPage(`(() => {
    const audio = document.querySelector("audio");
    if (audio) {
      audio.removeAttribute("src");
      audio.src = "";
    }
  })()`);

  // Click Run button directly
  console.log('[TTS] Clicking Run button...');
  await bridgeCall('click', { selector: 'button.ctrl-enter-submits' });

  // Wait for audio generation to complete (button changes to Stop, then back to Run)
  console.log('[TTS] Waiting for audio generation to complete...');
  let hasStarted = false;

  for (let i = 0; i < 45; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const status = await evalInPage(`(() => {
      const btn = document.querySelector("button.ctrl-enter-submits");
      const dlBtn = document.querySelector("button[aria-label=\\"Download\\"]");
      const btnText = btn ? btn.innerText.replace(/\\s+/g, ' ') : '';
      const isGenerating = btnText.includes("Stop");
      return {
        isGenerating,
        btnText,
        hasDl: Boolean(dlBtn)
      };
    })()`);

    if (status.isGenerating) {
      hasStarted = true;
      process.stdout.write('*');
      continue;
    }

    if (hasStarted && !status.isGenerating && status.hasDl) {
      console.log('\n[TTS] Audio generation finished!');
      break;
    }
    process.stdout.write('.');
  }

  // Note current Downloads time
  const tBeforeDl = Date.now();
  console.log('[TTS] Clicking Download button...');
  await bridgeCall('click', { selector: 'button[aria-label="Download"]' });
  await new Promise(r => setTimeout(r, 2000));

  // Find the newly downloaded file in ~/Downloads
  const downloadsDir = join(homedir(), 'Downloads');
  let newWavFile = '';

  for (let w = 0; w < 15; w++) {
    await new Promise(r => setTimeout(r, 1000));
    const files = readdirSync(downloadsDir)
      .filter(f => f.startsWith('Generated Audio') && f.endsWith('.wav'))
      .map(f => ({ name: f, path: join(downloadsDir, f), mtime: statSync(join(downloadsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > 0 && files[0].mtime >= tBeforeDl - 5000) {
      newWavFile = files[0].path;
      console.log(`[TTS] Downloaded audio file identified: ${newWavFile}`);
      break;
    }
  }

  if (!newWavFile) {
    throw new Error('Failed to find newly downloaded audio WAV in ~/Downloads');
  }

  const rawWavPath = join(process.cwd(), 'public', 'audio', 'VID-031.wav');
  mkdirSync(join(process.cwd(), 'public', 'audio'), { recursive: true });
  copyFileSync(newWavFile, rawWavPath);
  console.log(`[TTS] Copied raw WAV to ${rawWavPath} (${statSync(rawWavPath).size} bytes)`);

  const rawDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${rawWavPath}"`).toString().trim());
  console.log(`[TTS] Raw WAV duration: ${rawDuration.toFixed(2)}s`);

  // Target window: 15-20s.
  const targetDuration = Math.min(19.5, Math.max(15.5, rawDuration));
  const tempo = (rawDuration / targetDuration).toFixed(3);
  console.log(`[TTS] Applying tempo ${tempo}x (target: ~${targetDuration.toFixed(2)}s)...`);

  const finalMp3Path = join(process.cwd(), 'public', 'audio', 'VID-031.mp3');
  execSync(`ffmpeg -y -i "${rawWavPath}" -filter:a "atempo=${tempo}" -ar 48000 -ac 2 -b:a 192k "${finalMp3Path}"`, { stdio: 'inherit' });

  const finalDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalMp3Path}"`).toString().trim());
  console.log(`[TTS] Master MP3 duration: ${finalDuration.toFixed(2)}s`);

  // Silence detection to find exact split boundaries
  console.log('[TTS] Detecting silence intervals for act slicing...');
  const silenceOut = execSync(`ffmpeg -i "${finalMp3Path}" -af "silencedetect=noise=-28dB:d=0.2" -f null - 2>&1`).toString();
  const silenceLines = silenceOut.split('\n').filter(l => l.includes('silence_start') || l.includes('silence_end'));
  console.log('Silence points:\n', silenceLines.join('\n'));

  console.log(`[TTS] Master Voiceover ready at public/audio/VID-031.mp3`);
}

main().catch(err => {
  console.error('[TTS] Error:', err);
  process.exit(1);
});
