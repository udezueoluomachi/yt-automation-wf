import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Easing,
  Img,
} from 'remotion';
import { Video } from '@remotion/media';

export interface ClipItem {
  clipIndex: number;
  durationSeconds: number;
  visualAction: string;
  spokenLine: string;
  sfxCue: string;
  mediaPath?: string; // Optional path/url to generated Google Flow clip or image
}

export type ShortCompositionProps = {
  serialId: string;
  topic: string;
  targetDurationSeconds: number;
  clips: ClipItem[];
  [key: string]: unknown;
};

export const ShortComposition: React.FC<ShortCompositionProps> = ({
  serialId,
  topic,
  targetDurationSeconds,
  clips,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // Global progress bar calculation
  const progressPercent = Math.min(100, (frame / durationInFrames) * 100);

  // Background subtle pulse / mesh shift
  const bgShift = interpolate(frame, [0, durationInFrames], [0, 40], {
    extrapolateRight: 'clamp',
  });

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
        backgroundColor: '#07090e',
        color: '#ffffff',
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflow: 'hidden',
        width,
        height,
      }}
    >
      {/* Background radial atmosphere */}
      <div
        style={{
          position: 'absolute',
          top: -200 + bgShift,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 1400,
          height: 1400,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(16, 185, 129, 0.18) 0%, rgba(59, 130, 246, 0.08) 45%, rgba(0,0,0,0) 70%)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          bottom: -300 - bgShift,
          right: -200,
          width: 1200,
          height: 1200,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, rgba(236, 72, 153, 0.05) 50%, rgba(0,0,0,0) 70%)',
          filter: 'blur(90px)',
          pointerEvents: 'none',
        }}
      />

      {/* Top Header & Progress bar */}
      <div
        style={{
          position: 'absolute',
          top: 70,
          left: 50,
          right: 50,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          zIndex: 50,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              padding: '8px 20px',
              borderRadius: 30,
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 12px #10b981',
              }}
            />
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#f3f4f6',
              }}
            >
              {serialId || 'YT-SHORTS'}
            </span>
          </div>

          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: '#9ca3af',
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              padding: '8px 18px',
              borderRadius: 20,
            }}
          >
            {Math.floor(frame / fps)}s /{' '}
            {targetDurationSeconds || Math.floor(durationInFrames / fps)}s
          </div>
        </div>

        {/* Global Progress Bar */}
        <div
          style={{
            width: '100%',
            height: 6,
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #10b981, #3b82f6)',
              boxShadow: '0 0 10px rgba(16, 185, 129, 0.8)',
            }}
          />
        </div>
      </div>

      {/* Main Topic Card */}
      <div
        style={{
          position: 'absolute',
          top: 180,
          left: 50,
          right: 50,
          padding: '26px 32px',
          borderRadius: 24,
          backgroundColor: 'rgba(18, 22, 34, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(20px)',
          zIndex: 40,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            fontSize: 20,
            fontWeight: 800,
            color: '#60a5fa',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          HYPOTHETICAL EXPERIMENT
        </span>
        <h1
          style={{
            fontSize: 42,
            lineHeight: 1.25,
            fontWeight: 800,
            margin: 0,
            color: '#ffffff',
            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}
        >
          {topic}
        </h1>
      </div>

      {/* Clip Sequences */}
      {clipRanges.map(({ clip, from, durationFrames }) => (
        <Sequence
          key={clip.clipIndex}
          from={from}
          durationInFrames={durationFrames}
        >
          <ClipRenderer
            clip={clip}
            totalClips={clips.length}
            clipDurationFrames={durationFrames}
          />
        </Sequence>
      ))}

      {/* Bottom watermark / tag */}
      <div
        style={{
          position: 'absolute',
          bottom: 50,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: '0.15em',
          color: 'rgba(255, 255, 255, 0.35)',
          textTransform: 'uppercase',
        }}
      >
        YouTube Shorts Auto-Engine
      </div>
    </AbsoluteFill>
  );
};

const ClipRenderer: React.FC<{
  clip: ClipItem;
  totalClips: number;
  clipDurationFrames: number;
}> = ({ clip, totalClips, clipDurationFrames }) => {
  const frame = useCurrentFrame();

  const entranceOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const entranceScale = interpolate(frame, [0, 15], [0.94, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const exitOpacity = interpolate(
    frame,
    [clipDurationFrames - 10, clipDurationFrames],
    [1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(entranceOpacity, exitOpacity),
        transform: `scale(${entranceScale})`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 60px',
        zIndex: 30,
      }}
    >
      {/* Clip Sequence Step Pill */}
      <div
        style={{
          backgroundColor: '#2563eb',
          color: '#ffffff',
          padding: '8px 24px',
          borderRadius: 20,
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 30,
          boxShadow: '0 4px 20px rgba(37, 99, 235, 0.4)',
          letterSpacing: '0.05em',
        }}
      >
        CLIP {clip.clipIndex} OF {totalClips}
      </div>

      {/* Visual Media or Visual Action Box */}
      <div
        style={{
          width: '100%',
          minHeight: 480,
          borderRadius: 32,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          border: '2px solid rgba(59, 130, 246, 0.3)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '40px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {clip.mediaPath && clip.mediaPath.endsWith('.mp4') ? (
          <Video
            src={clip.mediaPath}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : clip.mediaPath ? (
          <Img
            src={clip.mediaPath}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : null}

        <div
          style={{
            position: 'absolute',
            top: 20,
            left: 24,
            fontSize: 18,
            fontWeight: 800,
            color: '#10b981',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            zIndex: 10,
          }}
        >
          🎬 VISUAL SCENE
        </div>

        <p
          style={{
            fontSize: 34,
            fontWeight: 600,
            color: '#e2e8f0',
            lineHeight: 1.45,
            margin: '40px 0 20px 0',
            position: 'relative',
            zIndex: 10,
            textShadow: '0 2px 10px rgba(0,0,0,0.8)',
          }}
        >
          {clip.visualAction}
        </p>

        {/* SFX Cue Indicator */}
        {clip.sfxCue && (
          <div
            style={{
              marginTop: 15,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              backgroundColor: 'rgba(245, 158, 11, 0.2)',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              color: '#fbbf24',
              padding: '8px 18px',
              borderRadius: 16,
              fontSize: 20,
              fontWeight: 600,
              position: 'relative',
              zIndex: 10,
            }}
          >
            <span>🔊 SFX:</span>
            <span>{clip.sfxCue}</span>
          </div>
        )}
      </div>

      {/* Kinetic Voiceover Subtitle Caption */}
      <div
        style={{
          marginTop: 50,
          width: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          borderRadius: 24,
          padding: '30px 36px',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            display: 'block',
            fontSize: 18,
            fontWeight: 800,
            color: '#93c5fd',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          🎙️ VOICE NARRATION
        </span>
        <p
          style={{
            fontSize: 38,
            fontWeight: 800,
            color: '#fef08a',
            lineHeight: 1.35,
            margin: 0,
            textShadow: '0 2px 12px rgba(0, 0, 0, 0.8)',
          }}
        >
          "{clip.spokenLine}"
        </p>
      </div>
    </AbsoluteFill>
  );
};
