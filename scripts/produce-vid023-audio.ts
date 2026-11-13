import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const BRIDGE_URL = 'http://127.0.0.1:10086/command';
const SESSION = 'yt-production';

const SCRIPT_TEXT = 'Hide retractable hardened tungsten steel spikes beneath the skin of each knuckle. Punch straight through solid steel doors and concrete walls with absolute ease. Retract them flush beneath your skin when you are done breaking things.';

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

  // Verify speaker / voice setting (ensure Ludo)
  const currentSpeaker = await evalInPage(`(() => {
    const btn = document.querySelector('button[aria-label*="Speaker"], .voice-selector-trigger, [class*="voice"]');
    return btn ? btn.innerText.replace(/\\n+/g, ' ') : 'unknown';
  })()`);
  console.log('[TTS] Current speaker button:', currentSpeaker);

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

  if (!audioSrc) throw new Error('Timed out waiting for TTS audio generation');

  const base64Data = audioSrc.replace(/^data:audio\/wav;base64,/, '');
  const wavBuffer = Buffer.from(base64Data, 'base64');
  const wavPath = join(process.cwd(), 'public', 'audio', 'VID-023.wav');
  mkdirSync(join(process.cwd(), 'public', 'audio'), { recursive: true });
  writeFileSync(wavPath, wavBuffer);
  console.log(`[TTS] Saved raw WAV to ${wavPath} (${wavBuffer.length} bytes)`);

  // Target 15-20s duration for Zack D. Films retention
  let tempo = 1.0;
  if (duration > 19.5) {
    tempo = parseFloat((duration / 18.2).toFixed(2));
    if (tempo > 1.3) tempo = 1.25;
    if (tempo < 1.05) tempo = 1.15;
  }
  console.log(`[TTS] Applying tempo ${tempo}x to fit 15-20s window...`);

  const mp3Path = join(process.cwd(), 'public', 'audio', 'VID-023.mp3');
  execSync(`ffmpeg -y -i "${wavPath}" -filter:a "atempo=${tempo}" -ar 48000 -ac 2 -b:a 192k "${mp3Path}"`, { stdio: 'inherit' });

  const finalDurationStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${mp3Path}"`).toString().trim();
  const finalDuration = parseFloat(finalDurationStr);
  console.log(`[TTS] Master MP3 duration: ${finalDuration.toFixed(2)}s`);

  // Detect silence gaps for act slicing
  console.log('[TTS] Detecting silence intervals for act slicing...');
  const silenceDetect = execSync(`ffmpeg -i "${mp3Path}" -af silencedetect=noise=-30dB:d=0.20 -f null - 2>&1`).toString();
  const silenceLines = silenceDetect.split('\n').filter(l => l.includes('silence_'));
  console.log(silenceLines.join('\n'));

  console.log('[TTS] Voiceover ready at public/audio/VID-023.mp3');
}

main().catch(err => {
  console.error('[TTS] Error:', err);
  process.exit(1);
});
