import { getCapabilities } from '@rbayuokt/expo-body-vision';
import { useContext } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, Choice, Label } from '../components/ui';
import { color, space, type } from '../theme';
import { InputContext } from './shared/input';

export const DEMOS = [
  {
    id: 'tracking',
    title: 'Body tracking',
    detail: 'Camera, pose model, tracking and the native skeleton.',
    tag: 'Pipeline',
  },
  {
    id: 'setup',
    title: 'Guided setup',
    detail: 'Get in position, then calibrate.',
    tag: 'Readiness',
  },
  {
    id: 'customSetup',
    title: 'Custom setup',
    detail: 'Own UI, own steps, edge glow.',
    tag: 'Headless',
  },
  {
    id: 'video',
    title: 'Video analysis',
    detail: 'Count reps in a clip, compare models.',
    tag: 'Offline',
  },
  { id: 'boxing', title: 'Boxing', detail: 'Punch counter with impact effects.', tag: 'Peak mode' },
  { id: 'exercise', title: 'Rep counter', detail: 'Push-ups and squats.', tag: 'State machine' },
  { id: 'tpose', title: 'T-pose trigger', detail: 'A pose rule written in JS.', tag: 'Rules' },
  { id: 'target', title: 'Target game', detail: 'Hands hit targets.', tag: 'Interaction' },
  { id: 'skeleton', title: 'Custom skeleton', detail: 'Colors, widths, trails.', tag: 'Rendering' },
  { id: 'stress', title: 'Freeze JS', detail: 'Native keeps going.', tag: 'Threading' },
  { id: 'performance', title: 'Performance', detail: 'Modes and counters.', tag: 'Adaptive' },
  { id: 'lifecycle', title: 'Lifecycle', detail: 'Mount and unmount loop.', tag: 'Resources' },
] as const;

export type DemoId = (typeof DEMOS)[number]['id'];

export function HomeScreen({ onOpen }: { onOpen: (id: DemoId) => void }) {
  const insets = useSafeAreaInsets();
  const { kind, setKind } = useContext(InputContext);
  const replayAvailable = getCapabilities().testInput;
  const [hero, ...rest] = DEMOS;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl },
      ]}
      testID="home">
      <Label tint={color.lime}>expo-body-vision</Label>
      <Text style={styles.title}>Body{'\n'}Vision</Text>
      <Text style={styles.subtitle}>
        Everything below runs natively. JavaScript only sets it up and hears the results.
      </Text>

      {replayAvailable ? (
        <View style={styles.input}>
          <Label>Input</Label>
          <Choice
            options={['camera', 'replay'] as const}
            labels={{ camera: 'Live camera', replay: 'Recorded' }}
            value={kind}
            onChange={setKind}
            testIDPrefix="input"
          />
        </View>
      ) : null}

      <Pressable
        onPress={() => onOpen(hero.id)}
        style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
        testID={`demo-${hero.id}`}
        accessibilityRole="button">
        <Text style={[styles.index, { color: color.limeInk }]}>01</Text>
        <Text style={styles.heroTitle}>{hero.title}</Text>
        <Text style={styles.heroDetail}>{hero.detail}</Text>
        <Chip text={hero.tag} tint={color.limeInk} />
      </Pressable>

      <View style={styles.grid}>
        {rest.map((d, i) => (
          <Pressable
            key={d.id}
            onPress={() => onOpen(d.id)}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
            testID={`demo-${d.id}`}
            accessibilityRole="button">
            <Text style={styles.index}>{String(i + 2).padStart(2, '0')}</Text>
            <Text style={styles.tileTitle}>{d.title}</Text>
            <Text style={styles.tileDetail}>{d.detail}</Text>
            <Chip text={d.tag} style={styles.tileChip} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink },
  content: { paddingHorizontal: space.lg, gap: space.md },
  title: {
    color: color.text,
    fontSize: 56,
    lineHeight: 56,
    fontWeight: '900',
    letterSpacing: -2.5,
    marginTop: space.xs,
  },
  subtitle: { color: color.muted, fontSize: 15, lineHeight: 21, maxWidth: 320 },
  input: { gap: space.sm, marginVertical: space.sm },
  hero: {
    backgroundColor: color.lime,
    borderRadius: 24,
    padding: space.xl,
    gap: space.sm,
    marginTop: space.sm,
  },
  heroTitle: { color: color.limeInk, fontSize: 28, fontWeight: '900', letterSpacing: -0.8 },
  heroDetail: { color: color.limeInk, fontSize: 15, opacity: 0.75, marginBottom: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: {
    width: '48%',
    flexGrow: 1,
    minHeight: 150,
    backgroundColor: color.panelSolid,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.lg,
    gap: space.xs,
  },
  index: { ...type.label, color: color.lime, fontFamily: type.mono, letterSpacing: 0 },
  tileTitle: { color: color.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  tileDetail: { color: color.muted, fontSize: 13, lineHeight: 18, flexGrow: 1 },
  tileChip: { marginTop: space.sm },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
