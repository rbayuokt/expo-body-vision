import {
  BodyVisionView,
  type BodyVisionStats,
  type PerformanceMode,
} from '@rbayuokt/expo-body-vision';
import { registerDemoBackends } from 'demo-pose-backends';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DemoProps } from '../App';
import { CameraButtons } from '../components/CameraButtons';
import { DemoFrame } from '../components/DemoFrame';
import { FloatingStats } from '../components/FloatingStats';
import { StatusPill } from '../components/StatusPill';
import { Label, Segmented, Stat } from '../components/ui';
import { color, space } from '../theme';
import { useDemoInput } from './shared/input';

type ModelChoice = 'default' | 'lite' | 'full' | 'heavy' | 'platform';

// Apple Vision on iOS, registered natively through BodyVisionBackends (see modules/demo-pose-backends).
// Android has no extra backend: its default is already ML Kit.
const PLATFORM_BACKEND: string | undefined = registerDemoBackends()[0];
const HEAVY_MODEL = require('../assets/models/pose_landmarker_heavy.task');

const MODES: { id: PerformanceMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'performance', label: 'Fast' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'accuracy', label: 'Accurate' },
];
const MODELS: { id: ModelChoice; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'lite', label: 'Lite' },
  { id: 'full', label: 'Full' },
  { id: 'heavy', label: 'Heavy' },
  ...(PLATFORM_BACKEND ? [{ id: 'platform' as const, label: 'Vision' }] : []),
];
const DELEGATES: { id: 'cpu' | 'gpu'; label: string }[] = [
  { id: 'cpu', label: 'CPU' },
  { id: 'gpu', label: 'GPU (experimental)' },
];

export function PerformanceScreen({ onBack }: DemoProps) {
  const input = useDemoInput('squat-clean', true);
  const [mode, setMode] = useState<PerformanceMode>('auto');
  const [model, setModel] = useState<ModelChoice>('default');
  const [delegate, setDelegate] = useState<'cpu' | 'gpu'>('cpu');
  const [stats, setStats] = useState<BodyVisionStats | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = error
    ? { text: error, dot: color.coral }
    : target
      ? { text: `Auto target ${target}`, dot: color.lime }
      : { text: `${MODES.find((m) => m.id === mode)?.label} mode`, dot: color.muted };

  return (
    <DemoFrame
      title="Performance"
      tag="Adaptive"
      onBack={onBack}
      camera={
        <BodyVisionView
          style={StyleSheet.absoluteFill}
          testInput={input}
          performance={mode}
          experimentalDelegate={delegate}
          backend={
            model === 'default' ? undefined : model === 'platform' ? PLATFORM_BACKEND : 'mediapipe'
          }
          model={
            model === 'heavy'
              ? HEAVY_MODEL
              : model === 'lite' || model === 'full'
                ? model
                : undefined
          }
          onStats={setStats}
          onError={(e) => setError(`${e.code}: ${e.message}`)}
          onPerformanceChange={(e) =>
            setTarget(`${e.inferenceFps} poses/s${e.reducedEffects ? ', lighter effects' : ''}`)
          }>
          <StatusPill text={status.text} dot={status.dot} testID="perf-rate" />
          <CameraButtons />
          <FloatingStats />
        </BodyVisionView>
      }
      hud={
        <>
          <View style={styles.stats}>
            <Stat
              value={
                stats
                  ? `${stats.inferenceFps.toFixed(0)}/${stats.targetInferenceFps.toFixed(0)}`
                  : '-'
              }
              label="Poses /s"
              tint={color.lime}
            />
            <Stat
              value={stats ? `${stats.inferenceMs.toFixed(0)}` : '-'}
              label="Ms / pose"
              tint={color.text}
            />
            <Stat
              value={stats ? `${stats.thermalLevel}` : '-'}
              label="Thermal"
              tint={color.amber}
            />
            <Stat
              value={stats ? (stats.bodyVisible ? 'Yes' : 'No') : '-'}
              label="Body"
              tint={stats?.bodyVisible ? color.lime : color.muted}
              testID="perf-body"
            />
          </View>
          <View style={styles.section}>
            <Label>Mode</Label>
            <Segmented options={MODES} value={mode} onChange={setMode} testIDPrefix="mode" />
          </View>
          <View style={styles.section}>
            <Label>Model</Label>
            <Segmented
              options={MODELS}
              value={model}
              onChange={(m) => {
                setModel(m);
                setError(null);
              }}
              testIDPrefix="model"
            />
          </View>
          <View style={styles.section}>
            <Label>Delegate</Label>
            <Segmented
              options={DELEGATES}
              value={delegate}
              onChange={setDelegate}
              testIDPrefix="delegate"
            />
          </View>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row' },
  section: { gap: space.sm },
});
