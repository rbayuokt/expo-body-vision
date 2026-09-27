import { BodyVisionView } from '@rbayuokt/expo-body-vision';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DemoProps } from '../App';
import { DemoFrame } from '../components/DemoFrame';
import { GhostButton, Readout } from '../components/ui';
import { color } from '../theme';
import { useDemoInput } from './shared/input';

export function TrackingScreen({ onBack }: DemoProps) {
  const input = useDemoInput('squat-clean', true);
  const [bodyId, setBodyId] = useState<number | null>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  return (
    <DemoFrame
      title="Body tracking"
      tag="Pipeline"
      onBack={onBack}
      camera={
        <BodyVisionView
          style={StyleSheet.absoluteFill}
          facing={facing}
          testInput={input}
          onBodyDetected={(e) => setBodyId(e.bodyId)}
          onBodyLost={() => setBodyId(null)}
        />
      }
      hud={
        <View style={styles.row}>
          <Readout
            label="Body"
            value={bodyId === null ? 'Searching' : `Tracking #${bodyId}`}
            tint={bodyId === null ? color.muted : color.lime}
            testID="body-status"
          />
          <GhostButton
            label={facing === 'front' ? 'Use back camera' : 'Use front camera'}
            onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
            testID="flip-camera"
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 16 } });
