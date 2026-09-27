import { BodyVisionView } from '@rbayuokt/expo-body-vision';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DemoProps } from '../App';
import { DemoFrame } from '../components/DemoFrame';
import { Metric, PrimaryButton } from '../components/ui';
import { color } from '../theme';
import { useDemoInput } from './shared/input';

const CYCLES = 20;

/** Pauses, resumes, unmounts and remounts the view in a loop. Watch memory and threads in a profiler. */
export function LifecycleScreen({ onBack }: DemoProps) {
  const input = useDemoInput('squat-clean', true);
  const [cycle, setCycle] = useState(CYCLES);
  const [mounted, setMounted] = useState(true);
  const [active, setActive] = useState(true);
  const running = cycle < CYCLES;

  useEffect(() => {
    if (cycle >= CYCLES) return;
    const steps = [
      () => setActive(false),
      () => setActive(true),
      () => setMounted(false),
      () => {
        setMounted(true);
        setCycle((c) => c + 1);
      },
    ];
    let i = 0;
    const id = setInterval(() => {
      steps[i++]();
      if (i === steps.length) clearInterval(id);
    }, 400);
    return () => clearInterval(id);
  }, [cycle]);

  return (
    <DemoFrame
      title="Lifecycle"
      tag="Resources"
      onBack={onBack}
      camera={
        mounted ? (
          <BodyVisionView style={StyleSheet.absoluteFill} testInput={input} active={active} />
        ) : null
      }
      hud={
        <>
          <Text style={styles.note}>
            Each cycle pauses, resumes, unmounts and remounts the view. Memory and thread counts
            should stay flat across cycles.
          </Text>
          <View style={styles.row}>
            <Metric
              value={`${cycle}/${CYCLES}`}
              label="Cycles"
              tint={running ? color.amber : color.lime}
              testID="lifecycle-cycles"
            />
          </View>
          <PrimaryButton
            label={running ? 'Running' : `Run ${CYCLES} cycles`}
            disabled={running}
            onPress={() => setCycle(0)}
            testID="lifecycle-run"
          />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  note: { color: color.muted, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row' },
});
