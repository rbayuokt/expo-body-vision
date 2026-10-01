import { createContext, useContext, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  type ColorValue,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

import type { CameraFacing } from './types';

export interface CameraControlsValue {
  /** The camera in use, after any `flip()`. */
  facing: CameraFacing;
  /** Switches to the other camera. Turns the torch off. */
  flip: () => void;
  torch: boolean;
  /** Ignored while the view's `torch` prop is set. */
  setTorch: (on: boolean) => void;
  /** The current camera has a torch. Usually only the back one. */
  hasTorch: boolean;
  /** False while a video or test input replaces the camera. */
  available: boolean;
}

export const CameraContext = createContext<CameraControlsValue | null>(null);

/** Camera switch and torch of the enclosing `BodyVisionView`, for your own buttons. */
export function useCameraControls(): CameraControlsValue {
  const value = useContext(CameraContext);
  if (!value) throw new Error('useCameraControls must be used inside a BodyVisionView.');
  return value;
}

export interface CameraControlsProps {
  /** Default top right. Pass your own position, e.g. below a header. */
  style?: StyleProp<ViewStyle>;
  /** Each round button. Merged over the default 44 pt dark circle. */
  buttonStyle?: StyleProp<ViewStyle>;
  /** Icon color. Default white. */
  color?: ColorValue;
  /** Torch button fill while on. The icon turns `activeIconColor`. */
  activeColor?: ColorValue;
  activeIconColor?: ColorValue;
  /** Your own icons in place of the drawn ones. */
  icons?: { flip?: ReactNode; torchOn?: ReactNode; torchOff?: ReactNode };
  /** Accessibility labels. */
  labels?: { flip?: string; torchOn?: string; torchOff?: string };
}

/**
 * Ready-made flip and torch buttons. Place inside a `BodyVisionView`. The torch button only
 * shows on a camera that has one, and nothing shows without a live camera. For a fully custom
 * look, build your own from `useCameraControls()`.
 */
export function CameraControls({
  style,
  buttonStyle,
  color = '#fff',
  activeColor = '#FFD60A',
  activeIconColor = '#000',
  icons,
  labels,
}: CameraControlsProps) {
  const camera = useCameraControls();
  if (!camera.available) return null;
  return (
    <View style={[styles.column, style]} pointerEvents="box-none">
      <Pressable
        onPress={camera.flip}
        accessibilityRole="button"
        accessibilityLabel={labels?.flip ?? 'Switch camera'}
        testID="body-vision-flip"
        hitSlop={6}
        style={({ pressed }) => [styles.button, buttonStyle, pressed && styles.pressed]}>
        {icons?.flip ?? <FlipIcon color={color} />}
      </Pressable>
      {camera.hasTorch ? (
        <Pressable
          onPress={() => camera.setTorch(!camera.torch)}
          accessibilityRole="switch"
          accessibilityState={{ checked: camera.torch }}
          accessibilityLabel={
            camera.torch
              ? (labels?.torchOff ?? 'Turn flash off')
              : (labels?.torchOn ?? 'Turn flash on')
          }
          testID="body-vision-torch"
          hitSlop={6}
          style={({ pressed }) => [
            styles.button,
            buttonStyle,
            camera.torch && { backgroundColor: activeColor, borderColor: activeColor },
            pressed && styles.pressed,
          ]}>
          {camera.torch
            ? (icons?.torchOn ?? <TorchIcon color={activeIconColor} on />)
            : (icons?.torchOff ?? <TorchIcon color={color} on={false} />)}
        </Pressable>
      ) : null}
    </View>
  );
}

// Drawn with plain views so the main entry needs no SVG or icon package.

/** Two arcs around a lens, like the system camera's flip icon. */
function FlipIcon({ color }: { color: ColorValue }) {
  const head = {
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: color,
  };
  return (
    <View style={styles.icon}>
      <View style={[styles.ring, { borderTopColor: color, borderBottomColor: color }]} />
      <View
        style={[styles.arrow, head, { left: 14.5, top: 3, transform: [{ rotate: '-45deg' }] }]}
      />
      <View
        style={[styles.arrow, head, { left: -0.5, top: 14, transform: [{ rotate: '135deg' }] }]}
      />
      <View style={[styles.lens, { backgroundColor: color }]} />
    </View>
  );
}

function TorchIcon({ color, on }: { color: ColorValue; on: boolean }) {
  return (
    <View style={styles.icon}>
      {on ? (
        <View style={styles.rays}>
          <View
            style={[styles.ray, { backgroundColor: color, transform: [{ rotate: '-40deg' }] }]}
          />
          <View style={[styles.ray, { backgroundColor: color, marginTop: -2 }]} />
          <View
            style={[styles.ray, { backgroundColor: color, transform: [{ rotate: '40deg' }] }]}
          />
        </View>
      ) : null}
      <View style={[styles.torchHead, { backgroundColor: color }]} />
      <View style={[styles.torchNeck, { borderTopColor: color }]} />
      <View style={[styles.torchBody, { backgroundColor: color }]}>
        <View
          style={[styles.torchSwitch, { backgroundColor: on ? '#FFD60A' : 'rgba(0,0,0,0.55)' }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { position: 'absolute', top: 16, right: 16, gap: 10 },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  pressed: { opacity: 0.6, transform: [{ scale: 0.94 }] },
  icon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'flex-end' },
  ring: {
    position: 'absolute',
    left: 2,
    top: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  arrow: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 3.5,
    borderRightWidth: 3.5,
    borderTopWidth: 4.5,
  },
  lens: { position: 'absolute', left: 8, top: 8, width: 6, height: 6, borderRadius: 3 },
  rays: { position: 'absolute', top: -5, flexDirection: 'row', gap: 2, alignItems: 'flex-end' },
  ray: { width: 2, height: 4, borderRadius: 1 },
  torchHead: { width: 12, height: 3, borderTopLeftRadius: 1.5, borderTopRightRadius: 1.5 },
  torchNeck: {
    width: 12,
    height: 0,
    borderTopWidth: 4,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  torchBody: {
    width: 6,
    height: 11,
    marginBottom: 1,
    borderBottomLeftRadius: 1.5,
    borderBottomRightRadius: 1.5,
    alignItems: 'center',
    paddingTop: 2,
  },
  torchSwitch: { width: 2, height: 3, borderRadius: 1 },
});
