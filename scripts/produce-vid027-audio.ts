import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const BRIDGE_URL = 'http://127.0.0.1:10086/command';
const SESSION = 'yt-production';

const SCRIPT_TEXT = 'Concealed micro-titanium lockpick pins slide out from the tip of each index finger. Feel tumbler pins and spring tension at a microscopic level to pick any lock in seconds. The ultimate covert tool is always attached right to your fingertips.';

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

  // Fill speech script into textarea
  console.log('[TTS] Filling script into Speech block text...');
  await bridgeCall('click', { selector: 'textarea[aria-label="Speech block text"]' });
  await new Promise(r => setTimeout(r, 200));
  await bridgeCall('fill', { selector: 'textarea[aria-label="Speech block text"]', value: SCRIPT_TEXT });
  await new Promise(r => setTimeout(r, 400));

  const taCheck = await evalInPage(`(() => {
    const ta = document.querySelector('textarea[aria-label="Speech block text"]');
    return { val: ta ? ta.value : '', len: ta ? ta.value.length : 0 };
  })()`);
  console.log('[TTS] Textarea verified:', taCheck);

  // Clear previous audio src if any
  await evalInPage(`(() => {
    const audio = document.querySelector('audio');
    if (audio) {
      audio.removeAttribute('src');
      audio.src = '';
    }
  })()`);

  // Find exact Run button coordinates (button.ctrl-enter-submits)
  console.log('[TTS] Finding Run button coordinates...');
  const runCoords = await evalInPage(`(() => {
    const btn = document.querySelector('button.ctrl-enter-submits');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);

  if (!runCoords) throw new Error('Run button (button.ctrl-enter-submits) not found');
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

  // Wait for audio generation to complete
  console.log('[TTS] Waiting for audio generation...');
  let audioData = '';
  let duration = 0;

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const status = await evalInPage(`(() => {
      const audio = document.querySelector('audio');
      const dlBtn = document.querySelector('button[aria-label="Download"]');
      const currentSrc = audio ? (audio.currentSrc || audio.src) : '';
      return {
        hasAudio: Boolean(audio),
        currentSrcLen: currentSrc ? currentSrc.length : 0,
        currentSrcPrefix: currentSrc ? currentSrc.slice(0, 40) : '',
        duration: audio ? audio.duration : 0,
        hasDl: Boolean(dlBtn)
      };
    })()`);

    if (status.currentSrcLen > 50000 && status.currentSrcPrefix.startsWith('data:audio/wav;base64,')) {
      audioData = await evalInPage(`(() => {
        const audio = document.querySelector('audio');
        return audio ? (audio.currentSrc || audio.src) : '';
      })()`);
      duration = status.duration;
      console.log(`\n[TTS] Generated audio ready: ${duration}s (base64 length: ${audioData.length})`);
      break;
    }
    process.stdout.write('.');
  }

  if (!audioData) throw new Error('Audio generation timed out or failed');

  const base64Data = audioData.replace(/^data:audio\/wav;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  const rawWavPath = join(process.cwd(), 'public', 'audio', 'VID-027.wav');
  mkdirSync(join(process.cwd(), 'public', 'audio'), { recursive: true });
  writeFileSync(rawWavPath, buffer);
  console.log(`[TTS] Saved raw WAV to ${rawWavPath} (${buffer.length} bytes)`);

  const rawDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${rawWavPath}"`).toString().trim());
  console.log(`[TTS] Raw WAV duration: ${rawDuration.toFixed(2)}s`);

  // Target window: 15-20s. Calculate exact tempo needed
  const targetDuration = Math.min(19.5, Math.max(15.5, rawDuration / 1.15));
  const tempo = (rawDuration / targetDuration).toFixed(3);
  console.log(`[TTS] Applying tempo ${tempo}x to fit 15-20s window (target: ~${targetDuration.toFixed(2)}s)...`);

  const finalMp3Path = join(process.cwd(), 'public', 'audio', 'VID-027.mp3');
  execSync(`ffmpeg -y -i "${rawWavPath}" -filter:a "atempo=${tempo}" -ar 48000 -ac 2 -b:a 192k "${finalMp3Path}"`, { stdio: 'inherit' });

  const finalDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalMp3Path}"`).toString().trim());
  console.log(`[TTS] Master MP3 duration: ${finalDuration.toFixed(2)}s`);

  // Silence detection to find exact split boundaries
  console.log('[TTS] Detecting silence intervals for act slicing...');
  const silenceOut = execSync(`ffmpeg -i "${finalMp3Path}" -af "silencedetect=noise=-28dB:d=0.2" -f null - 2>&1`).toString();
  const silenceLines = silenceOut.split('\n').filter(l => l.includes('silence_start') || l.includes('silence_end'));
  console.log(silenceLines.join('\n'));

  console.log(`[TTS] Voiceover ready at public/audio/VID-027.mp3`);
}

main().catch(err => {
  console.error('[TTS] Error:', err);
  process.exit(1);
});
