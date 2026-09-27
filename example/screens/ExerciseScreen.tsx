import {
  BodyVisionView,
  pushUp,
  squat,
  type BodyVisionViewRef,
  type ExercisePhase,
  type RepRejectionReason,
} from '@rbayuokt/expo-body-vision';
import { BodySetup } from '@rbayuokt/expo-body-vision/setup';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DemoProps } from '../App';
import { DemoFrame, useHudInset } from '../components/DemoFrame';
import { PhaseTrack } from '../components/PhaseTrack';
import { Choice, GhostButton, Metric, Readout } from '../components/ui';
import { color } from '../theme';
import { useDemoInput } from './shared/input';

const EXERCISES = { pushup: [pushUp()], squat: [squat()] };
const FIXTURE = { pushup: 'pushup-partial-noisy', squat: 'squat-clean' };
const REASON: Record<RepRejectionReason, string> = {
  incomplete: 'incomplete',
  'too-fast': 'too fast',
  'too-slow': 'too slow',
  form: 'form',
  lost: 'lost track',
};

export function ExerciseScreen({ onBack }: DemoProps) {
  const [exercise, setExercise] = useState<keyof typeof EXERCISES>('pushup');
  const input = useDemoInput(FIXTURE[exercise]);
  const view = useRef<BodyVisionViewRef>(null);
  // Live camera: position and calibrate first, count after. Recorded input starts counting at once.
  const [ready, setReady] = useState(false);
  const counting = input !== null || ready;
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<ExercisePhase>('ready');
  const [rejected, setRejected] = useState('-');

  const switchTo = (next: keyof typeof EXERCISES) => {
    setExercise(next);
    setCount(0);
    setPhase('ready');
    setRejected('-');
    setReady(false);
  };

  const counters = (
    <>
      <View style={styles.row}>
        <Metric value={`${count}`} label="Reps" size={88} tint={color.lime} testID="rep-count" />
        <View style={styles.side}>
          <Readout label="Phase" value={phase} testID="rep-phase" />
          <Readout
            label="Not counted"
            value={rejected}
            tint={rejected === '-' ? color.muted : color.coral}
            testID="rep-rejected"
          />
        </View>
      </View>
      <PhaseTrack phase={phase} />
      <GhostButton
        label="Reset count"
        onPress={() => {
          view.current?.resetExercise();
          setCount(0);
        }}
        testID="rep-reset"
      />
    </>
  );

  return (
    <DemoFrame
      title="Rep counter"
      tag="State machine"
      onBack={onBack}
      camera={
        <BodyVisionView
          ref={view}
          key={exercise}
          style={StyleSheet.absoluteFill}
          testInput={input}
          rules={counting ? EXERCISES[exercise] : []}
          setup={
            input === null && !ready
              ? { framing: exercise === 'pushup' ? 'floor' : 'fullBody', voice: true }
              : false
          }
          onSetupComplete={() => setReady(true)}
          onRep={(e) => setCount(e.count)}
          onExercisePhase={(e) => setPhase(e.phase)}
          onRepRejected={(e) => setRejected(REASON[e.reason])}>
          <SetupOverlay />
        </BodyVisionView>
      }
      hud={
        <>
          <Choice
            options={['pushup', 'squat'] as const}
            labels={{ pushup: 'Push-up', squat: 'Squat' }}
            value={exercise}
            onChange={switchTo}
            testIDPrefix="exercise"
          />
          {counting ? (
            counters
          ) : (
            <Text style={styles.note}>
              {exercise === 'pushup'
                ? 'Phone sideways on the floor, side-on to the camera. Counting starts after setup.'
                : 'Stand side-on to the camera, whole body in view. Counting starts after setup.'}
            </Text>
          )}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  note: { color: color.muted, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 24 },
  side: { flex: 1, gap: 12, paddingBottom: 8 },
});

/** Rendered inside the camera, so it can read the frame's HUD inset. */
function SetupOverlay() {
  const inset = useHudInset();
  return <BodySetup accentColor={color.lime} topInset={inset.top} bottomInset={inset.bottom} />;
}
