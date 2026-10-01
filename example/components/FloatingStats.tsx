import { useBodyVisionStats } from '@rbayuokt/expo-body-vision';
import { useEffect, useState } from 'react';
import { PanResponder, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { color, type } from '../theme';
import { useHudInset } from './DemoFrame';

const DOT = 52;
const CARD = { width: 168, height: 132 };
const MARGIN = 12;
const IDLE_MS = 2500;

function health(fps: number) {
  if (fps >= 50) return color.lime;
  if (fps >= 30) return color.amber;
  return color.coral;
}

/**
 * A small badge that floats over the camera like AssistiveTouch: drag it anywhere, it snaps to
 * the nearest side, tap it to open the numbers. Fades while idle. Stays between the header and
 * the HUD. Place it inside a `BodyVisionView`, it reads that view's stats.
 */
export function FloatingStats() {
  const stats = useBodyVisionStats();
  const { width, height } = useWindowDimensions();
  const inset = useHudInset();
  const [open, setOpen] = useState(false);
  const size = open ? CARD : { width: DOT, height: DOT };
  // Starts on the left, the camera buttons sit top right.
  const x = useSharedValue(MARGIN);
  const y = useSharedValue(inset.top + 24);
  const opacity = useSharedValue(1);
  // The handlers below are created once, so everything they read lives in shared values.
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const isOpen = useSharedValue(false);
  const bounds = useSharedValue({ width, height, top: inset.top, bottom: inset.bottom });
  const idle = useSharedValue<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    bounds.value = { width, height, top: inset.top, bottom: inset.bottom };
  }, [bounds, width, height, inset.top, inset.bottom]);

  const [pan] = useState(() => {
    const wake = () => {
      opacity.value = withTiming(1, { duration: 120 });
      if (idle.value) clearTimeout(idle.value);
      idle.value = setTimeout(() => {
        opacity.value = withTiming(0.55, { duration: 400 });
      }, IDLE_MS);
    };
    // vx, vy: release speed in px/ms from PanResponder, so a flick keeps its momentum.
    const snap = (w: number, h: number, vx = 0, vy = 0) => {
      const b = bounds.value;
      const minY = b.top + MARGIN;
      const maxY = Math.max(minY, b.height - b.bottom - h - MARGIN);
      const toRight = x.value + w / 2 + vx * 120 > b.width / 2;
      const spring = { damping: 26, stiffness: 520, mass: 0.8 };
      x.value = withSpring(toRight ? b.width - w - MARGIN : MARGIN, {
        ...spring,
        velocity: vx * 1000,
      });
      y.value = withSpring(Math.min(Math.max(y.value + vy * 120, minY), maxY), {
        ...spring,
        velocity: vy * 1000,
      });
    };
    wake();
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startX.value = x.value;
        startY.value = y.value;
        wake();
      },
      onPanResponderMove: (_, g) => {
        x.value = startX.value + g.dx;
        y.value = startY.value + g.dy;
      },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) < 4 && Math.abs(g.dy) < 4) {
          isOpen.value = !isOpen.value;
          setOpen(isOpen.value);
        }
        snap(isOpen.value ? CARD.width : DOT, isOpen.value ? CARD.height : DOT, g.vx, g.vy);
        wake();
      },
    });
  });

  useEffect(
    () => () => {
      if (idle.value) clearTimeout(idle.value);
    },
    [idle]
  );

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  const fps = stats ? Math.round(stats.renderFps) : null;
  const tint = fps === null ? color.muted : health(fps);

  return (
    <Animated.View
      {...pan.panHandlers}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Hide performance' : 'Show performance'}
      testID="floating-stats"
      style={[styles.base, size, open ? styles.card : styles.dot, style]}>
      {open ? (
        <>
          <Row label="Render" value={fps === null ? '-' : `${fps} fps`} tint={tint} />
          <Row label="Poses" value={stats ? `${Math.round(stats.inferenceFps)} /s` : '-'} />
          <Row label="Per pose" value={stats ? `${Math.round(stats.inferenceMs)} ms` : '-'} />
          <Row label="Latency" value={stats ? `${Math.round(stats.latencyMs)} ms` : '-'} />
          <Row label="Model" value={stats?.backend ?? '-'} />
        </>
      ) : (
        <View style={styles.dotInner}>
          <Text style={[styles.dotValue, { color: tint }]}>{fps ?? '-'}</Text>
          <Text style={[type.label, styles.dotLabel]}>fps</Text>
        </View>
      )}
    </Animated.View>
  );
}

function Row({ label, value, tint = color.text }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.row}>
      <Text style={[type.label, styles.rowLabel]}>{label}</Text>
      <Text style={[styles.rowValue, { color: tint }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: 'rgba(11,13,12,0.82)',
    borderWidth: 1,
    borderColor: color.hairline,
  },
  dot: { borderRadius: DOT / 2, alignItems: 'center', justifyContent: 'center' },
  dotInner: { alignItems: 'center' },
  dotValue: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  dotLabel: { color: color.muted, fontSize: 8 },
  card: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'space-between',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: color.muted, fontSize: 9 },
  rowValue: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
