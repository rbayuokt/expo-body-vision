import { StyleSheet, Text, View } from 'react-native';

import { color, space } from '../theme';
import { GhostButton, Label, PrimaryButton } from './ui';

export function PermissionCard({
  canAskAgain,
  onRequest,
  onOpenSettings,
  onUseReplay,
}: {
  canAskAgain: boolean;
  onRequest: () => void;
  onOpenSettings: () => void;
  onUseReplay?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <Label tint={color.lime}>Camera</Label>
      <Text style={styles.title}>Tracking runs on this phone.</Text>
      <Text style={styles.body}>
        Frames go from the camera to the pose model and the overlay natively. They never reach
        JavaScript or leave the device.
      </Text>
      {canAskAgain ? (
        <PrimaryButton label="Allow camera" onPress={onRequest} testID="allow-camera" />
      ) : (
        <PrimaryButton label="Open Settings" onPress={onOpenSettings} />
      )}
      {onUseReplay ? <GhostButton label="Use recorded input instead" onPress={onUseReplay} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.lg, backgroundColor: color.ink },
  title: { color: color.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  body: { color: color.muted, fontSize: 16, lineHeight: 23 },
});
