import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const BRIDGE_URL = 'http://127.0.0.1:10086/command';
const SESSION = 'yt-production';

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
  console.log('[TTS] Waiting for audio generation to complete...');
  let audioData = '';
  let duration = 0;

  for (let i = 0; i < 45; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const status = await evalInPage(`(() => {
      const audio = document.querySelector("audio");
      const btn = document.querySelector("button.ctrl-enter-submits");
      const curSrc = audio ? (audio.currentSrc || audio.src) : "";
      return {
        hasAudio: Boolean(audio),
        curSrcLen: curSrc ? curSrc.length : 0,
        curSrcPrefix: curSrc ? curSrc.slice(0, 40) : "",
        duration: audio ? audio.duration : 0,
        isGenerating: btn ? btn.innerText.includes("Stop") : false
      };
    })()`);

    if (status.curSrcLen > 50000 && status.curSrcPrefix.startsWith('data:audio/wav;base64,')) {
      audioData = await evalInPage(`(() => {
        const audio = document.querySelector("audio");
        return audio ? (audio.currentSrc || audio.src) : "";
      })()`);
      duration = status.duration;
      console.log(`\n[TTS] Generated audio ready: ${duration}s (base64 length: ${audioData.length})`);
      break;
    }
    process.stdout.write(status.isGenerating ? '*' : '.');
  }

  if (!audioData) throw new Error('Audio generation timed out or failed');

  const base64Data = audioData.replace(/^data:audio\/wav;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  const rawWavPath = join(process.cwd(), 'public', 'audio', 'VID-029.wav');
  mkdirSync(join(process.cwd(), 'public', 'audio'), { recursive: true });
  writeFileSync(rawWavPath, buffer);
  console.log(`[TTS] Saved raw WAV to ${rawWavPath} (${buffer.length} bytes)`);

  const rawDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${rawWavPath}"`).toString().trim());
  console.log(`[TTS] Raw WAV duration: ${rawDuration.toFixed(2)}s`);

  // Target window: 15-20s.
  const targetDuration = Math.min(19.5, Math.max(15.5, rawDuration));
  const tempo = (rawDuration / targetDuration).toFixed(3);
  console.log(`[TTS] Applying tempo ${tempo}x (target: ~${targetDuration.toFixed(2)}s)...`);

  const finalMp3Path = join(process.cwd(), 'public', 'audio', 'VID-029.mp3');
  execSync(`ffmpeg -y -i "${rawWavPath}" -filter:a "atempo=${tempo}" -ar 48000 -ac 2 -b:a 192k "${finalMp3Path}"`, { stdio: 'inherit' });

  const finalDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalMp3Path}"`).toString().trim());
  console.log(`[TTS] Master MP3 duration: ${finalDuration.toFixed(2)}s`);

  // Silence detection to find exact split boundaries
  console.log('[TTS] Detecting silence intervals for act slicing...');
  const silenceOut = execSync(`ffmpeg -i "${finalMp3Path}" -af "silencedetect=noise=-28dB:d=0.2" -f null - 2>&1`).toString();
  const silenceLines = silenceOut.split('\n').filter(l => l.includes('silence_start') || l.includes('silence_end'));
  console.log('Silence points:\n', silenceLines.join('\n'));

  console.log(`[TTS] Master Voiceover ready at public/audio/VID-029.mp3`);
}

main().catch(err => {
  console.error('[TTS] Error:', err);
  process.exit(1);
});
