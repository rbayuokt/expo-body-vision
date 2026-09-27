import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, type LayoutChangeEvent, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { BodyVisionError } from '../errors';
import { useBodyVisionEvents } from '../events';
import type { PerformanceChangeEvent } from '../types';

export type Rgb = [number, number, number];

/** `#RRGGBB` or `#RGB` to 0..1 channels. */
export function rgb(hex: string): Rgb {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function compile(source: string): SkRuntimeEffect {
  const effect = Skia.RuntimeEffect.Make(source);
  if (!effect) throw new BodyVisionError('INVALID_CONFIG', 'The effect shader failed to compile.');
  return effect;
}

/** Uniform names the shader declares. Skia rejects values for undeclared ones. */
export function uniformNames(effect: SkRuntimeEffect): string[] {
  const names: string[] = [];
  for (let i = 0; i < effect.getUniformCount(); i++) names.push(effect.getUniformName(i));
  return names;
}

/**
 * How much an effect draws. `auto` is `balanced`, dropping to `minimal` while the view's
 * performance governor reduces effects because the phone can't keep up.
 */
export type EffectLevel = 'minimal' | 'balanced' | 'max' | 'auto';
export type ResolvedLevel = Exclude<EffectLevel, 'auto'>;

export function useEffectLevel(level: EffectLevel): ResolvedLevel {
  const [reduced, setReduced] = useState(false);
  useBodyVisionEvents((event) => {
    if (level !== 'auto' || event.type !== 'performanceChanged') return;
    const next = (event as unknown as PerformanceChangeEvent).reducedEffects;
    setReduced((r) => (r === next ? r : next));
  });
  if (level !== 'auto') return level;
  return reduced ? 'minimal' : 'balanced';
}

export function useLayoutSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  }, []);
  return { size, onLayout };
}

export interface WordProps {
  text: string;
  x: number;
  y: number;
  color: string;
  tilt: number;
  durationMs: number;
  /** Float upward while fading, like a score pickup. */
  rise?: boolean;
  width: number;
  style?: StyleProp<TextStyle>;
}

/** A word that pops in with a spring and fades out, centered on x, y. */
export function Word({ text, x, y, color, tilt, durationMs, rise, width, style }: WordProps) {
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(1);
  const lift = useSharedValue(0);
  useEffect(() => {
    scale.value = withSequence(
      withSpring(1.25, { damping: 6, stiffness: 420 }),
      withTiming(1, { duration: 120 })
    );
    opacity.value = withDelay(durationMs * 0.5, withTiming(0, { duration: durationMs * 0.45 }));
    if (rise) lift.value = withTiming(-70, { duration: durationMs });
  }, [scale, opacity, lift, durationMs, rise]);
  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: lift.value }, { rotate: `${tilt}deg` }, { scale: scale.value }],
  }));
  return (
    <Animated.Text
      style={[
        styles.word,
        { left: Math.min(Math.max(x - 100, 0), Math.max(0, width - 200)), top: y - 30, color },
        style,
        animated,
      ]}>
      {text}
    </Animated.Text>
  );
}

/**
 * A short jolt to put behind an effect: spread `style` onto an `Animated.View` around the
 * `BodyVisionView` and call `shake` from an effect's `onImpact`.
 */
export function useImpactShake(strength = 9) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));
  const shake = useCallback(() => {
    x.set(
      withSequence(
        withTiming(strength, { duration: 30 }),
        withTiming(-strength * 0.8, { duration: 40 }),
        withTiming(strength * 0.45, { duration: 40 }),
        withTiming(0, { duration: 50 })
      )
    );
    y.set(
      withSequence(
        withTiming(-strength * 0.65, { duration: 30 }),
        withTiming(strength * 0.55, { duration: 40 }),
        withTiming(0, { duration: 60 })
      )
    );
  }, [x, y, strength]);
  return { style, shake };
}

const styles = StyleSheet.create({
  word: {
    position: 'absolute',
    width: 200,
    height: 60,
    textAlign: 'center',
    fontSize: 44,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 1,
    textShadowColor: '#000',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0.5,
  },
});
