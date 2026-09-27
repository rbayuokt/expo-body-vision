import {
  BlurMask,
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  Path,
  Skia,
  type SkPath,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  ZoomIn,
  FadeOut,
  interpolateColor,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { Framing } from '../types';
import { useBodySetup } from './context';
import type { SetupState } from './session';

export interface BodySetupProps {
  /** Silhouette, progress and arrows once in position. Default `#C6FF3D`. */
  accentColor?: string;
  /** Silhouette while positioning. Default translucent white. */
  idleColor?: string;
  /** Space above the prompt, e.g. the top safe-area inset plus any header. Default 72. */
  topInset?: number;
  /** Space below the progress bar, e.g. the height of a bottom panel. Default 48. */
  bottomInset?: number;
  /** Hide the prompt text, e.g. when the app shows it elsewhere. */
  hidePrompt?: boolean;
}

/**
 * Built-in overlay for `<BodyVisionView setup>`: a stand-here silhouette, the current prompt,
 * direction arrows and hold/calibration progress. Drawn with Skia and animated on the UI thread
 * by Reanimated. Place it as a child of the view.
 */
export function BodySetup(props: BodySetupProps) {
  const setup = useBodySetup();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const done = setup?.state.phase === 'done';
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!done) return;
    // Matches the silhouette's fade after the check mark.
    const timer = setTimeout(() => setDismissed(true), 1500);
    return () => {
      clearTimeout(timer);
      setDismissed(false);
    };
  }, [done]);
  if (!setup) return null;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={onLayout}
      testID="body-setup">
      {size.width > 0 ? (
        <SetupCanvas {...props} state={setup.state} framing={setup.framing} size={size} />
      ) : null}
      {setup.state.phase === 'countdown' && setup.state.countdown !== null ? (
        <View style={styles.countdown} pointerEvents="none">
          <Animated.Text
            key={setup.state.countdown}
            entering={ZoomIn.springify().damping(12)}
            exiting={FadeOut.duration(150)}
            style={[styles.countdownText, { color: props.accentColor ?? '#C6FF3D' }]}
            testID="body-setup-countdown">
            {setup.state.countdown}
          </Animated.Text>
        </View>
      ) : null}
      {!props.hidePrompt && !(done && dismissed) ? (
        <View style={[styles.prompt, { top: props.topInset ?? 72 }]}>
          <Animated.Text
            key={setup.state.prompt}
            entering={FadeInDown.duration(220)}
            exiting={FadeOut.duration(120)}
            style={styles.promptText}
            accessibilityLiveRegion="polite"
            testID="body-setup-prompt">
            {setup.text}
          </Animated.Text>
        </View>
      ) : null}
    </View>
  );
}

