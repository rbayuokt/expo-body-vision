import {
  BodyVisionView,
  tPose,
  type BodyVisionViewRef,
  type SetupState,
  type SetupStep,
} from '@rbayuokt/expo-body-vision';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn } from 'react-native-reanimated';

import type { DemoProps } from '../App';
import { CameraButtons } from '../components/CameraButtons';
import { DemoFrame } from '../components/DemoFrame';
import { FloatingStats } from '../components/FloatingStats';
import { GlowBorder } from '../components/GlowBorder';
import { GhostButton, Label } from '../components/ui';
import { color, space } from '../theme';
import { useDemoInput } from './shared/input';

// Custom steps: the library runs them natively and reports state. Everything drawn here is ours.
const STEPS: SetupStep[] = [
  'position',
  { pose: tPose(), prompt: 'Arms out wide to confirm' },
  'calibrate',
  { countdown: 3 },
];
const STEP_LABELS = ['Position', 'T-pose', 'Measure', 'Go'];

// Our own copy for the library's prompt codes, as a design might word them.
const PROMPTS = {
  noBody: 'Walk into the frame',
  tooClose: 'A bit further back',
  holdPosition: 'Nice. Stay right there',
  calibrating: 'Listening to your body…',
  done: 'Calibrated',
};

/**
 * A setup screen built only from `onSetupChange`: no <BodySetup /> overlay. While measuring, a
 * light runs around the screen edge.
 */
export function CustomSetupScreen({ onBack }: DemoProps) {
  const input = useDemoInput('setup-steps');
  const view = useRef<BodyVisionViewRef>(null);
  const [state, setState] = useState<SetupState | null>(null);
  const [text, setText] = useState('');

  const phase = state?.phase ?? 'positioning';
  const step = state?.step ?? 0;
  const measuring = phase === 'calibrating';

  return (
    <DemoFrame
      title="Custom setup"
      tag="Headless"
      onBack={onBack}
      camera={
        <BodyVisionView
          ref={view}
          style={StyleSheet.absoluteFill}
          testInput={input}
          skeleton={{
            boneColor: measuring ? color.cyan : 'rgba(255,255,255,0.7)',
            jointColor: measuring ? color.cyan : color.lime,
          }}
          setup={{ steps: STEPS, voice: true, prompts: PROMPTS }}
          onSetupChange={(s, prompt) => {
            setState(s);
            setText(prompt);
          }}>
          <CameraButtons />
          <FloatingStats />
        </BodyVisionView>
      }
      overlay={
        phase === 'countdown' && state?.countdown ? (
          <Animated.Text
            key={state.countdown}
            entering={ZoomIn.springify().damping(10)}
            exiting={FadeOut.duration(120)}
            style={styles.countdown}
            testID="custom-countdown">
            {state.countdown}
          </Animated.Text>
        ) : phase === 'done' ? (
          <Animated.View entering={ZoomIn.springify()} style={styles.doneBadge}>
            <Text style={styles.doneText}>READY</Text>
          </Animated.View>
        ) : null
      }
      foreground={<GlowBorder active={measuring} />}
      hud={
        <>
          <View style={styles.steps}>
            {STEP_LABELS.map((label, i) => {
              const state_ = i < step || phase === 'done' ? 'done' : i === step ? 'active' : 'todo';
              return (
                <View key={label} style={styles.step}>
                  <View style={[styles.stepBar, state_ !== 'todo' && styles.stepBarOn]}>
                    {state_ === 'active' ? (
                      <View
                        style={[
                          styles.stepFill,
                          { width: `${Math.round((state?.progress ?? 0) * 100)}%` },
                        ]}
                      />
                    ) : null}
                  </View>
                  <Label tint={state_ === 'todo' ? color.faint : color.text}>{label}</Label>
                </View>
              );
            })}
          </View>
          <Animated.Text
            key={text}
            entering={FadeInDown.duration(220)}
            style={styles.prompt}
            testID="custom-setup-text">
            {text}
          </Animated.Text>
          {phase === 'done' && state?.calibration ? (
            <Animated.View entering={FadeIn} style={styles.measures}>
              <Measure label="Torso" value={state.calibration.torsoLength} />
              <Measure label="Shoulders" value={state.calibration.shoulderWidth} />
              <Measure label="Arm" value={state.calibration.armLength} />
              <Measure label="Leg" value={state.calibration.legLength} />
            </Animated.View>
          ) : null}
          {phase === 'done' ? (
            <GhostButton
              label="Run it again"
              onPress={() => view.current?.restartSetup()}
              testID="custom-setup-restart"
            />
          ) : null}
        </>
      }
    />
  );
}

function Measure({ label, value }: { label: string; value?: number }) {
  return (
    <View style={styles.measure}>
      <Label>{label}</Label>
      <Text style={styles.measureValue}>
        {value === undefined ? '-' : `${Math.round(value * 100)}%`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', gap: space.sm },
  step: { flex: 1, gap: 6 },
  stepBar: { height: 6, borderRadius: 3, backgroundColor: color.raised, overflow: 'hidden' },
  stepBarOn: { backgroundColor: 'rgba(198,255,61,0.35)' },
  stepFill: { height: 6, backgroundColor: color.lime },
  prompt: { color: color.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  measures: { flexDirection: 'row', gap: space.sm },
  measure: { flex: 1, gap: 2 },
  measureValue: {
    color: color.lime,
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  countdown: {
    fontSize: 180,
    fontWeight: '900',
    color: color.text,
    textShadowColor: color.cyan,
    textShadowRadius: 30,
  },
  doneBadge: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: color.lime,
  },
  doneText: { color: color.limeInk, fontSize: 28, fontWeight: '900', letterSpacing: 4 },
});
