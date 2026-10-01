import { Canvas, Rect, Shader, useClock, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useBodyVisionEvents } from '../events';
import { addRep, EMPTY_REP_STATS } from '../stats';
import type { PoseEnteredEvent, RepEvent } from '../types';
import { AURA, FEVER } from './shaders';
import {
  compile,
  uniformNames,
  rgb,
  useEffectLevel,
  useLayoutSize,
  type EffectLevel,
} from './shared';

let feverEffect: SkRuntimeEffect | null = null;
let auraEffect: SkRuntimeEffect | null = null;

/** A full-view shader driven by a clock and an intensity from 0 to 1. */
function Glow({
  effect,
  intensity,
  color,
  width,
  height,
  from,
}: {
  /** Fraction of the height where drawing starts, so cheaper levels shade less. */
  from: number;
  effect: SkRuntimeEffect;
  intensity: SharedValue<number>;
  color: string;
  width: number;
  height: number;
}) {
  const clock = useClock();
  const tint = rgb(color);
  const names = uniformNames(effect);
  const uniforms = useDerivedValue(() => {
    const all: Record<string, number | number[]> = {
      size: [width, height],
      time: clock.value / 1000,
      intensity: intensity.value,
      tint,
      seed: 0.42,
      top: height * from,
    };
    const out: Record<string, number | number[]> = {};
    for (const n of names) out[n] = all[n];
    return out;
  });
  return (
    <Rect x={0} y={height * from} width={width} height={height * (1 - from)}>
      <Shader source={effect} uniforms={uniforms} />
    </Rect>
  );
}

export interface ComboFeverProps {
  /** Combo length where the fire starts. Default 5. */
  from?: number;
  /** Combo length where it reaches full strength. Default `from + 10`. */
  full?: number;
  /** Reps further apart than this end the combo. Default 900. */
  gapMs?: number;
  /** Exercise ids that count. Default all. */
  exercises?: string[];
  /** Default `#FF6B4A`. */
  color?: string;
  /** Banner text, `false` hides it. Default `x10 COMBO`. */
  banner?: ((combo: number) => string) | false;
  bannerStyle?: StyleProp<TextStyle>;
  /** Banner position from the top of the view, e.g. below your header. Default `11%`. */
  bannerTop?: DimensionValue;
  /** Called when the combo changes, 0 when it ends. */
  onCombo?: (combo: number) => void;
  /** `minimal` shows only the banner. `auto` (default) is balanced, minimal when the view reduces effects. */
  level?: EffectLevel;
}

/**
 * Once reps chain into a combo, flames lick in from the view's edges and grow with it, with a
 * shaking combo banner. Place it inside `BodyVisionView`.
 */
export function ComboFever({
  from = 5,
  full,
  gapMs = 900,
  exercises,
  color = '#FF6B4A',
  banner = (n) => `x${n} COMBO`,
  bannerStyle,
  bannerTop,
  onCombo,
  level = 'auto',
}: ComboFeverProps) {
  const tier = useEffectLevel(level);
  const { size, onLayout } = useLayoutSize();
  const intensity = useSharedValue(0);
  const [combo, setCombo] = useState(0);
  // The shader only runs while there is something to show.
  const [active, setActive] = useState(false);
  // Same combo rule as useRepStats, so the fire and an app's combo counter agree.
  const run = useRef(EMPTY_REP_STATS);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const top = full ?? from + 10;
  const pop = useSharedValue(1);
  const wobble = useSharedValue(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  useBodyVisionEvents((event) => {
    if (event.type !== 'repCompleted') return;
    const e = event as unknown as RepEvent;
    if (exercises && !exercises.includes(e.exercise)) return;
    run.current = addRep(run.current, e, gapMs);
    const n = run.current.combo;
    setCombo(n);
    onCombo?.(n);
    const target = n < from ? 0 : Math.min(1, 0.35 + (0.65 * (n - from)) / Math.max(1, top - from));
    if (target > 0) setActive(true);
    intensity.value = withTiming(target, { duration: 250 });
    if (n >= from) {
      pop.value = withSequence(withTiming(1.3, { duration: 70 }), withSpring(1));
      wobble.value = withSequence(
        withTiming(-6, { duration: 40 }),
        withRepeat(withTiming(6, { duration: 80 }), 3, true),
        withTiming(0, { duration: 40 })
      );
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      run.current = EMPTY_REP_STATS;
      setCombo(0);
      onCombo?.(0);
      intensity.value = withTiming(
        0,
        { duration: 600, easing: Easing.out(Easing.quad) },
        (done) => {
          if (done) runOnJS(setActive)(false);
        }
      );
    }, gapMs);
  });

  const bannerAnim = useAnimatedStyle(() => ({
    transform: [{ rotate: `${wobble.value}deg` }, { scale: pop.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {active && tier !== 'minimal' ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Glow
            effect={(feverEffect ??= compile(FEVER))}
            from={0}
            intensity={intensity}
            color={color}
            width={size.width}
            height={size.height}
          />
        </Canvas>
      ) : null}
      {banner && combo >= from ? (
        <Animated.View
          style={[styles.banner, bannerTop !== undefined && { top: bannerTop }, bannerAnim]}>
          <Text style={[styles.bannerText, { color }, bannerStyle]}>{banner(combo)}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

export interface PoseAuraProps {
  /** Pose ids that power it up. Default any pose. */
  poses?: string[];
  /** Holding this long reaches full strength. Default 3000. */
  growMs?: number;
  /** Default `#FFD23D`. */
  color?: string;
  /** `minimal` draws only the lowest strip, `balanced` the lower half. `auto` (default) is balanced, minimal when the view reduces effects. */
  level?: EffectLevel;
}

/**
 * While a pose is held, an energy aura rises from the bottom and sides of the view and grows the
 * longer it lasts. Place it inside `BodyVisionView`.
 */
export function PoseAura({
  poses,
  growMs = 3000,
  color = '#FFD23D',
  level = 'auto',
}: PoseAuraProps) {
  const tier = useEffectLevel(level);
  const { size, onLayout } = useLayoutSize();
  const intensity = useSharedValue(0);
  const held = useRef(new Set<string>());
  const [active, setActive] = useState(false);

  useBodyVisionEvents((event) => {
    if (event.type !== 'poseEntered' && event.type !== 'poseExited') return;
    const pose = (event as unknown as PoseEnteredEvent).pose;
    if (poses && !poses.includes(pose)) return;
    if (event.type === 'poseEntered') held.current.add(pose);
    else held.current.delete(pose);
    if (held.current.size > 0) {
      setActive(true);
      intensity.value = withSequence(
        withTiming(0.35, { duration: 200 }),
        withTiming(1, { duration: growMs, easing: Easing.in(Easing.quad) })
      );
    } else {
      intensity.value = withTiming(0, { duration: 500 }, (done) => {
        if (done) runOnJS(setActive)(false);
      });
    }
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {active ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Glow
            effect={(auraEffect ??= compile(AURA))}
            from={tier === 'max' ? 0 : tier === 'balanced' ? 0.45 : 0.72}
            intensity={intensity}
            color={color}
            width={size.width}
            height={size.height}
          />
        </Canvas>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', top: '11%', left: 0, right: 0, alignItems: 'center' },
  bannerText: {
    fontSize: 34,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 1,
    textShadowColor: '#000',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0.5,
  },
});
