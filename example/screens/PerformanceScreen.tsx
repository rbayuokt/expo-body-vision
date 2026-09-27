import { BodyVisionView, type BodyVisionStats, type PerformanceMode } from '@rbayuokt/expo-body-vision';
import { registerDemoBackends } from 'demo-pose-backends';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DemoProps } from '../App';
import { DemoFrame } from '../components/DemoFrame';
import { Choice, Label, Readout } from '../components/ui';
import { color } from '../theme';
import { useDemoInput } from './shared/input';

const MODES = ['auto', 'performance', 'balanced', 'accuracy'] as const;
// Apple Vision on iOS, registered natively through BodyVisionBackends (see modules/demo-pose-backends).
// Android has no extra backend: its default is already ML Kit.
const PLATFORM_BACKEND: string | undefined = registerDemoBackends()[0];
const MODELS = PLATFORM_BACKEND
  ? (['default', 'lite', 'full', 'heavy', 'platform'] as const)
  : (['default', 'lite', 'full', 'heavy'] as const);
type ModelChoice = 'default' | 'lite' | 'full' | 'heavy' | 'platform';
const HEAVY_MODEL = require('../assets/models/pose_landmarker_heavy.task');

export function PerformanceScreen({ onBack }: DemoProps) {
  const input = useDemoInput('squat-clean', true);
  const [mode, setMode] = useState<PerformanceMode>('auto');
  const [stats, setStats] = useState<BodyVisionStats | null>(null);
  const [target, setTarget] = useState('-');
  const [lastError, setLastError] = useState('-');
  const [delegate, setDelegate] = useState<'cpu' | 'gpu'>('cpu');
  const [model, setModel] = useState<ModelChoice>('default');
  const f = (v: number | undefined, unit = '') => (v === undefined ? '-' : `${v.toFixed(0)}${unit}`);

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
          backend={model === 'default' ? undefined : model === 'platform' ? PLATFORM_BACKEND : 'mediapipe'}
          model={model === 'heavy' ? HEAVY_MODEL : model === 'lite' || model === 'full' ? model : undefined}
          onStats={setStats}
          onError={(e) => setLastError(`${e.code}: ${e.message}`)}
          onPerformanceChange={(e) =>
            setTarget(`${e.inferenceFps} fps${e.reducedEffects ? ', lighter effects' : ''}`)
          }
        />
      }
      hud={
        <>
          <Choice options={MODES} value={mode} onChange={setMode} testIDPrefix="mode" />
          <Choice
            options={MODELS}
            labels={{
              default: 'Default',
              lite: 'MediaPipe Lite',
              full: 'Full',
              heavy: 'Heavy (file)',
              platform: PLATFORM_BACKEND ?? '',
            }}
            value={model}
            onChange={setModel}
            testIDPrefix="model"
          />
          <Choice
            options={['cpu', 'gpu'] as const}
            labels={{ cpu: 'CPU', gpu: 'GPU (experimental)' }}
            value={delegate}
            onChange={setDelegate}
            testIDPrefix="delegate"
          />
          <View style={styles.grid}>
            <Readout label="Drawn" value={f(stats?.renderFps, ' fps')} tint={color.lime} />
            <Readout label="Pose" value={stats ? `${f(stats.inferenceFps)}/${f(stats.targetInferenceFps)} fps` : '-'} />
            <Readout label="Pose time" value={f(stats?.inferenceMs, ' ms')} />
          </View>
          <View style={styles.grid}>
            <Readout label="Camera" value={f(stats?.cameraFps, ' fps')} />
            <Readout label="Frame p95" value={f(stats?.frameIntervalP95Ms, ' ms')} />
            <Readout label="Latency" value={f(stats?.latencyMs, ' ms')} />
          </View>
          <View style={styles.grid}>
            <Readout label="Body" value={stats?.bodyVisible ? 'yes' : 'no'} testID="perf-body" />
            <Readout label="Thermal" value={stats ? `${stats.thermalLevel}` : '-'} />
            <Readout label="Backend" value={stats ? `${stats.backend}/${stats.delegate}` : '-'} />
          </View>
          <View style={styles.target}>
            <Label>Auto target</Label>
            <Readout label="" value={target} testID="perf-rate" />
          </View>
          <View style={styles.target}>
            <Label>Last error</Label>
            <Text style={styles.error} numberOfLines={3} testID="perf-error">
              {lastError}
            </Text>
          </View>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 12 },
  target: { gap: 2 },
  error: { color: color.coral, fontSize: 13 },
});
