import { parseBodySequence, useCameraPermissions } from '@rbayuokt/expo-body-vision';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Linking, View } from 'react-native';

import { PermissionCard } from '../../components/PermissionCard';
import { FIXTURES } from '../../fixtures.generated';
import { color } from '../../theme';

export type InputKind = 'camera' | 'replay';

export const InputContext = createContext<{ kind: InputKind; setKind: (k: InputKind) => void }>({
  kind: 'camera',
  setKind: () => {},
});

/** Replay input for this demo when the home screen's input switch is on recorded. */
export function useDemoInput(fixture: string, loop = false) {
  const { kind } = useContext(InputContext);
  return useMemo(
    () => (kind === 'replay' ? parseBodySequence(FIXTURES[fixture], { loop }) : null),
    [kind, fixture, loop]
  );
}

/** Asks for camera permission before rendering camera demos. Recorded input needs none. */
export function CameraGate({ children }: { children: ReactNode }) {
  const { kind, setKind } = useContext(InputContext);
  const [permission, requestPermission] = useCameraPermissions();
  if (kind === 'replay') return children;
  if (!permission) return <View style={{ flex: 1, backgroundColor: color.ink }} />;
  if (permission.granted) return children;
  return (
    <PermissionCard
      canAskAgain={permission.canAskAgain}
      onRequest={requestPermission}
      onOpenSettings={() => Linking.openSettings()}
      onUseReplay={() => setKind('replay')}
    />
  );
}