function SetupCanvas({
  state,
  framing,
  size,
  accentColor = '#C6FF3D',
  idleColor = 'rgba(255,255,255,0.75)',
  topInset = 72,
  bottomInset = 48,
}: BodySetupProps & {
  state: SetupState;
  framing: Framing;
  size: { width: number; height: number };
}) {
  // The silhouette and progress fit between the prompt and whatever sits at the bottom.
  const regionTop = topInset + 72;
  const regionBottom = size.height - bottomInset - 20;
  const geometry = useMemo(
    () => silhouette(size.width, regionTop, regionBottom, framing),
    [size.width, regionTop, regionBottom, framing]
  );

  const positioned = useSharedValue(0);
  const breath = useSharedValue(0);
  const progress = useSharedValue(0);
  const nudge = useSharedValue(0);
  const check = useSharedValue(0);

  useEffect(() => {
    positioned.value = withTiming(state.phase === 'positioning' ? 0 : 1, { duration: 250 });
  }, [state.phase, positioned]);

  useEffect(() => {
    breath.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [breath]);

  useEffect(() => {
    if (state.phase === 'calibrating') {
      progress.value = 0;
      progress.value = withTiming(1, { duration: 2000, easing: Easing.linear });
    } else if (state.phase === 'holding') {
      progress.value = withTiming(state.progress, { duration: 110, easing: Easing.linear });
    } else if (state.phase === 'positioning') {
      progress.value = withTiming(0, { duration: 150 });
    }
  }, [state.phase, state.progress, progress]);

  useEffect(() => {
    nudge.value = state.screenDirection
      ? withRepeat(
          withSequence(withTiming(1, { duration: 420 }), withTiming(0, { duration: 420 })),
          -1
        )
      : withTiming(0, { duration: 100 });
  }, [state.screenDirection, nudge]);

  useEffect(() => {
    check.value =
      state.phase === 'done'
        ? withSequence(
            withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }),
            withDelay(700, withTiming(2, { duration: 350 }))
          )
        : 0;
  }, [state.phase, check]);

  const color = useDerivedValue(() =>
    interpolateColor(positioned.value, [0, 1], [idleColor, accentColor])
  );
  const outlineOpacity = useDerivedValue(() => {
    const fadeOut = check.value > 1 ? 2 - check.value : 1;
    return (0.55 + 0.45 * (positioned.value > 0.5 ? 1 : breath.value)) * fadeOut;
  });
  const glowOpacity = useDerivedValue(
    () => (0.25 + 0.5 * positioned.value) * (check.value > 1 ? 2 - check.value : 1)
  );
  const checkEnd = useDerivedValue(() => Math.min(check.value, 1));
  const checkOpacity = useDerivedValue(() => (check.value > 1 ? 2 - check.value : 1));
  const arrowShift = useDerivedValue(() => [
    { translateX: (state.screenDirection === 'left' ? -1 : 1) * nudge.value * 14 },
  ]);

  const arrow = state.screenDirection === 'left' ? geometry.leftArrow : geometry.rightArrow;

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Group opacity={glowOpacity}>
        <Path path={geometry.outline} style="stroke" strokeWidth={10} color={color}>
          <BlurMask blur={14} style="normal" />
        </Path>
      </Group>
      <Path
        path={geometry.outline}
        style="stroke"
        strokeWidth={3}
        strokeCap="round"
        strokeJoin="round"
        color={color}
        opacity={outlineOpacity}>
        {state.phase === 'positioning' ? <DashPathEffect intervals={[14, 10]} /> : null}
      </Path>
      <Group opacity={checkOpacity}>
        <Path
          path={geometry.track}
          style="stroke"
          strokeWidth={6}
          strokeCap="round"
          color="rgba(255,255,255,0.18)"
        />
        <Path
          path={geometry.track}
          style="stroke"
          strokeWidth={6}
          strokeCap="round"
          color={accentColor}
          end={progress}
        />
      </Group>
      {state.screenDirection ? (
        <Group transform={arrowShift}>
          <Path
            path={arrow}
            style="stroke"
            strokeWidth={7}
            strokeCap="round"
            strokeJoin="round"
            color={accentColor}
          />
        </Group>
      ) : null}
      {state.phase === 'done' ? (
        // A solid disc so the check reads on top of the body and skeleton instead of mixing in.
        <Group opacity={checkOpacity}>
          <Circle
            cx={geometry.badge.x}
            cy={geometry.badge.y}
            r={geometry.badge.r}
            color="rgba(11,13,12,0.88)"
          />
          <Circle
            cx={geometry.badge.x}
            cy={geometry.badge.y}
            r={geometry.badge.r}
            style="stroke"
            strokeWidth={3}
            color={accentColor}
          />
        </Group>
      ) : null}
      {state.phase === 'done' ? (
        <Path
          path={geometry.check}
          style="stroke"
          strokeWidth={7}
          strokeCap="round"
          strokeJoin="round"
          color={accentColor}
          end={checkEnd}
          opacity={checkOpacity}
        />
      ) : null}
    </Canvas>
  );
}

interface SilhouetteGeometry {
  outline: SkPath;
  track: SkPath;
  check: SkPath;
  badge: { x: number; y: number; r: number };
  leftArrow: SkPath;
  rightArrow: SkPath;
}

