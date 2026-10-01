import {
  BodyVisionView,
  punch,
  tPose,
  useRepStats,
  type BodyVisionViewRef,
  type SetupState,
  type SetupStep,
} from '@rbayuokt/expo-body-vision';
import { ComboFever, ImpactEffect, useImpactShake } from '@rbayuokt/expo-body-vision/effects';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import type { DemoProps } from '../App';
import { CameraButtons } from '../components/CameraButtons';
import { DemoFrame } from '../components/DemoFrame';
import { FloatingStats } from '../components/FloatingStats';
import { GlowBorder } from '../components/GlowBorder';
import { StatusPill } from '../components/StatusPill';
import { Label, Stat } from '../components/ui';
import { color, space } from '../theme';
import { useDemoInput } from './shared/input';

// The library runs these natively and reports state. Every pixel of the setup is drawn here.
const STEPS: SetupStep[] = [
  'position',
  { pose: tPose(), prompt: 'Arms out wide to confirm' },
  'calibrate',
  { countdown: 3 },
];
const TRACK = ['Position', 'T-pose', 'Measure', 'Fight'];
const PROMPTS = {
  noBody: 'Step into the ring',
  tooClose: 'Back up a little',
  holdPosition: 'Good stance. Hold it',
  calibrating: 'Reading your reach…',
  done: 'Unlocked',
};
const STEP_COLOR = [color.text, color.amber, color.cyan, color.lime];
const RULES = [punch()];
const UNLOCK_MS = 2200;

export function BoxingSetupScreen({ onBack }: DemoProps) {
  const view = useRef<BodyVisionViewRef>(null);
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [prompt, setPrompt] = useState('');
  // The unlock animation plays between setup finishing and the fight starting.
  const [unlocking, setUnlocking] = useState(false);
  const { stats, track, reset } = useRepStats();
  const shake = useImpactShake(12);
  const fighting = setup?.phase === 'done' && !unlocking;
  const input = useDemoInput(fighting ? 'punches' : 'setup-steps', fighting);

  useEffect(() => {
    if (!unlocking) return;
    const id = setTimeout(() => setUnlocking(false), UNLOCK_MS);
    return () => clearTimeout(id);
  }, [unlocking]);

  const restart = () => {
    view.current?.restartSetup();
    reset();
  };

  const step = setup?.step ?? 0;
  const phase = setup?.phase ?? 'positioning';
  const tint = STEP_COLOR[Math.min(step, STEP_COLOR.length - 1)];

  return (
    <DemoFrame
      title="Boxing setup"
      tag="Unlock to fight"
      onBack={onBack}
      camera={
        <Animated.View style={[StyleSheet.absoluteFill, shake.style]}>
          <BodyVisionView
            ref={view}
            style={StyleSheet.absoluteFill}
            testInput={input}
            skeleton={{
              boneColor: fighting ? 'rgba(255,255,255,0.8)' : tint,
              jointColor: color.lime,
            }}
            // Punches only count once setup is done, and the measured calibration applies.
            setup={{ steps: STEPS, voice: true, prompts: PROMPTS, startRules: 'afterSetup' }}
            rules={RULES}
            smoothing="none"
            {...track}
            onSetupChange={(s, text) => {
              setSetup(s);
              setPrompt(text);
            }}
            onSetupComplete={() => {
              setUnlocking(true);
              shake.shake();
            }}>
            {fighting ? (
              <>
                <ImpactEffect look="anime" onImpact={shake.shake} />
                <ComboFever from={5} bannerTop="18%" />
                <StatusPill text="Unlocked · throw punches" dot={color.lime} />
              </>
            ) : (
              <StatusPill
                text={`Step ${Math.min(step + 1, 4)} of 4 · ${TRACK[Math.min(step, 3)]}`}
                dot={tint}
              />
            )}
            <CameraButtons />
            <FloatingStats />
          </BodyVisionView>
        </Animated.View>
      }
      overlay={
        unlocking ? (
          <Unlock />
        ) : phase === 'countdown' && setup?.countdown ? (
          <Animated.Text
            key={setup.countdown}
            entering={ZoomIn.springify().damping(9)}
            exiting={FadeOut.duration(120)}
            style={styles.countdown}
            testID="boxing-setup-countdown">
            {setup.countdown}
          </Animated.Text>
        ) : null
      }
      foreground={<GlowBorder active={phase === 'calibrating' && !fighting} />}
      hud={
        fighting ? (
          <>
            <View style={styles.stats}>
              <Stat
                value={stats.count}
                label="Total"
                tint={color.lime}
                testID="boxing-setup-count"
              />
              <Stat value={stats.left} label="Left" tint={color.lime} />
              <Stat value={stats.right} label="Right" tint={color.cyan} />
              <Stat value={`x${stats.combo}`} label="Combo" tint={color.amber} />
              <Stat value={`x${stats.best}`} label="Best" tint={color.text} />
            </View>
            <Pressable
              onPress={restart}
              accessibilityRole="button"
              testID="boxing-setup-restart"
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>↺ Redo setup</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.track}>
              {TRACK.map((label, i) => {
                const done = i < step || unlocking;
                const active = i === step && !unlocking;
                return (
                  <View key={label} style={styles.trackStep}>
                    <View style={[styles.bar, done && { backgroundColor: STEP_COLOR[i] }]}>
                      {active ? (
                        <View
                          style={[
                            styles.fill,
                            {
                              backgroundColor: STEP_COLOR[i],
                              width: `${Math.round((setup?.progress ?? 0) * 100)}%`,
                            },
                          ]}
                        />
                      ) : null}
                    </View>
                    <Label tint={done || active ? STEP_COLOR[i] : color.faint}>{label}</Label>
                  </View>
                );
              })}
            </View>
            <Animated.Text
              key={prompt}
              entering={FadeInDown.duration(220)}
              style={styles.prompt}
              numberOfLines={1}
              adjustsFontSizeToFit
              testID="boxing-setup-text">
              {unlocking ? 'Unlocked. Get ready' : phase === 'countdown' ? 'Gloves up…' : prompt}
            </Animated.Text>
          </>
        )
      }
    />
  );
}

