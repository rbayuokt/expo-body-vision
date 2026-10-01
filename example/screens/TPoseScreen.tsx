import { BodyVisionView, tPose } from '@rbayuokt/expo-body-vision';
import { PoseAura } from '@rbayuokt/expo-body-vision/effects';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DemoProps } from '../App';
import { CameraButtons } from '../components/CameraButtons';
import { DemoFrame } from '../components/DemoFrame';
import { FloatingStats } from '../components/FloatingStats';
import { StatusPill } from '../components/StatusPill';
import { Stat } from '../components/ui';
import { color } from '../theme';
import { useDemoInput } from './shared/input';

// Defined once. Native evaluates it on every inference and only reports enter and exit.
const RULES = [tPose()];

const seconds = (ms: number | null) => (ms === null ? '-' : `${(ms / 1000).toFixed(1)} s`);

export function TPoseScreen({ onBack }: DemoProps) {
  const input = useDemoInput('tpose-hold');
  const [holdingSince, setHoldingSince] = useState<number | null>(null);
  const [times, setTimes] = useState(0);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [longestMs, setLongestMs] = useState<number | null>(null);
  const holding = holdingSince !== null;

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
            setHoldingSince(Date.now());
            setTimes((n) => n + 1);
          }}
          onPoseExited={(e) => {
            setHoldingSince(null);
            setLastMs(e.durationMs);
            setLongestMs((m) => Math.max(m ?? 0, e.durationMs));
          }}>
          <PoseAura />
          <HoldPill since={holdingSince} />
          <CameraButtons />
          <FloatingStats />
        </BodyVisionView>
      }
      hud={
        <View style={styles.stats}>
          <Stat value={times} label="Triggered" tint={color.lime} testID="tpose-count" />
          <Stat value={seconds(lastMs)} label="Last hold" tint={color.text} />
          <Stat value={seconds(longestMs)} label="Longest" tint={color.amber} />
        </View>
      }
    />
  );
}

/** Under the header, so it never sits on the body. Counts up while the pose holds. */
function HoldPill({ since }: { since: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [since]);
  return (
    <StatusPill
      text={since === null ? 'Arms out to trigger' : `Holding ${seconds(Math.max(0, now - since))}`}
      dot={since === null ? color.muted : color.lime}
      filled={since !== null}
      testID="tpose-state"
    />
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row' },
});
