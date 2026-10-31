import React from 'react';
import { Composition } from 'remotion';
import { ShortComposition, ShortCompositionProps } from './ShortComposition.js';

const defaultProps: ShortCompositionProps = {
  serialId: 'VID-001',
  topic: 'What happens if you replace your femur with a titanium torsion spring?',
  targetDurationSeconds: 16,
  audioVoiceoverPath: 'audio/VID-001.mp3',
  clips: [
    {
      clipIndex: 1,
      durationSeconds: 5.3,
      visualAction:
        'Cutaway 3D skeletal leg, femur bone glows neon green and dissolves into a polished blue titanium frame with a heavy torsion spring.',
      spokenLine:
        'Replace the bones in your leg with a titanium frame and a massive torsion spring.',
      sfxCue: 'Pneumatic hiss, metallic lock click',
      mediaPath: 'clips/clip1.mp4',
    },
    {
      clipIndex: 2,
      durationSeconds: 5.0,
      visualAction:
        'Close-up macro shot of the torsion spring tightening and glowing red as a 3D character model crouches down.',
      spokenLine:
        'As you crouch, the springs twist tighter, storing energy instead of letting it escape.',
      sfxCue: 'High-tension ratchet winding sound',
      mediaPath: 'clips/clip2.mp4',
    },
    {
      clipIndex: 3,
      durationSeconds: 5.7,
      visualAction:
        'Wide shot of character launching off a stone courtyard, clearing an entire suburban house in a single superhuman bound.',
      spokenLine:
        'When you push off, the latches release all at once, launching you high enough to clear a house.',
      sfxCue: 'Sonic boom / spring release snap',
      mediaPath: 'clips/clip3.mp4',
    },
  ],
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ShortComposition"
        component={ShortComposition as React.FC<Record<string, unknown>>}
        durationInFrames={16 * 30}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps as Record<string, unknown>}
        calculateMetadata={({ props }) => {
          const typedProps = props as ShortCompositionProps;
          const clips = typedProps.clips || [];
          const durationSeconds =
            typedProps.targetDurationSeconds ||
            clips.reduce((acc, c) => acc + (c.durationSeconds || 0), 0) ||
            16;
          return {
            durationInFrames: Math.round(durationSeconds * 30),
            props: typedProps,
          };
        }}
      />
    </>
  );
};
