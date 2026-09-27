import { Canvas, Rect, Shader, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { CONFETTI } from './shaders';
import { compile, rgb, useEffectLevel, useLayoutSize, type EffectLevel } from './shared';
import { useBodySetup } from '../setup/context';

const PALETTE = ['#C6FF3D', '#3DD6FF', '#FF6B4A', '#FFC23D', '#FF5CD1'];

let confettiEffect: SkRuntimeEffect | null = null;

export interface SetupConfettiProps {
  /** Five colors, used in turn. */
  colors?: string[];
  /** Text shown in the middle, `false` for none. Default `READY!`. */
  label?: string | false;
  labelStyle?: StyleProp<TextStyle>;
  durationMs?: number;
  /** Plays again whenever this changes, for your own moments like a finished workout. */
  trigger?: unknown;
  /** `minimal` shows only the label. `auto` (default) is balanced, minimal when the view reduces effects. */
  level?: EffectLevel;
}

function Shower({
  colors,
  width,
  height,
  durationMs,
  seed,
  onDone,
}: {
  seed: number;
  colors: string[];
  width: number;
  height: number;
  durationMs: number;
  onDone: () => void;
}) {
  const progress = useSharedValue(0);
  const c = [0, 1, 2, 3, 4].map((i) => rgb(colors[i % colors.length]));
  useEffect(() => {
    progress.value = withTiming(1, { duration: durationMs }, (done) => {
      if (done) runOnJS(onDone)();
    });
  }, [progress, durationMs, onDone]);
  const uniforms = useDerivedValue(() => ({
    size: [width, height],
    progress: progress.value,
    seed,
    c0: c[0],
    c1: c[1],
    c2: c[2],
    c3: c[3],
    c4: c[4],
  }));
  return (
    <Rect x={0} y={0} width={width} height={height}>
      <Shader source={(confettiEffect ??= compile(CONFETTI))} uniforms={uniforms} />
    </Rect>
  );
}

function Label({
  text,
  color,
  durationMs,
  style,
  onDone,
}: {
  text: string;
  color: string;
  durationMs: number;
  style?: StyleProp<TextStyle>;
  onDone: () => void;
}) {
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(1);
  useEffect(() => {
    scale.value = withSpring(1, { damping: 7, stiffness: 300 });
    opacity.value = withDelay(
      durationMs * 0.6,
      withTiming(0, { duration: durationMs * 0.35 }, (done) => {
        if (done) runOnJS(onDone)();
      })
    );
  }, [scale, opacity, durationMs, onDone]);
  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={[styles.center, animated]}>
      <Text style={[styles.label, { color }, style]}>{text}</Text>
    </Animated.View>
  );
}

/**
 * Confetti over the view when guided setup finishes, or whenever `trigger` changes. Place it
 * inside `BodyVisionView`.
 */
export function SetupConfetti({
  colors = PALETTE,
  label = 'READY!',
  labelStyle,
  durationMs = 2200,
  trigger,
  level = 'auto',
}: SetupConfettiProps) {
  const tier = useEffectLevel(level);
  const { size, onLayout } = useLayoutSize();
  const setup = useBodySetup();
  const done = setup?.state.phase === 'done';
  // Compared during render, React's pattern for reacting to a prop change without an effect.
  const [seen, setSeen] = useState({ done, trigger });
  const [played, setPlayed] = useState(0);
  const [finished, setFinished] = useState(0);
  if (seen.done !== done || seen.trigger !== trigger) {
    const fire = (done && !seen.done) || (trigger !== undefined && trigger !== seen.trigger);
    setSeen({ done, trigger });
    if (fire) setPlayed(played + 1);
  }
  const playing = played > finished ? played : 0;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {playing > 0 ? (
        <>
          {tier === 'minimal' ? null : (
            <Canvas style={StyleSheet.absoluteFill}>
              <Shower
                key={playing}
                seed={(playing * 0.618) % 1}
                colors={colors}
                width={size.width}
                height={size.height}
                durationMs={durationMs}
                onDone={() => setFinished(played)}
              />
            </Canvas>
          )}
          {label ? (
            <Label
              key={playing}
              text={label}
              color={colors[0]}
              durationMs={durationMs}
              style={labelStyle}
              onDone={() => setFinished(played)}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  label: {
    fontSize: 64,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 2,
    textShadowColor: '#000',
    textShadowOffset: { width: 4, height: 4 },
    textShadowRadius: 0.5,
  },
});
