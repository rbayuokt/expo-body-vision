import {
  BlurMask,
  Canvas,
  Group,
  RoundedRect,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const COLORS = ['#C6FF3D', '#3DD6FF', '#8B5CFF', '#FF6B4A', '#FFC23D', '#C6FF3D'];

/**
 * A light running around the screen edge, like an assistant listening. The gradient spins and
 * breathes on the UI thread. `active` fades it in and out.
 */
export function GlowBorder({ active, radius = 44 }: { active: boolean; radius?: number }) {
  const { width, height } = useWindowDimensions();
  const spin = useSharedValue(0);
  const breath = useSharedValue(0);
  const visible = useSharedValue(0);

  useEffect(() => {
    visible.value = withTiming(active ? 1 : 0, { duration: active ? 350 : 500 });
    if (!active) return;
    spin.value = 0;
    spin.value = withRepeat(withTiming(Math.PI * 2, { duration: 2600, easing: Easing.linear }), -1);
    breath.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    return () => {
      cancelAnimation(spin);
      cancelAnimation(breath);
    };
  }, [active, spin, breath, visible]);

  const center = vec(width / 2, height / 2);
  const rotate = useDerivedValue(() => [{ rotate: spin.value }]);
  const glowWidth = useDerivedValue(() => 18 + 14 * breath.value);
  const inset = 2;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group opacity={visible}>
        <RoundedRect
          x={inset}
          y={inset}
          width={width - inset * 2}
          height={height - inset * 2}
          r={radius}
          style="stroke"
          strokeWidth={glowWidth}>
          <SweepGradient c={center} colors={COLORS} origin={center} transform={rotate} />
          <BlurMask blur={18} style="normal" />
        </RoundedRect>
        <RoundedRect
          x={inset}
          y={inset}
          width={width - inset * 2}
          height={height - inset * 2}
          r={radius}
          style="stroke"
          strokeWidth={4}>
          <SweepGradient c={center} colors={COLORS} origin={center} transform={rotate} />
        </RoundedRect>
      </Group>
    </Canvas>
  );
}
