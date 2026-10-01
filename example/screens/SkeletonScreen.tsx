import {
  BodyVisionView,
  type SkeletonStyle,
  type SmoothingPreset,
} from '@rbayuokt/expo-body-vision';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DemoProps } from '../App';
import { CameraButtons } from '../components/CameraButtons';
import { DemoFrame } from '../components/DemoFrame';
import { FloatingStats } from '../components/FloatingStats';
import { Label, Segmented } from '../components/ui';
import { color, space } from '../theme';
import { useDemoInput } from './shared/input';

type Weight = 'thin' | 'regular' | 'bold';
type Palette = 'classic' | 'mono' | 'neon';

const WEIGHTS: { id: Weight; label: string }[] = [
  { id: 'thin', label: 'Thin' },
  { id: 'regular', label: 'Regular' },
  { id: 'bold', label: 'Bold' },
];
const WIDTH = { thin: 2, regular: 4, bold: 8 };
const PALETTES: { id: Palette; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'mono', label: 'Mono' },
  { id: 'neon', label: 'Neon' },
];
// Body, joints, then left and right arm. Arms get their own colors to show per-bone styling.
const COLORS: Record<Palette, [string, string, string, string]> = {
  classic: [color.text, color.lime, color.coral, color.cyan],
  mono: [color.text, color.text, color.text, color.text],
  neon: ['#B14CFF', '#3DFFD0', '#FF3DA8', '#FFE53D'],
};
const SMOOTHING: { id: SmoothingPreset; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'light', label: 'Light' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'stable', label: 'Stable' },
];

export function SkeletonScreen({ onBack }: DemoProps) {
  const input = useDemoInput('tpose-hold', true);
  const [visible, setVisible] = useState(true);
  const [trails, setTrails] = useState(true);
  const [weight, setWeight] = useState<Weight>('regular');
  const [palette, setPalette] = useState<Palette>('classic');
  const [smoothing, setSmoothing] = useState<SmoothingPreset>('balanced');
  const [body, joints, left, right] = COLORS[palette];

  // Each change reconfigures the native renderer once. Camera and model keep running.
  const skeleton: SkeletonStyle = {
    visible,
    boneWidth: WIDTH[weight],
    jointRadius: WIDTH[weight] + 2,
    boneColor: body,
    jointColor: joints,
    bones: {
      leftUpperArm: { color: left },
      leftForearm: { color: left },
      rightUpperArm: { color: right },
      rightForearm: { color: right },
    },
    trails: trails
      ? [
          { joint: 'leftWrist', color: left, lengthMs: 450 },
          { joint: 'rightWrist', color: right, lengthMs: 450 },
        ]
      : [],
  };

  return (
    <DemoFrame
      title="Custom skeleton"
      tag="Rendering"
      onBack={onBack}
      camera={
        <BodyVisionView
          style={StyleSheet.absoluteFill}
          testInput={input}
          skeleton={skeleton}
          smoothing={smoothing}>
          <CameraButtons />
          <FloatingStats />
        </BodyVisionView>
      }
      hud={
        <>
          <View style={styles.toggles}>
            <Toggle label="Skeleton" on={visible} onPress={() => setVisible((v) => !v)} />
            <Toggle label="Wrist trails" on={trails} onPress={() => setTrails((v) => !v)} />
          </View>
          <View style={styles.section}>
            <Label>Line weight</Label>
            <Segmented options={WEIGHTS} value={weight} onChange={setWeight} testIDPrefix="width" />
          </View>
          <View style={styles.section}>
            <Label>Colors</Label>
            <Segmented
              options={PALETTES}
              value={palette}
              onChange={setPalette}
              testIDPrefix="palette"
            />
          </View>
          <View style={styles.section}>
            <Label>Smoothing</Label>
            <Segmented
              options={SMOOTHING}
              value={smoothing}
              onChange={setSmoothing}
              testIDPrefix="smoothing"
            />
          </View>
        </>
      }
    />
  );
}

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      testID={`toggle-${label.toLowerCase().replace(' ', '-')}`}
      style={({ pressed }) => [styles.toggle, on && styles.toggleOn, pressed && styles.pressed]}>
      <View style={[styles.check, on && styles.checkOn]} />
      <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggles: { flexDirection: 'row', gap: space.sm },
  toggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: color.raised,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  toggleOn: { backgroundColor: color.lime, borderColor: color.lime },
  check: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.faint },
  checkOn: { backgroundColor: color.limeInk },
  toggleText: { color: color.text, fontSize: 14, fontWeight: '700' },
  toggleTextOn: { color: color.limeInk },
  section: { gap: space.sm },
  pressed: { opacity: 0.6 },
});
