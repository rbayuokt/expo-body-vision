import {
  BodyVisionView,
  punch,
  type BodyVisionViewRef,
  type RepEvent,
} from '@rbayuokt/expo-body-vision';
import { ComboFever, ImpactEffect, useImpactShake } from '@rbayuokt/expo-body-vision/effects';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { DemoProps } from '../App';
import { DemoFrame } from '../components/DemoFrame';
import { Choice, GhostButton, Metric, PrimaryButton, Readout } from '../components/ui';
import { color, type } from '../theme';
import { useDemoInput } from './shared/input';

const RULES = [punch()];
// Punches closer than this in time are one combo.
const COMBO_GAP_MS = 900;
const PACE_WINDOW_MS = 10000;

type Source = 'camera' | 'video';
type Look = 'anime' | 'lightning' | 'fire' | 'pixel' | 'shatter' | 'clean' | 'off';

export function BoxingScreen({ onBack }: DemoProps) {
  const input = useDemoInput('punches', true);
  const view = useRef<BodyVisionViewRef>(null);
  const [source, setSource] = useState<Source>('camera');
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [right, setRight] = useState(0);
  const [combo, setCombo] = useState(0);
  const [best, setBest] = useState(0);
  const [pace, setPace] = useState(0);
  const [look, setLook] = useState<Look>('anime');
  const [level, setLevel] = useState<'auto' | 'minimal' | 'balanced' | 'max'>('auto');
  const recent = useRef<number[]>([]);
  const comboRef = useRef(0);
  const pop = useSharedValue(1);
  const shake = useImpactShake();

  const reset = () => {
    view.current?.resetExercise();
    setLeft(0);
    setRight(0);
    setCombo(0);
    setBest(0);
    setPace(0);
    recent.current = [];
    comboRef.current = 0;
  };

  const onRep = (e: RepEvent) => {
    if (e.side === 'right') setRight((n) => n + 1);
    else setLeft((n) => n + 1);

    const times = recent.current;
    const last = times[times.length - 1];
    const next = last !== undefined && e.timestamp - last < COMBO_GAP_MS ? comboRef.current + 1 : 1;
    comboRef.current = next;
    setCombo(next);
    setBest((b) => Math.max(b, next));
    times.push(e.timestamp);
    while (times.length && e.timestamp - times[0] > PACE_WINDOW_MS) times.shift();
    setPace(Math.round((times.length * 60000) / PACE_WINDOW_MS));
    if (next > 1) pop.value = withSequence(withTiming(1.35, { duration: 70 }), withSpring(1));
  };

  const pick = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 1,
    });
    if (picked.canceled) return;
    setVideoUri(picked.assets[0].uri);
    reset();
  };

  const switchTo = (next: Source) => {
    setSource(next);
    reset();
  };

  const comboStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const playingVideo = source === 'video' && videoUri !== null;

  return (
    <DemoFrame
      title="Boxing"
      tag="Peak mode"
      onBack={onBack}
      camera={
        <Animated.View style={[StyleSheet.absoluteFill, shake.style]}>
          <BodyVisionView
            ref={view}
            key={`${source}-${videoUri}`}
            style={StyleSheet.absoluteFill}
            testInput={source === 'camera' ? input : null}
            video={playingVideo ? videoUri : null}
            videoLoop
            active={source === 'camera' || playingVideo}
            resizeMode={playingVideo ? 'contain' : 'cover'}
            rules={RULES}
            smoothing="none"
            onRep={onRep}>
            {look !== 'clean' && look !== 'off' ? (
              <ImpactEffect
                look={look}
                level={level}
                onImpact={level === 'minimal' ? undefined : shake.shake}
              />
            ) : null}
            {look === 'clean' ? (
              <ImpactEffect
                words={false}
                speedLines={false}
                size={80}
                colors={{ left: color.amber, right: color.coral }}
              />
            ) : null}
            {look !== 'off' ? <ComboFever from={5} level={level} /> : null}
          </BodyVisionView>
        </Animated.View>
      }
      hud={
        <>
          <Choice
            options={['camera', 'video'] as const}
            labels={{ camera: 'Camera', video: 'Video file' }}
            value={source}
            onChange={switchTo}
            testIDPrefix="boxing-source"
          />
          <Choice
            options={['anime', 'lightning', 'fire', 'pixel', 'shatter', 'clean', 'off'] as const}
            labels={{
              anime: 'Anime',
              lightning: 'Lightning',
              fire: 'Fire',
              pixel: 'Pixel',
              shatter: 'Shatter',
              clean: 'Clean',
              off: 'No effect',
            }}
            value={look}
            onChange={setLook}
            testIDPrefix="boxing-look"
          />
          <Choice
            options={['auto', 'minimal', 'balanced', 'max'] as const}
            labels={{ auto: 'Auto', minimal: 'Minimal', balanced: 'Balanced', max: 'Max' }}
            value={level}
            onChange={setLevel}
            testIDPrefix="boxing-level"
          />
          {source === 'video' && !videoUri ? (
            <PrimaryButton label="Pick a boxing video" onPress={pick} testID="boxing-pick" />
          ) : (
            <>
              <View style={styles.row}>
                <Metric
                  value={`${left + right}`}
                  label="Punches"
                  size={88}
                  tint={color.lime}
                  testID="punch-count"
                />
                <View style={styles.side}>
                  <Readout label="Left" value={`${left}`} tint={color.lime} testID="punch-left" />
                  <Readout
                    label="Right"
                    value={`${right}`}
                    tint={color.cyan}
                    testID="punch-right"
                  />
                </View>
              </View>
              <View style={styles.row}>
                <Animated.View style={[styles.combo, comboStyle]}>
                  <Text style={[type.label, styles.comboLabel]}>Combo</Text>
                  <Text style={styles.comboValue}>x{combo}</Text>
                </Animated.View>
                <Readout label="Best" value={`x${best}`} />
                <Readout label="Per min" value={`${pace}`} />
              </View>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <GhostButton label="Reset" onPress={reset} testID="punch-reset" />
                </View>
                {source === 'video' ? (
                  <View style={styles.flex}>
                    <GhostButton label="Other video" onPress={pick} />
                  </View>
                ) : null}
              </View>
            </>
          )}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 24 },
  side: { flex: 1, gap: 12, paddingBottom: 8 },
  flex: { flex: 1 },
  combo: { minWidth: 96 },
  comboLabel: { color: color.muted },
  comboValue: { color: color.amber, fontSize: 34, fontWeight: '900' },
});
