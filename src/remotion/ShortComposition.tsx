import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  staticFile,
} from 'remotion';
import { Video, Audio } from '@remotion/media';

export interface ClipItem {
  clipIndex: number;
  durationSeconds: number;
  visualAction: string;
  spokenLine: string;
  sfxCue: string;
  mediaPath?: string;
}

export type ShortCompositionProps = {
  serialId: string;
  topic: string;
  targetDurationSeconds: number;
  clips: ClipItem[];
  audioVoiceoverPath?: string;
  [key: string]: unknown;
};

function resolveMediaUrl(mediaPath?: string, clipIndex?: number): string {
  if (mediaPath) {
    if (
      mediaPath.startsWith('http://') ||
      mediaPath.startsWith('https://') ||
      mediaPath.startsWith('data:')
    ) {
      return mediaPath;
    }
    const clean = mediaPath.replace(/^\/+/, '');
    return staticFile(clean);
  }
  return staticFile(`clips/clip${clipIndex || 1}.mp4`);
}

function resolveAudioUrl(audioPath?: string): string | null {
  if (!audioPath) return null;
  if (
    audioPath.startsWith('http://') ||
    audioPath.startsWith('https://') ||
    audioPath.startsWith('data:')
  ) {
    return audioPath;
  }
  const clean = audioPath.replace(/^\/+/, '');
  return staticFile(clean);
}

export const ShortComposition: React.FC<ShortCompositionProps> = ({
  clips,
  audioVoiceoverPath,
}) => {
  const { fps, width, height } = useVideoConfig();

  // Calculate cumulative start frames for each clip
  let runningFrame = 0;
  const clipRanges = (clips || []).map((clip) => {
    const from = runningFrame;
    const durationFrames = Math.max(1, Math.round(clip.durationSeconds * fps));
    runningFrame += durationFrames;
    return {
      clip,
      from,
      durationFrames,
    };
  });

  const voiceoverUrl = resolveAudioUrl(audioVoiceoverPath);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000000',
        color: '#ffffff',
        fontFamily:
          "'Montserrat', 'Arial Black', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflow: 'hidden',
        width,
        height,
      }}
    >
      {/* 1. Synchronized Voiceover Audio Track (Ludo / Zack D. Films style) */}
      {voiceoverUrl && <Audio src={voiceoverUrl} />}

      {/* 2. Sequential Video Clips */}
      {clipRanges.map(({ clip, from, durationFrames }) => (
        <Sequence
          key={clip.clipIndex}
          from={from}
          durationInFrames={durationFrames}
        >
          <ClipScene
            clip={clip}
            clipDurationFrames={durationFrames}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

/**
 * Single Clip Scene: Fullscreen Video Background + Clean Text-Only Kinetic Captions
 */
const ClipScene: React.FC<{
  clip: ClipItem;
  clipDurationFrames: number;
}> = ({ clip, clipDurationFrames }) => {
  const frame = useCurrentFrame();
  const mediaUrl = resolveMediaUrl(clip.mediaPath, clip.clipIndex);

  return (
    <AbsoluteFill>
      {/* Fullscreen 3D Video Background */}
      <AbsoluteFill>
        <Video
          src={mediaUrl}
          objectFit="cover"
          style={{
            width: '100%',
            height: '100%',
          }}
        />
      </AbsoluteFill>

      {/* Clean Kinetic Subtitle Typography (No background box, no pills) */}
      <KineticCaptions
        spokenLine={clip.spokenLine}
        clipDurationFrames={clipDurationFrames}
        frame={frame}
      />
    </AbsoluteFill>
  );
};

/**
 * Clean Kinetic Subtitle Component
 * Floating directly on the screen without background containers or extra meta pills.
 * Highlights words in sync with the spoken voiceover line.
 */
const KineticCaptions: React.FC<{
  spokenLine: string;
  clipDurationFrames: number;
  frame: number;
}> = ({ spokenLine, clipDurationFrames, frame }) => {
  const words = spokenLine.trim().split(/\s+/);
  const totalWords = words.length;

  // The narration for this clip's sentence spans roughly 5.2 seconds (156 frames at 30fps)
  const speechFrames = Math.min(clipDurationFrames, Math.round(5.2 * 30));
  const wordDuration = speechFrames / Math.max(1, totalWords);
  const isSpeechFinished = frame >= speechFrames;
  const currentWordIndex = isSpeechFinished
    ? totalWords - 1
    : Math.min(totalWords - 1, Math.floor(frame / wordDuration));

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 280, // Safe zone above YouTube Shorts interface
        left: 60,
        right: 60,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '12px 18px',
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      {words.map((word, idx) => {
        const isActive = !isSpeechFinished && idx === currentWordIndex;
        const isPast = isSpeechFinished || idx < currentWordIndex;

        return (
          <span
            key={idx}
            style={{
              display: 'inline-block',
              fontSize: isActive ? 52 : 46,
              fontWeight: 900,
              letterSpacing: '-0.01em',
              lineHeight: 1.25,
              textTransform: 'uppercase',
              transform: isActive ? 'scale(1.15)' : 'scale(1)',
              transition: 'transform 0.08s ease-out',
              color: isActive ? '#FFE600' : isPast ? '#FFFFFF' : 'rgba(255, 255, 255, 0.75)',
              textShadow:
                '0 4px 16px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,1), -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 6px 0 #000',
              WebkitTextStroke: isActive ? '1px rgba(0,0,0,0.6)' : 'none',
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
