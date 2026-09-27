import { BodyVisionView, type SkeletonStyle, type SmoothingPreset } from '@rbayuokt/expo-body-vision';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DemoProps } from '../App';
import { DemoFrame } from '../components/DemoFrame';
import { Choice, Label, SwitchRow } from '../components/ui';
import { color } from '../theme';
import { useDemoInput } from './shared/input';

const WIDTHS = ['thin', 'regular', 'bold'] as const;
const WIDTH = { thin: 2, regular: 4, bold: 8 };
const SMOOTHING = ['none', 'light', 'balanced', 'stable'] as const;

export function SkeletonScreen({ onBack }: DemoProps) {
  const input = useDemoInput('tpose-hold', true);
  const [visible, setVisible] = useState(true);
  const [trails, setTrails] = useState(true);
  const [width, setWidth] = useState<(typeof WIDTHS)[number]>('regular');
  const [smoothing, setSmoothing] = useState<SmoothingPreset>('balanced');

  // Each change reconfigures the native renderer once. Camera and model keep running.
  const skeleton: SkeletonStyle = {
    visible,
    boneWidth: WIDTH[width],
    jointRadius: WIDTH[width] + 2,
    boneColor: color.text,
    jointColor: color.lime,
    bones: {
      leftUpperArm: { color: color.coral },
      leftForearm: { color: color.coral },
      rightUpperArm: { color: color.cyan },
      rightForearm: { color: color.cyan },
    },
    trails: trails
      ? [
          { joint: 'leftWrist', color: color.coral, lengthMs: 450 },
          { joint: 'rightWrist', color: color.cyan, lengthMs: 450 },
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
          smoothing={smoothing}
        />
      }
      hud={
        <>
          <SwitchRow label="Skeleton" value={visible} onChange={setVisible} />
          <SwitchRow label="Wrist trails" value={trails} onChange={setTrails} />
          <View style={styles.group}>
            <Label>Line weight</Label>
            <Choice options={WIDTHS} value={width} onChange={setWidth} testIDPrefix="width" />
          </View>
          <View style={styles.group}>
            <Label>Smoothing</Label>
            <Choice options={SMOOTHING} value={smoothing} onChange={setSmoothing} testIDPrefix="smoothing" />
          </View>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({ group: { gap: 8 } });