/** A padlock whose shackle springs open, then FIGHT! slams in over it. */
function Unlock() {
  const shackle = useSharedValue(0);
  const lock = useSharedValue(1);
  const lockScale = useSharedValue(0.6);
  const word = useSharedValue(0);

  useEffect(() => {
    lockScale.value = withSpring(1, { damping: 10, stiffness: 260 });
    shackle.value = withDelay(350, withSpring(1, { damping: 7, stiffness: 300 }));
    lock.value = withDelay(900, withTiming(0, { duration: 250 }));
    word.value = withDelay(950, withSpring(1, { damping: 8, stiffness: 320 }));
  }, [shackle, lock, lockScale, word]);

  const lockStyle = useAnimatedStyle(() => ({
    opacity: lock.value,
    transform: [{ scale: lockScale.value * (1 + (1 - lock.value) * 0.5) }],
  }));
  const shackleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -18 * shackle.value },
      { translateX: 14 * shackle.value },
      { rotate: `${25 * shackle.value}deg` },
    ],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, word.value * 1.5),
    transform: [{ scale: 2.4 - 1.4 * word.value }, { rotate: '-6deg' }],
  }));

  return (
    <View style={styles.unlock} testID="boxing-setup-unlock">
      <Animated.View style={[styles.lock, lockStyle]}>
        <Animated.View style={[styles.shackle, shackleStyle]} />
        <View style={styles.lockBody}>
          <View style={styles.keyhole} />
        </View>
      </Animated.View>
      <Animated.Text style={[styles.fight, wordStyle]}>FIGHT!</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: space.sm },
  trackStep: { flex: 1, gap: 6 },
  bar: { height: 6, borderRadius: 3, backgroundColor: color.raised, overflow: 'hidden' },
  fill: { height: 6 },
  prompt: { color: color.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  stats: { flexDirection: 'row' },
  button: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: color.raised,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  buttonText: { color: color.text, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.6 },
  countdown: {
    fontSize: 180,
    fontWeight: '900',
    color: color.text,
    textShadowColor: color.lime,
    textShadowRadius: 30,
  },
  unlock: { alignItems: 'center', justifyContent: 'center' },
  lock: { position: 'absolute', alignItems: 'center' },
  shackle: {
    width: 64,
    height: 60,
    borderWidth: 12,
    borderBottomWidth: 0,
    borderColor: color.lime,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginBottom: -4,
  },
  lockBody: {
    width: 104,
    height: 84,
    borderRadius: 20,
    backgroundColor: color.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyhole: { width: 14, height: 26, borderRadius: 7, backgroundColor: color.limeInk },
  fight: {
    fontSize: 84,
    fontWeight: '900',
    fontStyle: 'italic',
    color: color.lime,
    textShadowColor: '#000',
    textShadowOffset: { width: 5, height: 5 },
    textShadowRadius: 0.5,
  },
});
