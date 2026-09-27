import { NativeModule, registerWebModule } from 'expo';

function unsupported(): never {
  const error = new Error('expo-body-vision is not available on web.');
  (error as Error & { code: string }).code = 'UNSUPPORTED_PLATFORM';
  throw error;
}

class ExpoBodyVisionModule extends NativeModule {
  getCapabilities = () => ({
    platform: 'web' as const,
    backend: 'none',
    backends: [],
    joints: 33,
    maxBodies: 0,
    testInput: false,
  });
  getCameraPermissionsAsync = async () => unsupported();
  requestCameraPermissionsAsync = async () => unsupported();
  analyzeVideo = async () => unsupported();
}

export default registerWebModule(ExpoBodyVisionModule, 'ExpoBodyVisionModule');
