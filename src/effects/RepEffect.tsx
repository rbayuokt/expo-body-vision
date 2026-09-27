import { Canvas, Rect, Shader, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useBodyVisionEvents } from '../events';
import type { RepEvent, RepRejectedEvent, RepRejectionReason } from '../types';
import { LEVEL_UP, SHATTER, SLAM } from './shaders';
import {
  compile,
  rgb,
  uniformNames,
  useEffectLevel,
  useLayoutSize,
  type EffectLevel,
} from './shared';

export type RepLabel = 'good' | 'perfect' | RepRejectionReason;

export interface RepEffectProps {
  /** `slam` answers every rep and rejection, `levelUp` fires every `every` reps. Default `slam`. */
  look?: 'slam' | 'levelUp';
  /** Exercise ids that trigger it. Default all. */
  exercises?: string[];
  /** For `levelUp`. Default 5. */
  every?: number;
  /** `slam`: clean reps in a row before a rep reads "PERFECT!". Default 3. */
  perfectAfter?: number;
  /** Text per outcome, merged over the defaults. A rejection reason set to `''` shows nothing. */
  labels?: Partial<Record<RepLabel, string>>;
  /** `levelUp` text. Default `LEVEL n`. */
  levelLabel?: (level: number) => string;
  colors?: { good?: string; perfect?: string; rejected?: string; level?: string };
  /** Show the rep count in big numerals. Default true. */
  showCount?: boolean;
  textStyle?: StyleProp<TextStyle>;
  /** Ring radius in points. Default 150. */
  size?: number;
  durationMs?: number;
  /** Called whenever it plays. */
  onPlay?: (label: string) => void;
  /** `minimal` shows only the text, `balanced` draws the burst near the middle, `max` over the whole view. `auto` (default) is balanced, minimal when the view reduces effects. */
  level?: EffectLevel;
}

const LABELS: Record<RepLabel, string> = {
  good: 'GOOD!',
  perfect: 'PERFECT!',
  incomplete: 'HALF REP',
  'too-fast': 'TOO FAST',
  'too-slow': 'TOO SLOW',
  form: 'CHECK FORM',
  lost: '',
};

const COLORS = { good: '#C6FF3D', perfect: '#FFC23D', rejected: '#FF4A4A', level: '#FFC23D' };

interface Play {
  id: number;
  big: string | null;
  label: string;
  color: string;
  shader: 'slam' | 'crack' | 'level';
  seed: number;
}

let slamEffect: SkRuntimeEffect | null = null;
let crackEffect: SkRuntimeEffect | null = null;
let levelEffect: SkRuntimeEffect | null = null;

function effectFor(kind: Play['shader']): SkRuntimeEffect {
  if (kind === 'slam') return (slamEffect ??= compile(SLAM));
  if (kind === 'crack') return (crackEffect ??= compile(SHATTER));
  return (levelEffect ??= compile(LEVEL_UP));
}

function Burst({
  play,
  size,
  reach,
  durationMs,
  width,
  height,
  onDone,
}: {
  play: Play;
  size: number;
  /** Draw area in multiples of size, Infinity for the whole view. */
  reach: number;
  durationMs: number;
  width: number;
  height: number;
  onDone: (id: number) => void;
}) {
  const effect = effectFor(play.shader);
  const names = uniformNames(effect);
  const progress = useSharedValue(0);
  const tint = rgb(play.color);
  const radius = play.shader === 'crack' ? size * 0.7 : size;
  useEffect(() => {
    progress.value = withTiming(
      1,
      { duration: durationMs, easing: Easing.out(Easing.cubic) },
      (done) => {
        if (done) runOnJS(onDone)(play.id);
      }
    );
  }, [progress, play.id, durationMs, onDone]);
  const uniforms = useDerivedValue(() => {
    const all: Record<string, number | number[]> = {
      center: [width / 2, height / 2],
      progress: progress.value,
      radius,
      tint,
      seed: play.seed,
      useLines: 1,
      useFlash: 1,
      useRing: 1,
    };
    const out: Record<string, number | number[]> = {};
    for (const n of names) out[n] = all[n];
    return out;
  });
  return (
    <Rect
      x={Number.isFinite(reach) ? Math.max(0, width / 2 - size * reach) : 0}
      y={Number.isFinite(reach) ? Math.max(0, height / 2 - size * reach) : 0}
      width={Number.isFinite(reach) ? Math.min(width, size * reach * 2) : width}
      height={Number.isFinite(reach) ? Math.min(height, size * reach * 2) : height}>
      <Shader source={effect} uniforms={uniforms} />
    </Rect>
  );
}