/** A stand-here outline sized to the framing, centered between `regionTop` and `regionBottom`. */
function silhouette(
  width: number,
  regionTop: number,
  regionBottom: number,
  framing: Framing
): SilhouetteGeometry {
  if (framing === 'floor') return floorSilhouette(width, regionTop, regionBottom);
  const full = framing === 'fullBody';
  const available = Math.max(regionBottom - 24 - regionTop, 100);
  const h = available * (full ? 0.95 : 0.8);
  const cx = width / 2;
  const top = regionTop + (available - h) / 2;
  // Proportions in body heights. The upper-body outline stops at the hips.
  const unit = full ? h : h * 1.9;
  const head = unit * 0.065;
  const shoulder = unit * 0.13;
  const hip = unit * 0.085;
  const neckY = top + head * 2.2;
  const shoulderY = neckY + unit * 0.03;
  const waistY = shoulderY + unit * 0.27;
  const armOut = shoulder + unit * 0.05;

  const outline = Skia.Path.Make();
  outline.addCircle(cx, top + head, head);
  outline.moveTo(cx - head * 0.45, top + head * 2);
  outline.lineTo(cx - head * 0.45, neckY);
  outline.quadTo(cx - shoulder * 0.6, neckY, cx - shoulder, shoulderY + unit * 0.02);
  outline.lineTo(cx - armOut, waistY + unit * 0.06);
  outline.lineTo(cx - armOut + unit * 0.035, waistY + unit * 0.07);
  outline.lineTo(cx - hip * 1.05, shoulderY + unit * 0.12);
  if (full) {
    outline.lineTo(cx - hip, waistY + unit * 0.06);
    outline.lineTo(cx - hip * 0.9, top + h);
    outline.lineTo(cx - unit * 0.012, top + h);
    outline.lineTo(cx, waistY + unit * 0.12);
    outline.lineTo(cx + unit * 0.012, top + h);
    outline.lineTo(cx + hip * 0.9, top + h);
    outline.lineTo(cx + hip, waistY + unit * 0.06);
  } else {
    outline.lineTo(cx - hip, top + h);
    outline.lineTo(cx + hip, top + h);
  }
  outline.lineTo(cx + hip * 1.05, shoulderY + unit * 0.12);
  outline.lineTo(cx + armOut - unit * 0.035, waistY + unit * 0.07);
  outline.lineTo(cx + armOut, waistY + unit * 0.06);
  outline.lineTo(cx + shoulder, shoulderY + unit * 0.02);
  outline.quadTo(cx + shoulder * 0.6, neckY, cx + head * 0.45, neckY);
  outline.lineTo(cx + head * 0.45, top + head * 2);

  return { outline, ...common(width, regionTop, regionBottom) };
}

/** Progress bar just above `regionBottom`, plus the check mark and arrows centered in the region. */
function common(width: number, regionTop: number, regionBottom: number) {
  const cx = width / 2;
  const midY = (regionTop + regionBottom) / 2;
  const track = Skia.Path.Make();
  track.moveTo(cx - width * 0.28, regionBottom);
  track.lineTo(cx + width * 0.28, regionBottom);

  const badge = {
    x: cx,
    y: midY,
    r: Math.min(Math.min(width, regionBottom - regionTop) * 0.14, 64),
  };
  const r = badge.r * 0.5;
  const check = Skia.Path.Make();
  check.moveTo(cx - r, midY + r * 0.05);
  check.lineTo(cx - r * 0.25, midY + r * 0.75);
  check.lineTo(cx + r * 1.0, midY - r * 0.65);

  const a = 22;
  const ay = midY;
  const leftArrow = Skia.Path.Make();
  for (const x of [34, 64]) {
    leftArrow.moveTo(x + a * 0.6, ay - a);
    leftArrow.lineTo(x, ay);
    leftArrow.lineTo(x + a * 0.6, ay + a);
  }
  const rightArrow = Skia.Path.Make();
  for (const x of [width - 34, width - 64]) {
    rightArrow.moveTo(x - a * 0.6, ay - a);
    rightArrow.lineTo(x, ay);
    rightArrow.lineTo(x - a * 0.6, ay + a);
  }
  return { track, check, badge, leftArrow, rightArrow };
}

/** A side-on plank: head, straight body line and a supporting arm on a floor line. */
function floorSilhouette(
  width: number,
  regionTop: number,
  regionBottom: number
): SilhouetteGeometry {
  const available = Math.max(regionBottom - 24 - regionTop, 80);
  const len = Math.min(width * 0.62, available * 3.2);
  const left = (width - len) / 2;
  const floorY = regionTop + available * 0.5 + len * 0.1;
  const shoulder = { x: left + len * 0.82, y: floorY - len * 0.2 };
  const feet = { x: left, y: floorY - len * 0.02 };
  const head = len * 0.055;

  const outline = Skia.Path.Make();
  outline.addCircle(shoulder.x + head * 1.9, shoulder.y - head * 0.9, head);
  outline.moveTo(feet.x, feet.y);
  outline.lineTo(shoulder.x, shoulder.y);
  outline.moveTo(shoulder.x, shoulder.y);
  outline.lineTo(shoulder.x + len * 0.01, floorY);
  outline.moveTo(left - len * 0.05, floorY);
  outline.lineTo(left + len * 1.05, floorY);
  return { outline, ...common(width, regionTop, regionBottom) };
}

const styles = StyleSheet.create({
  countdown: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  countdownText: {
    fontSize: 140,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 18,
  },
  prompt: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  promptText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    overflow: 'hidden',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
});
