import {
  BodyVisionView,
  punch,
  type BodyVisionViewRef,
  useRepStats,
} from '@rbayuokt/expo-body-vision';
import { ComboFever, ImpactEffect, useImpactShake } from '@rbayuokt/expo-body-vision/effects';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DemoProps } from '../App';
import { CameraButtons } from '../components/CameraButtons';
import { DemoFrame } from '../components/DemoFrame';
import { FloatingStats } from '../components/FloatingStats';
import { Label, PrimaryButton, Segmented, Stat } from '../components/ui';
import { color, space } from '../theme';
import { useDemoInput } from './shared/input';

const RULES = [punch()];
// Punches closer than this in time are one combo.
const COMBO_GAP_MS = 900;
const oraBanner = (combo: number) => Array(Math.min(combo, 4)).fill('ORA').join(' ') + '!';

type Source = 'camera' | 'video';
type Look = 'anime' | 'lightning' | 'fire' | 'pixel' | 'shatter' | 'jojo' | 'clean' | 'off';
type Level = 'auto' | 'minimal' | 'balanced' | 'max';

const SOURCES: { id: Source; label: string }[] = [
  { id: 'camera', label: 'Camera' },
  { id: 'video', label: 'Video' },
];
const LOOKS: { id: Look; label: string; swatch: string }[] = [
  { id: 'anime', label: 'Anime', swatch: '#C6FF3D' },
  { id: 'lightning', label: 'Lightning', swatch: '#7DF9FF' },
  { id: 'fire', label: 'Fire', swatch: '#FF8A3D' },
  { id: 'pixel', label: 'Pixel', swatch: '#FFC23D' },
  { id: 'shatter', label: 'Shatter', swatch: '#CFF4FF' },
  { id: 'jojo', label: 'JoJo', swatch: '#B14CFF' },
  { id: 'clean', label: 'Clean', swatch: '#FF6B4A' },
  { id: 'off', label: 'None', swatch: '#4A524D' },
];
const LEVELS: { id: Level; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'max', label: 'Max' },
];

export function BoxingScreen({ onBack }: DemoProps) {
  const input = useDemoInput('punches', true);
  const view = useRef<BodyVisionViewRef>(null);
  const [source, setSource] = useState<Source>('camera');
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const { stats: punches, track, reset: resetStats } = useRepStats({ comboGapMs: COMBO_GAP_MS });
  const [look, setLook] = useState<Look>('anime');
  const [level, setLevel] = useState<Level>('auto');
  // Settings stay folded away so the HUD leaves the boxer in view.
  const [tuning, setTuning] = useState(false);
  const pop = useSharedValue(1);
  const shake = useImpactShake();
  const insets = useSafeAreaInsets();

  const reset = () => {
    view.current?.resetExercise();
    resetStats();
  };

  useEffect(() => {
    if (punches.combo > 1)
      pop.value = withSequence(withTiming(1.35, { duration: 70 }), withSpring(1));
  }, [punches.combo, pop]);

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
        <>
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
              {...track}>
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
              {look !== 'off' ? (
                <ComboFever
                  from={5}
                  level={level}
                  color={look === 'jojo' ? '#B14CFF' : undefined}
                  banner={look === 'jojo' ? oraBanner : undefined}
                  // Below the floating header.
                  bannerTop={insets.top + 64}
                />
              ) : null}
              <CameraButtons />
              <FloatingStats />
            </BodyVisionView>
          </Animated.View>
        </>
      }
      hud={
        <>
          {source === 'video' && !videoUri ? (
            <PrimaryButton label="Pick a boxing video" onPress={pick} testID="boxing-pick" />
          ) : (
            <View style={styles.stats}>
              <Stat value={punches.count} label="Total" tint={color.lime} testID="punch-count" />
              <Stat value={punches.left} label="Left" tint={color.lime} testID="punch-left" />
              <Stat value={punches.right} label="Right" tint={color.cyan} testID="punch-right" />
              <Stat
                value={`x${punches.combo}`}
                label="Combo"
                tint={color.amber}
                animated={comboStyle}
              />
              <Stat value={`x${punches.best}`} label="Best" tint={color.text} />
            </View>
          )}
          <View style={styles.actions}>
            <ActionButton
              label={tuning ? 'Done' : '⚙︎  Settings'}
              active={tuning}
              onPress={() => setTuning((t) => !t)}
              testID="boxing-settings"
            />
            <ActionButton label="↺  Reset" onPress={reset} testID="punch-reset" />
          </View>
          {tuning ? (
            <View style={styles.settings}>
              <View style={styles.section}>
                <Label>Effect</Label>
                <View style={styles.grid}>
                  {LOOKS.map((l) => (
                    <Pressable
                      key={l.id}
                      onPress={() => setLook(l.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: look === l.id }}
                      testID={`boxing-look-${l.id}`}
                      style={[styles.card, look === l.id && styles.cardSelected]}>
                      <View style={[styles.swatch, { backgroundColor: l.swatch }]} />
                      <Text style={styles.cardText} numberOfLines={1}>
                        {l.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.section}>
                <Label>Intensity</Label>
                <Segmented
                  options={LEVELS}
                  value={level}
                  onChange={setLevel}
                  testIDPrefix="boxing-level"
                />
              </View>
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Label>Input</Label>
                  {playingVideo ? (
                    <Pressable onPress={pick} hitSlop={8} testID="boxing-other-video">
                      <Text style={styles.link}>Change video</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Segmented
                  options={SOURCES}
                  value={source}
                  onChange={switchTo}
                  testIDPrefix="boxing-source"
                />
              </View>
            </View>
          ) : null}
        </>
      }
    />
  );
}

function ActionButton({
  label,
  onPress,
  active,
  testID,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      testID={testID}
      style={({ pressed }) => [
        styles.action,
        active && styles.actionActive,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.actionText, active && styles.actionTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row' },
  actions: { flexDirection: 'row', gap: space.sm },
  action: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: color.raised,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  actionActive: { backgroundColor: color.lime, borderColor: color.lime },
  actionText: { color: color.text, fontSize: 14, fontWeight: '700' },
  actionTextActive: { color: color.limeInk },
  settings: { gap: space.md },
  section: { gap: space.sm },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: {
    width: '23%',
    flexGrow: 1,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    backgroundColor: color.raised,
    borderWidth: 1.5,
    borderColor: color.hairline,
  },
  cardSelected: { borderColor: color.lime },
  swatch: { width: 20, height: 20, borderRadius: 10 },
  cardText: { color: color.text, fontSize: 12, fontWeight: '700' },
  link: { color: color.lime, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});
