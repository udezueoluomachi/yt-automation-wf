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
  console.log('[TTS] Waiting for generated audio...');
  let audioSrc = '';
  let duration = 0;

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 2000));
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
      console.log(`\n[TTS] Generated audio ready: ${duration.toFixed(2)}s (base64: ${audioSrc.length} bytes)`);
      break;
    }
    process.stdout.write('.');
  }

  if (!audioSrc) throw new Error('Audio generation timed out');

  const base64Data = audioSrc.replace(/^data:audio\/wav;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  const rawWavPath = join(process.cwd(), 'public', 'audio', 'VID-024.wav');
  mkdirSync(join(process.cwd(), 'public', 'audio'), { recursive: true });
  writeFileSync(rawWavPath, buffer);
  console.log(`[TTS] Saved raw WAV to ${rawWavPath} (${buffer.length} bytes)`);

  // Target duration: 15-20s (e.g. ~18.5s)
  const targetDuration = Math.min(19.5, Math.max(16.5, duration / 1.25));
  const tempo = (duration / targetDuration).toFixed(3);
  console.log(`[TTS] Applying tempo ${tempo}x (raw: ${duration.toFixed(2)}s -> target: ~${targetDuration.toFixed(2)}s)...`);

  const finalMp3Path = join(process.cwd(), 'public', 'audio', 'VID-024.mp3');
  execSync(`ffmpeg -y -i "${rawWavPath}" -filter:a "atempo=${tempo}" -ar 48000 -ac 2 -b:a 192k "${finalMp3Path}"`, { stdio: 'inherit' });

  const finalDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalMp3Path}"`).toString().trim());
  console.log(`[TTS] Master MP3 duration: ${finalDuration.toFixed(2)}s`);

  // Silence detection
  console.log('[TTS] Detecting silence intervals for act slicing...');
  const silenceOut = execSync(`ffmpeg -i "${finalMp3Path}" -af "silencedetect=noise=-28dB:d=0.2" -f null - 2>&1`).toString();
  const silenceLines = silenceOut.split('\n').filter(l => l.includes('silence_start') || l.includes('silence_end'));
  console.log(silenceLines.join('\n'));

  console.log(`[TTS] Voiceover ready at ${finalMp3Path}`);
}

main().catch(err => {
  console.error('[TTS] Error:', err);
  process.exit(1);
});
