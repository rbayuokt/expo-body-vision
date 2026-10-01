import {
  BodyVisionView,
  pushUp,
  squat,
  type BodyVisionViewRef,
  type ExercisePhase,
  type RepRejectionReason,
  useRepStats,
} from '@rbayuokt/expo-body-vision';
import { RepEffect } from '@rbayuokt/expo-body-vision/effects';
import { BodySetup } from '@rbayuokt/expo-body-vision/setup';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DemoProps } from '../App';
import { CameraButtons } from '../components/CameraButtons';
import { DemoFrame, useHudInset } from '../components/DemoFrame';
import { FloatingStats } from '../components/FloatingStats';
import { PhaseTrack } from '../components/PhaseTrack';
import { StatusPill } from '../components/StatusPill';
import { Segmented, Stat } from '../components/ui';
import { color } from '../theme';
import { useDemoInput } from './shared/input';

type Exercise = 'pushup' | 'squat';

const EXERCISES = { pushup: [pushUp()], squat: [squat()] };
const FIXTURE = { pushup: 'pushup-partial-noisy', squat: 'squat-clean' };
const OPTIONS: { id: Exercise; label: string }[] = [
  { id: 'pushup', label: 'Push-up' },
  { id: 'squat', label: 'Squat' },
];
const REASON: Record<RepRejectionReason, string> = {
  incomplete: 'Half rep, go deeper',
  'too-fast': 'Too fast, slow down',
  'too-slow': 'Too slow',
  form: 'Check your form',
  lost: 'Lost track of you',
};

type Status = { tone: 'idle' | 'good' | 'miss'; text: string };
const IDLE: Status = { tone: 'idle', text: 'Start when ready' };

export function ExerciseScreen({ onBack }: DemoProps) {
  const [exercise, setExercise] = useState<Exercise>('pushup');
  const input = useDemoInput(FIXTURE[exercise]);
  const view = useRef<BodyVisionViewRef>(null);
  // Live camera: setup first, and the library holds the rules until it's done. Recorded input
  // skips setup and counts at once.
  const [ready, setReady] = useState(false);
  const counting = input !== null || ready;
  const { stats, track, reset } = useRepStats();
  const [phase, setPhase] = useState<ExercisePhase>('ready');
  const [status, setStatus] = useState<Status>(IDLE);

  const clear = () => {
    reset();
    setPhase('ready');
    setStatus(IDLE);
  };

  const switchTo = (next: Exercise) => {
    setExercise(next);
    setReady(false);
    clear();
  };

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
          rules={EXERCISES[exercise]}
          setup={
            input === null
              ? {
                  framing: exercise === 'pushup' ? 'floor' : 'fullBody',
                  voice: true,
                  startRules: 'afterSetup',
                }
              : false
          }
          onSetupComplete={() => setReady(true)}
          onRep={(e) => {
            track.onRep(e);
            setStatus({ tone: 'good', text: 'Good rep' });
          }}
          onExercisePhase={(e) => setPhase(e.phase)}
          onRepRejected={(e) => {
            track.onRepRejected(e);
            setStatus({ tone: 'miss', text: REASON[e.reason] });
          }}>
          <SetupOverlay />
          {/* The panel already shows the count, so the effects only say how the rep went. */}
          {counting ? <RepEffect showCount={false} /> : null}
          {counting ? <RepEffect look="levelUp" every={5} /> : null}
          {counting ? (
            <StatusPill
              text={status.text}
              dot={
                status.tone === 'good'
                  ? color.lime
                  : status.tone === 'miss'
                    ? color.coral
                    : color.muted
              }
              testID="rep-status"
            />
          ) : null}
          <CameraButtons />
          <FloatingStats />
        </BodyVisionView>
      }
      hud={
        <>
          <Segmented
            options={OPTIONS}
            value={exercise}
            onChange={switchTo}
            testIDPrefix="exercise"
          />
          {counting ? (
            <>
              <View style={styles.stats}>
                <Stat value={stats.count} label="Reps" tint={color.lime} testID="rep-count" />
                <Stat
                  value={stats.missed}
                  label="Not counted"
                  tint={color.coral}
                  testID="rep-rejected"
                />
                <Stat value={stats.streak} label="Streak" tint={color.amber} />
              </View>
              <PhaseTrack phase={phase} />
              <Pressable
                onPress={() => {
                  view.current?.resetExercise();
                  clear();
                }}
                accessibilityRole="button"
                testID="rep-reset"
                style={({ pressed }) => [styles.reset, pressed && styles.pressed]}>
                <Text style={styles.resetText}>↺ Reset</Text>
              </Pressable>
            </>
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

/** Rendered inside the camera, so it can read the frame's HUD inset. */
function SetupOverlay() {
  const inset = useHudInset();
  return <BodySetup accentColor={color.lime} topInset={inset.top} bottomInset={inset.bottom} />;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row' },
  note: { color: color.muted, fontSize: 14, lineHeight: 20 },
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
