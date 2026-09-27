import { NativeModule, requireNativeModule } from 'expo';
import type { PermissionResponse } from 'expo-modules-core';

import type { Capabilities } from './types';

export interface NativeVideoAnalysis {
  durationMs: number;
  width: number;
  height: number;
  framesAnalyzed: number;
  sourceFps: number;
  backend: string;
  delegate: string;
  averageInferenceMs: number;
  events: { type: string; timestamp: number; [key: string]: unknown }[];
  landmarks?: { timestamp: number; points: number[] }[];
}

declare class ExpoBodyVisionModule extends NativeModule {
  getCapabilities(): Capabilities;
  getCameraPermissionsAsync(): Promise<PermissionResponse>;
  requestCameraPermissionsAsync(): Promise<PermissionResponse>;
  analyzeVideo(
    uri: string,
    config: Record<string, unknown>,
    options: { fps?: number; landmarks?: boolean }
  ): Promise<NativeVideoAnalysis>;
}

export default requireNativeModule<ExpoBodyVisionModule>('ExpoBodyVision');
