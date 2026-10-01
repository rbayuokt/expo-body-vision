import { CameraControls } from '@rbayuokt/expo-body-vision';

import { color, space } from '../theme';
import { useHudInset } from './DemoFrame';

/** The library's flip and flash buttons, moved below the demo header. */
export function CameraButtons() {
  const inset = useHudInset();
  return (
    <CameraControls
      activeColor={color.amber}
      style={{ top: inset.top + space.sm, right: space.md }}
    />
  );
}
