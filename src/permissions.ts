import { createPermissionHook } from 'expo-modules-core';

import ExpoBodyVision from './ExpoBodyVisionModule';
import type { Capabilities } from './types';

export function getCameraPermissionsAsync() {
  return ExpoBodyVision.getCameraPermissionsAsync();
}

export function requestCameraPermissionsAsync() {
  return ExpoBodyVision.requestCameraPermissionsAsync();
}

export const useCameraPermissions = createPermissionHook({
  getMethod: getCameraPermissionsAsync,
  requestMethod: requestCameraPermissionsAsync,
});

export function getCapabilities(): Capabilities {
  return ExpoBodyVision.getCapabilities();
}
