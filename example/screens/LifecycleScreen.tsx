import { BodyVisionView } from '@rbayuokt/expo-body-vision';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DemoProps } from '../App';
import { CameraButtons } from '../components/CameraButtons';
import { DemoFrame } from '../components/DemoFrame';
import { FloatingStats } from '../components/FloatingStats';
import { StatusPill } from '../components/StatusPill';
import { PrimaryButton, Stat } from '../components/ui';
import { color } from '../theme';
import { useDemoInput } from './shared/input';

const CYCLES = 20;

/** Pauses, resumes, unmounts and remounts the view in a loop. Watch memory and threads in a profiler. */
export function LifecycleScreen({ onBack }: DemoProps) {
  const input = useDemoInput('squat-clean', true);
  const [cycle, setCycle] = useState(CYCLES);
  const [mounted, setMounted] = useState(true);
  const [active, setActive] = useState(true);
  const [mounts, setMounts] = useState(1);
  const running = cycle < CYCLES;

  useEffect(() => {
    if (cycle >= CYCLES) return;
    const steps = [
      () => setActive(false),
      () => setActive(true),
      () => setMounted(false),
      () => {
        setMounted(true);
        setMounts((n) => n + 1);
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

  const state = !mounted ? 'Unmounted' : active ? 'Live' : 'Paused';

  return (
    <DemoFrame
      title="Lifecycle"
      tag="Resources"
      onBack={onBack}
      camera={
        mounted ? (
          <BodyVisionView style={StyleSheet.absoluteFill} testInput={input} active={active}>
            <StatusPill
              text={
                running ? `Cycle ${cycle + 1} of ${CYCLES} · ${state}` : 'Ready to stress the view'
              }
              dot={running ? color.amber : color.lime}
            />
            <CameraButtons />
            <FloatingStats />
          </BodyVisionView>
        ) : null
      }
      hud={
        <>
          <View style={styles.track}>
            {Array.from({ length: CYCLES }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.tick,
                  i < cycle && styles.tickDone,
                  running && i === cycle && styles.tickNow,
                ]}
              />
            ))}
          </View>
          <View style={styles.stats}>
            <Stat
              value={`${cycle}/${CYCLES}`}
              label="Cycles"
              tint={running ? color.amber : color.lime}
              testID="lifecycle-cycles"
            />
            <Stat value={state} label="View" tint={state === 'Live' ? color.lime : color.muted} />
            <Stat value={mounts} label="Mounts" tint={color.text} />
          </View>
          <Text style={styles.note}>
            Pause, resume, unmount, remount. Memory and threads should stay flat.
          </Text>
          <PrimaryButton
            label={running ? 'Running…' : `Run ${CYCLES} cycles`}
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
  track: { flexDirection: 'row', gap: 3 },
  tick: { flex: 1, height: 6, borderRadius: 3, backgroundColor: color.raised },
  tickDone: { backgroundColor: color.lime },
  tickNow: { backgroundColor: color.amber },
  stats: { flexDirection: 'row' },
  note: { color: color.muted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
