import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Easing,
  staticFile,
} from 'remotion';
import { Video } from '@remotion/media';

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

export const ShortComposition: React.FC<ShortCompositionProps> = ({
  serialId,
  topic,
  targetDurationSeconds,
  clips,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // Overall progress bar (0% to 100%)
  const progressPercent = Math.min(100, (frame / durationInFrames) * 100);

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

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#05070d',
        color: '#ffffff',
        fontFamily:
          "'Montserrat', 'Arial Black', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflow: 'hidden',
        width,
        height,
      }}
    >
      {/* 1. Sequential Clips (Video + SFX + Kinetic Captions) */}
      {clipRanges.map(({ clip, from, durationFrames }) => (
        <Sequence
          key={clip.clipIndex}
          from={from}
          durationInFrames={durationFrames}
        >
          <ClipScene
            clip={clip}
            totalClips={clips.length}
            clipDurationFrames={durationFrames}
          />
        </Sequence>
      ))}

      {/* 2. Top Header & Title Overlay (persistent across whole Short) */}
      <TopOverlay
        serialId={serialId}
        topic={topic}
        progressPercent={progressPercent}
        frame={frame}
        fps={fps}
        targetDurationSeconds={
          targetDurationSeconds || Math.round(durationInFrames / fps)
        }
      />

      {/* 3. Bottom Brand Watermark */}
      <div
        style={{
          position: 'absolute',
          bottom: 36,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: '0.22em',
          color: 'rgba(255, 255, 255, 0.45)',
          textTransform: 'uppercase',
          textShadow: '0 2px 8px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
          zIndex: 60,
        }}
      >
        YT SHORTS LAB • OMNI VEO
      </div>
    </AbsoluteFill>
  );
};

/**
 * Top floating bar & hook headline
 */
