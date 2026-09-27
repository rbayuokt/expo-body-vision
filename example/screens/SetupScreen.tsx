import {
  BodyVisionView,
  type BodyVisionViewRef,
  type CalibrationResult,
  type Framing,
  type SetupState,
} from '@rbayuokt/expo-body-vision';
import { SetupConfetti } from '@rbayuokt/expo-body-vision/effects';
import { BodySetup } from '@rbayuokt/expo-body-vision/setup';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DemoProps } from '../App';
import { DemoFrame, useHudInset } from '../components/DemoFrame';
import { Choice, GhostButton, Readout, SwitchRow } from '../components/ui';
import { color } from '../theme';
import { useDemoInput } from './shared/input';

const PHASE: Record<SetupState['phase'], string> = {
  positioning: 'Positioning',
  holding: 'Holding',
  posing: 'Pose',
  calibrating: 'Measuring',
  countdown: 'Countdown',
  done: 'Ready',
};

export function SetupScreen({ onBack }: DemoProps) {
  const input = useDemoInput('setup-walk-in');
  const view = useRef<BodyVisionViewRef>(null);
  const [framing, setFraming] = useState<Framing>('fullBody');
  const [voice, setVoice] = useState(true);
  const [phase, setPhase] = useState<SetupState['phase']>('positioning');
  const [calibration, setCalibration] = useState<CalibrationResult | null>(null);

  return (
    <DemoFrame
      title="Guided setup"
      tag="Readiness"
      onBack={onBack}
      camera={
        <BodyVisionView
          ref={view}
          style={StyleSheet.absoluteFill}
          testInput={input}
          skeleton={{ boneColor: 'rgba(255,255,255,0.55)', jointColor: color.lime }}
          setup={{ framing, voice }}
          onSetupChange={(s) => setPhase(s.phase)}
          onSetupComplete={setCalibration}>
          <SetupOverlay />
          <SetupConfetti />
        </BodyVisionView>
      }
      hud={
        <>
          <View style={styles.row}>
            <Readout
              label="Setup"
              value={PHASE[phase]}
              tint={phase === 'done' ? color.lime : color.text}
              testID="setup-phase"
            />
            <Readout
              label="Torso"
              value={calibration ? `${(calibration.torsoLength * 100).toFixed(0)}% of frame` : '-'}
            />
          </View>
          <Choice
            options={['fullBody', 'upperBody', 'floor'] as const}
            labels={{ fullBody: 'Full body', upperBody: 'Upper body', floor: 'Floor' }}
            value={framing}
            onChange={setFraming}
            testIDPrefix="framing"
          />
          {/* Kept short while positioning so the panel doesn't hide the user's feet. */}
          {phase === 'done' ? (
            <>
              <SwitchRow label="Voice prompts" value={voice} onChange={setVoice} />
              <GhostButton
                label="Start over"
                onPress={() => {
                  setCalibration(null);
                  view.current?.restartSetup();
                }}
                testID="setup-restart"
              />
            </>
          ) : null}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 16 } });

/** Rendered inside the camera, so it can read the frame's HUD inset. */
function SetupOverlay() {
  const inset = useHudInset();
  return <BodySetup accentColor={color.lime} topInset={inset.top} bottomInset={inset.bottom} />;
}
