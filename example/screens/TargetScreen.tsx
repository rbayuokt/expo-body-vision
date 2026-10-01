import { BodyVisionView, defineTarget } from '@rbayuokt/expo-body-vision';
import { ImpactEffect } from '@rbayuokt/expo-body-vision/effects';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DemoProps } from '../App';
import { CameraButtons } from '../components/CameraButtons';
import { DemoFrame } from '../components/DemoFrame';
import { FloatingStats } from '../components/FloatingStats';
import { StatusPill } from '../components/StatusPill';
import { Stat } from '../components/ui';
import { color } from '../theme';
import { useDemoInput } from './shared/input';

// The recorded arm swing passes through the first spot.
const SPOTS = [
  { x: 0.9, y: 0.32 },
  { x: 0.2, y: 0.28 },
  { x: 0.78, y: 0.5 },
  { x: 0.3, y: 0.52 },
];

export function TargetScreen({ onBack }: DemoProps) {
  const input = useDemoInput('reach-target');
  const [hits, setHits] = useState(0);
  const [left, setLeft] = useState(0);
  const [right, setRight] = useState(0);
  const [top, setTop] = useState(0);
  const [spot, setSpot] = useState(0);
  const [last, setLast] = useState<{ hand: 'Left' | 'Right'; speed: number } | null>(null);
  const recorded = input !== null;

  // The pulse and particle burst run natively on hit. JS only moves the target afterwards.
  const rules = useMemo(
    () => [
      defineTarget({
        id: 'pad',
        ...SPOTS[recorded ? 0 : spot],
        radius: 0.07,
        cooldownMs: 1000,
        style: { color: color.text, hitColor: color.lime, lineWidth: 4, particles: 18 },
      }),
    ],
    [spot, recorded]
  );

  return (
    <DemoFrame
      title="Target game"
      tag="Interaction"
      onBack={onBack}
      camera={
        <BodyVisionView
          // Targets live in view fractions, so a recording only hits them the same way on every
          // phone when the view has the recording's shape (9:16, no crop).
          style={recorded ? styles.recorded : StyleSheet.absoluteFill}
          testInput={input}
          rules={rules}
          skeleton={{
            trails: [
              { joint: 'leftWrist', color: color.coral },
              { joint: 'rightWrist', color: color.cyan },
            ],
          }}
          onTargetHit={(e) => {
            const hand = e.joint.startsWith('left') ? 'Left' : 'Right';
            setHits((n) => n + 1);
            if (hand === 'Left') setLeft((n) => n + 1);
            else setRight((n) => n + 1);
            setTop((t) => Math.max(t, e.speed));
            setLast({ hand, speed: e.speed });
            setSpot((s) => (s + 1) % SPOTS.length);
          }}>
          <ImpactEffect look="shatter" on="hits" />
          <StatusPill
            text={last ? `${last.hand} hand · ${last.speed.toFixed(1)}/s` : 'Hit the circle'}
            dot={last ? (last.hand === 'Left' ? color.coral : color.cyan) : color.muted}
            testID="target-status"
          />
          <CameraButtons />
          <FloatingStats />
        </BodyVisionView>
      }
      hud={
        <>
          <View style={styles.stats}>
            <Stat value={hits} label="Hits" tint={color.lime} testID="hit-count" />
            <Stat value={left} label="Left" tint={color.coral} />
            <Stat value={right} label="Right" tint={color.cyan} />
            <Stat value={top ? top.toFixed(1) : '-'} label="Top speed" tint={color.amber} />
          </View>
          <Pressable
            onPress={() => {
              setHits(0);
              setLeft(0);
              setRight(0);
              setTop(0);
              setLast(null);
              setSpot(0);
            }}
            accessibilityRole="button"
            testID="target-reset"
            style={({ pressed }) => [styles.reset, pressed && styles.pressed]}>
            <Text style={styles.resetText}>↺ Reset</Text>
          </Pressable>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  recorded: { width: '100%', aspectRatio: 9 / 16 },
  stats: { flexDirection: 'row' },
  reset: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: color.raised,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  resetText: { color: color.text, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});
