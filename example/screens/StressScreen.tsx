import { BodyVisionView, pushUp, type BodyVisionStats } from '@rbayuokt/expo-body-vision';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DemoProps } from '../App';
import { DemoFrame } from '../components/DemoFrame';
import { Metric, PrimaryButton, Readout } from '../components/ui';
import { color } from '../theme';
import { useDemoInput } from './shared/input';

const RULES = [pushUp()];

function blockJsThread(ms: number) {
  const end = Date.now() + ms;
  let x = 0;
  while (Date.now() < end) x += Math.sqrt(x + 1);
  return x;
}

/**
 * Blocks the JS thread while tracking keeps going. The skeleton keeps moving and reps keep
 * counting natively. Their events arrive together once JS is free again.
 */
export function StressScreen({ onBack }: DemoProps) {
  const input = useDemoInput('pushup-clean');
  const [reps, setReps] = useState(0);
  const [during, setDuring] = useState('-');
  const awaitingStats = useRef(false);

  const onStats = (s: BodyVisionStats) => {
    // Stats are coalesced natively, so the first one after the block describes the block.
    if (!awaitingStats.current) return;
    awaitingStats.current = false;
    setDuring(`${s.renderFps.toFixed(0)} fps drawn`);
  };

  return (
    <DemoFrame
      title="Freeze JS"
      tag="Threading"
      onBack={onBack}
      camera={
        <BodyVisionView
          style={StyleSheet.absoluteFill}
          testInput={input}
          rules={RULES}
          skeleton={{ trails: [{ joint: 'leftWrist', color: color.lime }, { joint: 'rightWrist', color: color.cyan }] }}
          onRep={(e) => setReps(e.count)}
          onStats={onStats}
        />
      }
      hud={
        <>
          <Text style={styles.note}>
            Freezing JavaScript stops this panel from updating. The skeleton, trails and rep counting
            keep running natively.
          </Text>
          <View style={styles.row}>
            <Metric value={`${reps}`} label="Reps" tint={color.lime} testID="stress-reps" />
            <View style={styles.side}>
              <Readout label="While frozen" value={during} testID="stress-during" />
            </View>
          </View>
          <PrimaryButton
            label="Freeze JS for 4 s"
            onPress={() => {
              blockJsThread(4000);
              awaitingStats.current = true;
            }}
            testID="block-js"
          />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  note: { color: color.muted, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 24 },
  side: { flex: 1, paddingBottom: 8 },
});