const TopOverlay: React.FC<{
  serialId: string;
  topic: string;
  progressPercent: number;
  frame: number;
  fps: number;
  targetDurationSeconds: number;
}> = ({ serialId, topic, progressPercent, frame, fps, targetDurationSeconds }) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: '50px 48px 30px 48px',
        background:
          'linear-gradient(180deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0) 100%)',
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      {/* Sleek Glowing Progress Bar */}
      <div
        style={{
          width: '100%',
          height: 8,
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 24,
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            width: `${progressPercent}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #10b981, #06b6d4, #3b82f6)',
            boxShadow: '0 0 16px rgba(16, 185, 129, 0.9)',
          }}
        />
      </div>

      {/* Meta Header Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            backgroundColor: 'rgba(255, 255, 255, 0.12)',
            padding: '8px 20px',
            borderRadius: 24,
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: '#ef4444',
              boxShadow: '0 0 10px #ef4444',
            }}
          />
          <span
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#ffffff',
            }}
          >
            {serialId || 'YT-001'} • WHAT IF?
          </span>
        </div>

        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#cbd5e1',
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            padding: '8px 18px',
            borderRadius: 20,
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          {Math.floor(frame / fps)}s / {targetDurationSeconds}s
        </div>
      </div>

      {/* Main Punchy Topic Hook */}
      <div
        style={{
          backgroundColor: 'rgba(10, 15, 28, 0.75)',
          padding: '20px 28px',
          borderRadius: 24,
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          boxShadow: '0 16px 36px rgba(0, 0, 0, 0.5)',
        }}
      >
        <h1
          style={{
            fontSize: 38,
            lineHeight: 1.25,
            fontWeight: 900,
            margin: 0,
            color: '#ffffff',
            letterSpacing: '-0.02em',
            textShadow: '0 3px 12px rgba(0,0,0,0.85)',
          }}
        >
          {topic}
        </h1>
      </div>
    </div>
  );
};

/**
 * Single Clip Scene: Fullscreen Video Background + SFX Badge + Kinetic Subtitle
 */
const ClipScene: React.FC<{
  clip: ClipItem;
  totalClips: number;
  clipDurationFrames: number;
}> = ({ clip, totalClips, clipDurationFrames }) => {
  const frame = useCurrentFrame();

  const entranceOpacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const exitOpacity = interpolate(
    frame,
    [clipDurationFrames - 6, clipDurationFrames],
    [1, 0.3],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  const opacity = Math.min(entranceOpacity, exitOpacity);

  // Pop-in scale for the SFX Badge
  const sfxScale = interpolate(frame, [5, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.175, 0.885, 0.32, 1.275),
  });

  const mediaUrl = resolveMediaUrl(clip.mediaPath, clip.clipIndex);

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* Fullscreen Background Video Layer (Veo 9:16) */}
      <AbsoluteFill>
        <Video
          src={mediaUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </AbsoluteFill>

      {/* Dark Vignette Overlay for subtitle contrast */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.92) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Act Indicator & SFX Cue Badge (floating mid-top) */}
      <div
        style={{
          position: 'absolute',
          top: 360,
          left: 48,
          right: 48,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 40,
        }}
      >
        <div
          style={{
            backgroundColor: '#2563eb',
            color: '#ffffff',
            padding: '10px 24px',
            borderRadius: 30,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '0.08em',
            boxShadow: '0 6px 20px rgba(37, 99, 235, 0.5)',
            textTransform: 'uppercase',
          }}
        >
          ACT {clip.clipIndex} / {totalClips}
        </div>

        {clip.sfxCue && frame < 120 && (
          <div
            style={{
              transform: `scale(${sfxScale})`,
              transformOrigin: 'right center',
              backgroundColor: 'rgba(245, 158, 11, 0.92)',
              color: '#000000',
              padding: '10px 22px',
              borderRadius: 30,
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: '0.04em',
              boxShadow: '0 6px 22px rgba(245, 158, 11, 0.6)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>🔊</span>
            <span>{clip.sfxCue}</span>
          </div>
        )}
      </div>

      {/* Kinetic Subtitle Typography (Bottom Third) */}
      <KineticCaptions
        spokenLine={clip.spokenLine}
        clipDurationFrames={clipDurationFrames}
        frame={frame}
      />
    </AbsoluteFill>
  );
};

/**
 * Kinetic Subtitle Component
 * Displays the spoken line with animated high-impact word highlights
 */
const KineticCaptions: React.FC<{
  spokenLine: string;
  clipDurationFrames: number;
  frame: number;
}> = ({ spokenLine, clipDurationFrames, frame }) => {
  const words = spokenLine.trim().split(/\s+/);
  const totalWords = words.length;

  // Calculate current active word index based on playback progress
  const wordDuration = clipDurationFrames / Math.max(1, totalWords);
  const currentWordIndex = Math.min(
    totalWords - 1,
    Math.floor(frame / wordDuration)
  );

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 220,
        left: 48,
        right: 48,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 45,
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.82)',
          borderRadius: 28,
          padding: '28px 36px',
          border: '2px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85)',
          maxWidth: 980,
          textAlign: 'center',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 900,
            letterSpacing: '0.15em',
            color: '#38bdf8',
            textTransform: 'uppercase',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <span>🎙️</span>
          <span>NARRATION</span>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px 14px',
          }}
        >
          {words.map((word, idx) => {
            const isActive = idx === currentWordIndex;
            const isPast = idx < currentWordIndex;

            return (
              <span
                key={idx}
                style={{
                  display: 'inline-block',
                  fontSize: isActive ? 46 : 40,
                  fontWeight: 900,
                  lineHeight: 1.25,
                  transform: isActive ? 'scale(1.12)' : 'scale(1)',
                  transition: 'all 0.1s ease-out',
                  color: isActive
                    ? '#facc15'
                    : isPast
                    ? '#ffffff'
                    : 'rgba(255, 255, 255, 0.65)',
                  backgroundColor: isActive
                    ? 'rgba(234, 179, 8, 0.25)'
                    : 'transparent',
                  padding: isActive ? '2px 10px' : '0 2px',
                  borderRadius: 8,
                  textShadow: isActive
                    ? '0 0 20px rgba(250, 204, 21, 0.8), 0 3px 6px rgba(0,0,0,0.9)'
                    : '0 2px 6px rgba(0, 0, 0, 0.9)',
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
