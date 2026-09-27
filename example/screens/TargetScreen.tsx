import { BodyVisionView, defineTarget } from '@rbayuokt/expo-body-vision';
import { ImpactEffect } from '@rbayuokt/expo-body-vision/effects';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DemoProps } from '../App';
import { DemoFrame } from '../components/DemoFrame';
import { Metric, Readout } from '../components/ui';
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
  const [spot, setSpot] = useState(0);
  const [last, setLast] = useState('-');
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
            setHits((n) => n + 1);
            setLast(
              `${e.joint.startsWith('left') ? 'Left' : 'Right'} hand, ${e.speed.toFixed(1)}/s`
            );
            setSpot((s) => (s + 1) % SPOTS.length);
          }}>
          <ImpactEffect look="shatter" on="hits" />
        </BodyVisionView>
      }
      hud={
        <View style={styles.row}>
          <Metric value={`${hits}`} label="Hits" tint={color.lime} testID="hit-count" />
          <View style={styles.side}>
            <Readout label="Last hit" value={last} />
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  recorded: { width: '100%', aspectRatio: 9 / 16 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 24 },
  side: { flex: 1, paddingBottom: 8 },
});
