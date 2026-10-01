import { requireNativeView } from 'expo';
import type { Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { CameraFacing, ReplayInput, ResizeMode } from './types';

export interface NativeEvent {
  type: string;
  timestamp: number;
  [key: string]: unknown;
}

export interface NativeEventBatch {
  sequence: number;
  events: NativeEvent[];
  /** State events dropped because JS fell too far behind. */
  dropped: number;
}

export interface NativeBodyVisionRef {
  acknowledge(sequence: number): Promise<void>;
  startCalibration(durationMs: number): Promise<void>;
  resetExercise(id: string | null): Promise<void>;
}

/** Plain, color-processed configuration. Resent only when it changes. */
export interface NativeEngineConfig {
  smoothing?: unknown;
  prediction?: unknown;
  tracking?: unknown;
  performance?: string;
  delegate?: 'cpu' | 'gpu';
  backend?: string;
  /** Saved torso length from an earlier calibration. */
  calibration?: number;
  /** Bundled name, file path/URI, or 'pending' while JS resolves one. */
  model?: string;
  rules?: unknown[];
}

export interface NativeTelemetry {
  stats: boolean;
  landmarks: boolean;
  landmarksIntervalMs: number;
}

export interface NativeBodyVisionProps {
  ref?: Ref<NativeBodyVisionRef>;
  facing: CameraFacing;
  torch: boolean;
  active: boolean;
  resizeMode: ResizeMode;
  config: NativeEngineConfig;
  skeleton: Record<string, unknown>;
  telemetry: NativeTelemetry;
  testInput: ReplayInput | null;
  /** 'pending' keeps the camera off while a bundled file is copied out. */
  video: { uri: string; loop: boolean } | null;
  onEvents?: (event: { nativeEvent: NativeEventBatch }) => void;
  style?: StyleProp<ViewStyle>;
}

export const NativeBodyVisionView = requireNativeView<NativeBodyVisionProps>('ExpoBodyVision');
