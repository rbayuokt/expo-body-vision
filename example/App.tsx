/**
 * screens/     one demo per file, each using only the public expo-body-vision API
 * components/  plain React Native UI, no library imports
 */
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BoxingScreen } from './screens/BoxingScreen';
import { CustomSetupScreen } from './screens/CustomSetupScreen';
import { ExerciseScreen } from './screens/ExerciseScreen';
import { HomeScreen, type DemoId } from './screens/HomeScreen';
import { LifecycleScreen } from './screens/LifecycleScreen';
import { PerformanceScreen } from './screens/PerformanceScreen';
import { CameraGate, InputContext, type InputKind } from './screens/shared/input';
import { SetupScreen } from './screens/SetupScreen';
import { SkeletonScreen } from './screens/SkeletonScreen';
import { StressScreen } from './screens/StressScreen';
import { TargetScreen } from './screens/TargetScreen';
import { TPoseScreen } from './screens/TPoseScreen';
import { TrackingScreen } from './screens/TrackingScreen';
import { VideoScreen } from './screens/VideoScreen';

export interface DemoProps {
  onBack: () => void;
}

const SCREENS: Record<DemoId, (props: DemoProps) => React.JSX.Element> = {
  tracking: TrackingScreen,
  setup: SetupScreen,
  customSetup: CustomSetupScreen,
  video: VideoScreen,
  boxing: BoxingScreen,
  skeleton: SkeletonScreen,
  tpose: TPoseScreen,
  exercise: ExerciseScreen,
  target: TargetScreen,
  stress: StressScreen,
  performance: PerformanceScreen,
  lifecycle: LifecycleScreen,
};

export default function App() {
  const [demo, setDemo] = useState<DemoId | null>(null);
  const [kind, setKind] = useState<InputKind>('camera');
  const input = useMemo(() => ({ kind, setKind }), [kind]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!demo) return false;
      setDemo(null);
      return true;
    });
    return () => sub.remove();
  }, [demo]);

  const Demo = demo ? SCREENS[demo] : null;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <InputContext.Provider value={input}>
        {Demo && demo === 'video' ? (
          <Demo onBack={() => setDemo(null)} />
        ) : Demo ? (
          <CameraGate>
            <Demo onBack={() => setDemo(null)} />
          </CameraGate>
        ) : (
          <HomeScreen onOpen={setDemo} />
        )}
      </InputContext.Provider>
    </SafeAreaProvider>
  );
}