function Title({
  play,
  durationMs,
  style,
}: {
  play: Play;
  durationMs: number;
  style?: StyleProp<TextStyle>;
}) {
  const scale = useSharedValue(play.shader === 'crack' ? 1 : 2.2);
  const opacity = useSharedValue(1);
  const shakeX = useSharedValue(0);
  useEffect(() => {
    scale.value = withSequence(
      withTiming(0.92, { duration: 140, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 16, stiffness: 300 })
    );
    opacity.value = withDelay(durationMs * 0.55, withTiming(0, { duration: durationMs * 0.4 }));
    if (play.shader === 'crack') {
      shakeX.value = withSequence(
        withTiming(10, { duration: 40 }),
        withTiming(-8, { duration: 50 }),
        withTiming(5, { duration: 50 }),
        withTiming(0, { duration: 60 })
      );
    }
  }, [scale, opacity, shakeX, durationMs, play.shader]);
  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: shakeX.value }, { scale: scale.value }],
  }));
  return (
    <Animated.View style={[styles.center, animated]} pointerEvents="none">
      {play.big ? <Text style={[styles.big, { color: play.color }, style]}>{play.big}</Text> : null}
      {play.label ? (
        <Text style={[styles.label, { color: play.color }, style]}>{play.label}</Text>
      ) : null}
    </Animated.View>
  );
}

/**
 * Feedback for exercises counted in full cycles, like squats and push-ups: the count slams in
 * with a shockwave, a rejected rep cracks red with the reason, and `levelUp` celebrates every
 * few reps. Needs no position, so it works with every exercise. Place it inside `BodyVisionView`.
 */
export function RepEffect({
  look = 'slam',
  exercises,
  every = 5,
  perfectAfter = 3,
  labels,
  levelLabel = (n) => `LEVEL ${n}`,
  colors,
  showCount = true,
  textStyle,
  size = 150,
  durationMs = 750,
  onPlay,
  level = 'auto',
}: RepEffectProps) {
  const tier = useEffectLevel(level);
  const [plays, setPlays] = useState<Play[]>([]);
  const { size: box, onLayout } = useLayoutSize();
  const nextId = useRef(0);
  const streak = useRef(0);
  const text = { ...LABELS, ...labels };
  const tone = { ...COLORS, ...colors };

  const done = useCallback(
    (id: number) => setPlays((current) => current.filter((p) => p.id !== id)),
    []
  );

  const play = (p: Omit<Play, 'id' | 'seed'>) => {
    const id = nextId.current++;
    setPlays((current) => [...current.slice(-3), { ...p, id, seed: Math.random() }]);
    // Minimal draws no burst, whose end would otherwise remove the play.
    if (tier === 'minimal') setTimeout(() => done(id), durationMs);
    onPlay?.(p.label || p.big || '');
  };

  useBodyVisionEvents((event) => {
    if (event.type === 'repCompleted') {
      const e = event as unknown as RepEvent;
      if (exercises && !exercises.includes(e.exercise)) return;
      streak.current += 1;
      if (look === 'levelUp') {
        if (e.count % every === 0) {
          play({
            big: null,
            label: levelLabel(e.count / every + 1),
            color: tone.level,
            shader: 'level',
          });
        }
        return;
      }
      const perfect = streak.current >= perfectAfter;
      play({
        big: showCount ? `${e.count}` : null,
        label: perfect ? text.perfect : text.good,
        color: perfect ? tone.perfect : tone.good,
        shader: 'slam',
      });
    } else if (event.type === 'repRejected') {
      const e = event as unknown as RepRejectedEvent;
      if (exercises && !exercises.includes(e.exercise)) return;
      streak.current = 0;
      const label = text[e.reason];
      if (look !== 'slam' || !label) return;
      play({ big: null, label, color: tone.rejected, shader: 'crack' });
    }
  });

  const last = plays[plays.length - 1];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      <Canvas style={StyleSheet.absoluteFill}>
        {tier === 'minimal'
          ? null
          : plays.map((p) => (
              <Burst
                key={p.id}
                play={p}
                size={size}
                reach={tier === 'max' ? Infinity : 1.8}
                durationMs={durationMs}
                width={box.width}
                height={box.height}
                onDone={done}
              />
            ))}
      </Canvas>
      {last ? <Title key={last.id} play={last} durationMs={durationMs} style={textStyle} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  big: {
    fontSize: 120,
    fontWeight: '900',
    fontStyle: 'italic',
    fontVariant: ['tabular-nums'],
    textShadowColor: '#000',
    textShadowOffset: { width: 4, height: 4 },
    textShadowRadius: 0.5,
  },
  label: {
    fontSize: 38,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 1,
    textShadowColor: '#000',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0.5,
  },
});
