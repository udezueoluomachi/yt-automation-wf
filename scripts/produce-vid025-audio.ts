import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const BRIDGE_URL = 'http://127.0.0.1:10086/command';
const SESSION = 'yt-production';

const SCRIPT_TEXT = 'Install a titanium neutralization valve and alkaline buffer injector inside your stomach lining. Eat anything from rusty scrap metal to spoiled food without getting food poisoning or indigestion. Extract one hundred percent nutritional value from every meal with zero toxic waste leftover.';

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
  const aiTab = tabs.tabs.find((t: any) => t.url.includes('aistudio.google.com/generate-speech'));
  if (!aiTab) throw new Error('Google AI Studio tab not found!');
  await bridgeCall('attach_tab', { tabId: aiTab.tabId });

  // Dismiss any dialog if present
  await evalInPage(`(() => {
    const closeBtn = document.querySelector('button[aria-label="Close dialog"]');
    if (closeBtn) closeBtn.click();
  })()`);

  // Verify / select speaker voice (ensure Ludo)
  const currentSpeaker = await evalInPage(`(() => {
    const btn = document.querySelector('button[aria-label*="Speaker"], .voice-selector-trigger, [class*="voice"]');
    return btn ? btn.innerText.replace(/\\n+/g, ' ') : 'unknown';
  })()`);
  console.log('[TTS] Current speaker button:', currentSpeaker);

  if (!currentSpeaker.toLowerCase().includes('ludo')) {
    console.log('[TTS] Speaker is not Ludo. Selecting Ludo...');
    await evalInPage(`(() => {
      const btn = document.querySelector('button[aria-label*="Speaker"], .voice-selector-trigger');
      if (btn) btn.click();
    })()`);
    await new Promise(r => setTimeout(r, 600));
    await evalInPage(`(() => {
      const items = Array.from(document.querySelectorAll('[role="menuitem"], .voice-option, mat-option, span, button'));
      const ludo = items.find(el => el.textContent && el.textContent.trim() === 'Ludo');
      if (ludo) ludo.click();
    })()`);
    await new Promise(r => setTimeout(r, 600));
  }

  // Fill speech text into textarea
  console.log('[TTS] Filling script into Speech block text...');
  const fillRes = await evalInPage(`(() => {
    const ta = document.querySelector('textarea[aria-label="Speech block text"]');
    if (!ta) return { found: false };
    ta.value = ${JSON.stringify(SCRIPT_TEXT)};
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    ta.focus();
    return { found: true, len: ta.value.length };
  })()`);
  console.log('[TTS] Fill result:', fillRes);
  if (!fillRes.found) throw new Error('Speech block textarea not found');

  await new Promise(r => setTimeout(r, 600));

  // Trigger Run using CDP click on button.ctrl-enter-submits
  console.log('[TTS] Finding Run button coordinates...');
  const runCoords = await evalInPage(`(() => {
    const btn = document.querySelector('button.ctrl-enter-submits, button.ms-button-primary');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);

  // Clear previous audio src to avoid picking up old audio
  await evalInPage(`(() => {
    const audio = document.querySelector('audio');
    if (audio) audio.removeAttribute('src');
  })()`);

  if (runCoords) {
    console.log('[TTS] Clicking Run via CDP at:', runCoords);
    await bridgeCall('cdp', {
      method: 'Input.dispatchMouseEvent',
      params: { type: 'mousePressed', x: runCoords.x, y: runCoords.y, button: 'left', clickCount: 1 }
    });
    await new Promise(r => setTimeout(r, 100));
    await bridgeCall('cdp', {
      method: 'Input.dispatchMouseEvent',
      params: { type: 'mouseReleased', x: runCoords.x, y: runCoords.y, button: 'left', clickCount: 1 }
    });
  } else {
    console.log('[TTS] Fallback: Sending Control+Enter...');
    await bridgeCall('send_keys', { keys: 'Control+Enter' });
  }

  // Wait for audio element to populate
  console.log('[TTS] Waiting for audio generation...');
  let audioSrc = '';
  let duration = 0;

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const status = await evalInPage(`(() => {
      const audio = document.querySelector('audio');
      return {
        hasAudio: Boolean(audio),
        src: audio ? audio.src : null,
        duration: audio ? audio.duration : 0
      };
    })()`);

    if (status.src && status.src.startsWith('data:audio/wav;base64,') && status.duration > 5) {
      audioSrc = status.src;
      duration = status.duration;
      console.log(`\n[TTS] Generated audio ready: ${duration.toFixed(2)}s (base64 size: ${audioSrc.length} bytes)`);
      break;
    }
    process.stdout.write('.');
  }

  if (!audioSrc) throw new Error('Audio generation timed out or failed');

  const base64Data = audioSrc.replace(/^data:audio\/wav;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  const rawWavPath = join(process.cwd(), 'public', 'audio', 'VID-025.wav');
  mkdirSync(join(process.cwd(), 'public', 'audio'), { recursive: true });
  writeFileSync(rawWavPath, buffer);
  console.log(`[TTS] Saved raw WAV to ${rawWavPath} (${buffer.length} bytes)`);

  // Target window: 15-20s. Calculate exact tempo needed
  const targetDuration = Math.min(19.5, Math.max(16.0, duration / 1.25));
  const tempo = (duration / targetDuration).toFixed(3);
  console.log(`[TTS] Applying tempo ${tempo}x to fit 15-20s window (target: ~${targetDuration.toFixed(2)}s)...`);

  const finalMp3Path = join(process.cwd(), 'public', 'audio', 'VID-025.mp3');
  execSync(`ffmpeg -y -i "${rawWavPath}" -filter:a "atempo=${tempo}" -ar 48000 -ac 2 -b:a 192k "${finalMp3Path}"`, { stdio: 'inherit' });

  const finalDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalMp3Path}"`).toString().trim());
  console.log(`[TTS] Master MP3 duration: ${finalDuration.toFixed(2)}s`);

  // Silence detection to find exact split boundaries
  console.log('[TTS] Detecting silence intervals for act slicing...');
  const silenceOut = execSync(`ffmpeg -i "${finalMp3Path}" -af "silencedetect=noise=-28dB:d=0.2" -f null - 2>&1`).toString();
  const silenceLines = silenceOut.split('\n').filter(l => l.includes('silence_start') || l.includes('silence_end'));
  console.log(silenceLines.join('\n'));

  console.log(`[TTS] Voiceover ready at public/audio/VID-025.mp3`);
}

main().catch(err => {
  console.error('[TTS] Error:', err);
  process.exit(1);
});
