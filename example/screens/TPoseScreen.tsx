import { BodyVisionView, tPose } from '@rbayuokt/expo-body-vision';
import { PoseAura } from '@rbayuokt/expo-body-vision/effects';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DemoProps } from '../App';
import { DemoFrame } from '../components/DemoFrame';
import { Metric, Readout } from '../components/ui';
import { color } from '../theme';
import { useDemoInput } from './shared/input';

// Defined once. Native evaluates it on every inference and only reports enter and exit.
const RULES = [tPose()];

export function TPoseScreen({ onBack }: DemoProps) {
  const input = useDemoInput('tpose-hold');
  const [holding, setHolding] = useState(false);
  const [times, setTimes] = useState(0);
  const [lastMs, setLastMs] = useState<number | null>(null);

  return (
    <DemoFrame
      title="T-pose trigger"
      tag="Rules"
      onBack={onBack}
      camera={
        <BodyVisionView
          style={StyleSheet.absoluteFill}
          testInput={input}
          rules={RULES}
          skeleton={{
            jointColor: holding ? color.lime : color.text,
            boneColor: holding ? color.lime : color.text,
          }}
          onPoseEntered={() => {
            setHolding(true);
            setTimes((n) => n + 1);
          }}
          onPoseExited={(e) => {
            setHolding(false);
            setLastMs(e.durationMs);
          }}>
          <PoseAura />
        </BodyVisionView>
      }
      overlay={
        <Text style={[styles.status, { color: holding ? color.lime : 'rgba(244,247,242,0.35)' }]}>
          {holding ? 'HOLD' : 'ARMS OUT'}
        </Text>
      }
      hud={
        <View style={styles.row}>
          <Metric value={`${times}`} label="Triggered" testID="tpose-count" />
          <View style={styles.side}>
            <Readout
              label="State"
              value={holding ? 'holding' : 'waiting'}
              tint={holding ? color.lime : color.muted}
              testID="tpose-state"
            />
            <Readout
              label="Last hold"
              value={lastMs === null ? '-' : `${(lastMs / 1000).toFixed(1)} s`}
            />
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  status: { fontSize: 44, fontWeight: '900', letterSpacing: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 24 },
  side: { flex: 1, gap: 12 },
});
