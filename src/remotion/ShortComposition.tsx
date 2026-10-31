import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  staticFile,
  Easing,
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

  // Cumulative frame timing
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
      {/* 1. Synchronized Voiceover Audio Track (Ludo / Zack D. Films style from AI Studio) */}
      {voiceoverUrl && <Audio src={voiceoverUrl} />}

      {/* 2. Sequential Video Clips with Dynamic Pacing & Transitions */}
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
 * Single Clip Scene: Fullscreen Video Background + Dynamic Motion Punch + Seamless Cut
 */
const ClipScene: React.FC<{
  clip: ClipItem;
  clipDurationFrames: number;
}> = ({ clip, clipDurationFrames }) => {
  const frame = useCurrentFrame();
  const mediaUrl = resolveMediaUrl(clip.mediaPath, clip.clipIndex);

  // Subtle camera scale-punch on cut (1.06 -> 1.0) so transitions feel energetic and alive
  const cameraScale = interpolate(frame, [0, 9], [1.06, 1.0], {
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // Smooth 4-frame cross-fade entrance & exit to prevent jarring cuts
  const fadeIn = interpolate(frame, [0, 4], [0.3, 1], {
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(
    frame,
    [clipDurationFrames - 4, clipDurationFrames],
    [1, 0.4],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* Fullscreen 3D Video Layer with dynamic scale */}
      <AbsoluteFill
        style={{
          transform: `scale(${cameraScale})`,
          transformOrigin: 'center center',
        }}
      >
        <Video
          src={mediaUrl}
          objectFit="cover"
          style={{
            width: '100%',
            height: '100%',
          }}
        />
      </AbsoluteFill>

      {/* Clean Kinetic Subtitle Typography (No background box, floating directly on video) */}
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
 * Accurately highlights each word in real-time as Ludo speaks the line.
 */
const KineticCaptions: React.FC<{
  spokenLine: string;
  clipDurationFrames: number;
  frame: number;
}> = ({ spokenLine, clipDurationFrames, frame }) => {
  const words = spokenLine.trim().split(/\s+/);
  const totalWords = words.length;

  // Active word calculation matched to speaking tempo (~0.33s per word)
  const speechFrames = Math.min(clipDurationFrames, Math.round(totalWords * 10)); // ~0.33s per word at 30fps
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
