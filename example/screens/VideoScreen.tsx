import {
  analyzeVideo,
  BodyVisionView,
  JOINTS,
  useRepStats,
  punch,
  pushUp,
  squat,
  tPose,
  type AnalyzeVideoOptions,
  type VideoAnalysis,
} from '@rbayuokt/expo-body-vision';
import { registerDemoBackends } from 'demo-pose-backends';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DemoProps } from '../App';
import { CameraButtons } from '../components/CameraButtons';
import { DemoFrame, useHudInset } from '../components/DemoFrame';
import { FloatingStats } from '../components/FloatingStats';
import { GhostButton, Label, PrimaryButton, Segmented } from '../components/ui';
import { color, space, type } from '../theme';

const RULES = {
  squat: [squat()],
  pushup: [pushUp()],
  punch: [punch()],
  tpose: [tPose()],
};
type Detect = keyof typeof RULES;

const PLATFORM_BACKEND: string | undefined = registerDemoBackends()[0];
const HEAVY_MODEL = require('../assets/models/pose_landmarker_heavy.task');

interface ModelChoice {
  id: string;
  label: string;
  short: string;
  options: Pick<AnalyzeVideoOptions, 'backend' | 'model'>;
}

const MODELS: ModelChoice[] = [
  ...(Platform.OS === 'android'
    ? [{ id: 'mlkit', label: 'ML Kit', short: 'ML Kit', options: { backend: 'mlkit' } }]
    : []),
  {
    id: 'lite',
    label: 'MediaPipe Lite',
    short: 'Lite',
    options: { backend: 'mediapipe', model: 'lite' },
  },
  {
    id: 'full',
    label: 'MediaPipe Full',
    short: 'Full',
    options: { backend: 'mediapipe', model: 'full' },
  },
  {
    id: 'heavy',
    label: 'MediaPipe Heavy',
    short: 'Heavy',
    options: { backend: 'mediapipe', model: HEAVY_MODEL },
  },
  ...(PLATFORM_BACKEND
    ? [
        {
          id: 'platform',
          label: 'Apple Vision',
          short: 'Vision',
          options: { backend: PLATFORM_BACKEND },
        },
      ]
    : []),
];

// Joints that should sit still when the person does. Used for the shakiness figure.
const STEADY = [
  'leftShoulder',
  'rightShoulder',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
].map((n) => JOINTS.indexOf(n as (typeof JOINTS)[number]));

interface Summary {
  model: string;
  reps: number;
  rejected: number;
  poses: number;
  bodyFound: number;
  shake: number;
  msPerFrame: number;
  seconds: number;
}

function summarize(model: string, result: VideoAnalysis, seconds: number): Summary {
  const count = (type: string) => result.events.filter((e) => e.type === type).length;
  const frames = result.landmarks ?? [];
  const found = frames.filter((f) => STEADY.some((j) => f.points[j * 3 + 2] >= 0.5)).length;
  // Mean movement of steady joints between consecutive frames, in percent of the frame.
  let moved = 0;
  let pairs = 0;
  for (let i = 1; i < frames.length; i++) {
    for (const j of STEADY) {
      const a = frames[i - 1].points;
      const b = frames[i].points;
      if (a[j * 3 + 2] < 0.5 || b[j * 3 + 2] < 0.5) continue;
      moved += Math.hypot(b[j * 3] - a[j * 3], b[j * 3 + 1] - a[j * 3 + 1]);
      pairs++;
    }
  }
  return {
    model,
    reps: count('repCompleted'),
    rejected: count('repRejected'),
    poses: count('poseEntered'),
    bodyFound: frames.length ? (100 * found) / frames.length : 0,
    shake: pairs ? (100 * moved) / pairs : 0,
    msPerFrame: result.averageInferenceMs,
    seconds,
  };
}

const DETECTS: { id: Detect; label: string }[] = [
  { id: 'squat', label: 'Squats' },
  { id: 'pushup', label: 'Push-ups' },
  { id: 'punch', label: 'Punches' },
  { id: 'tpose', label: 'T-pose' },
];

/** Runs a picked video through the engine, once or with every model for a side-by-side comparison. */
export function VideoScreen({ onBack }: DemoProps) {
  const [video, setVideo] = useState<{ uri: string; name: string } | null>(null);
  const [detect, setDetect] = useState<Detect>('squat');
  const [model, setModel] = useState(MODELS[0].id);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Summary[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [sheet, setSheet] = useState(false);
  // The live preview's own count. analyzeVideo results are tallied from their events instead.
  const live = useRepStats();
  const [livePose, setLivePose] = useState(false);
  const chosen = MODELS.find((m) => m.id === model) ?? MODELS[0];

  const pick = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 1,
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    setVideo({ uri: asset.uri, name: asset.fileName ?? 'video' });
    live.reset();
    setResults([]);
    setErrors([]);
  };

  const run = async (choices: ModelChoice[]) => {
    if (!video || running) return;
    setResults([]);
    setErrors([]);
    setSheet(true);
    const out: Summary[] = [];
    for (const choice of choices) {
      setRunning(choice.label);
      const started = Date.now();
      try {
        const result = await analyzeVideo(video.uri, {
          ...choice.options,
          rules: RULES[detect],
          smoothing: detect === 'punch' ? 'none' : undefined,
          landmarks: true,
          fps: 30,
        });
        out.push(summarize(choice.short, result, (Date.now() - started) / 1000));
        setResults([...out]);
      } catch (e) {
        const message = `${choice.short}: ${e instanceof Error ? e.message : String(e)}`;
        setErrors((list) => [...list, message]);
      }
    }
    setRunning(null);
  };

  const counted = detect === 'tpose' ? 'Poses' : detect === 'punch' ? 'Punches' : 'Reps';

  return (
    <View style={styles.root}>
      <DemoFrame
        title="Video analysis"

        tag="Offline"
        onBack={onBack}
        camera={
          video ? (
            <BodyVisionView
              style={StyleSheet.absoluteFill}
              video={video.uri}
              videoLoop
              active={!running}
              resizeMode="cover"
              rules={RULES[detect]}
              smoothing={detect === 'punch' ? 'none' : undefined}
              {...chosen.options}
              {...live.track}
              onPoseEntered={() => setLivePose(true)}
              onPoseExited={() => setLivePose(false)}
              onError={(e) => setErrors((list) => [...list, e.message])}>
              <LiveChip
                label={`Live ${counted.toLowerCase()}`}
                value={detect === 'tpose' ? (livePose ? 'Yes' : 'No') : `${live.stats.count}`}
              />
              <CameraButtons />
              <FloatingStats />
            </BodyVisionView>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Count reps in any clip</Text>
              <Text style={styles.emptyNote}>
                It runs through the same engine as the live camera, so every model sees exactly the
                same frames.
              </Text>
              <PrimaryButton label="Pick a video" onPress={pick} testID="video-pick" />
            </View>
          )
        }
        hud={
          <>
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Label>Detect</Label>
                {video ? (
                  <Pressable onPress={pick} hitSlop={8} testID="video-pick">
                    <Text style={styles.link}>Change video</Text>
                  </Pressable>
                ) : null}
              </View>
              <Segmented
                options={DETECTS}
                value={detect}
                onChange={(d) => {
                  setDetect(d);
                  live.reset();
                }}
                testIDPrefix="video-detect"
              />
            </View>
            <View style={styles.section}>
              <Label>Model</Label>
              <Segmented
                options={MODELS.map((m) => ({ id: m.id, label: m.short }))}
                value={model}
                onChange={(m) => {
                  setModel(m);
                  live.reset();
                }}
                testIDPrefix="video-model"
              />
            </View>
            <View style={styles.actions}>
              <View style={styles.flex}>
                <PrimaryButton
                  label={running ? 'Running…' : 'Analyse'}
                  disabled={!video || !!running}
                  onPress={() => run([chosen])}
                  testID="video-run"
                />
              </View>
              <View style={styles.flex}>
                <GhostButton
                  label="Compare all"
                  onPress={() => run(MODELS)}
                  testID="video-compare"
                />
              </View>
            </View>
          </>
        }
      />
      <ResultsSheet
        open={sheet}
        onClose={() => setSheet(false)}
        counted={detect === 'tpose' ? 'Poses' : counted}
        results={results}
        running={running}
        errors={errors}
        poses={detect === 'tpose'}
      />
    </View>
  );
}

function LiveChip({ label, value }: { label: string; value: string }) {
  const inset = useHudInset();
  return (
    <View style={[styles.chip, { top: inset.top + space.sm }]} pointerEvents="none">
      <Label tint={color.lime}>{label}</Label>
      <Text style={styles.chipValue}>{value}</Text>
    </View>
  );
}

const COLUMNS = ['Count', 'Missed', 'Body', 'Shake', 'ms'];

/** Slides up from the bottom with one row per model, every column the same width. */
function ResultsSheet({
  open,
  onClose,
  counted,
  results,
  running,
  errors,
  poses,
}: {
  open: boolean;
  onClose: () => void;
  counted: string;
  results: Summary[];
  running: string | null;
  errors: string[];
  poses: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const offset = useSharedValue(height);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    offset.value = open
      ? withSpring(0, { damping: 26, stiffness: 320, mass: 0.9 })
      : withTiming(height, { duration: 220 }, (done) => {
          if (done) runOnJS(setMounted)(false);
        });
  }, [open, offset, height]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: 1 - offset.value / height }));
  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close results"
        />
      </Animated.View>
      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }, sheetStyle]}
        testID="video-results">
        <View style={styles.grabber} />
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>{running ? `Running ${running}…` : 'Results'}</Text>
          <Pressable onPress={onClose} hitSlop={8} testID="video-results-close">
            <Text style={styles.link}>Close</Text>
          </Pressable>
        </View>
        <View style={styles.tableRow}>
          <Text style={[styles.th, styles.modelCol]}>Model</Text>
          {COLUMNS.map((c) => (
            <Text key={c} style={styles.th}>
              {c === 'Count' ? counted : c}
            </Text>
          ))}
        </View>
        {results.map((r) => (
          <View key={r.model} style={styles.tableRow} testID={`video-result-${r.model}`}>
            <Text style={[styles.td, styles.modelCol]} numberOfLines={1}>
              {r.model}
            </Text>
            <Text style={[styles.td, { color: color.lime }]}>{poses ? r.poses : r.reps}</Text>
            <Text style={[styles.td, r.rejected ? { color: color.coral } : null]}>
              {r.rejected}
            </Text>
            <Text style={styles.td}>{`${r.bodyFound.toFixed(0)}%`}</Text>
            <Text style={styles.td}>{`${r.shake.toFixed(2)}%`}</Text>
            <Text style={styles.td}>{r.msPerFrame.toFixed(0)}</Text>
          </View>
        ))}
        {running ? (
          <Text style={styles.note}>Analysing every frame, this takes a few seconds.</Text>
        ) : null}
        {errors.map((e) => (
          <Text key={e} style={styles.error}>
            {e}
          </Text>
        ))}
        <Text style={styles.note}>
          Body is how often a body was found. Shake is how far shoulders, hips and knees move
          between frames, as a percent of the frame, lower is steadier. ms is the time per frame.
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink },
  empty: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    gap: space.md,
    paddingBottom: 220,
  },
  emptyTitle: { color: color.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  emptyNote: { color: color.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  chip: {
    position: 'absolute',
    left: space.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 14,
    backgroundColor: color.panel,
    gap: 2,
  },
  chipValue: { color: color.text, fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  section: { gap: space.sm },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  link: { color: color.lime, fontSize: 13, fontWeight: '700' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.md,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: color.panelSolid,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.faint,
  },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: color.text, fontSize: 20, fontWeight: '800' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  modelCol: { flex: 1.4, textAlign: 'left' },
  th: { ...type.label, flex: 1, color: color.muted, fontSize: 9, textAlign: 'center' },
  td: {
    flex: 1,
    color: color.text,
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  note: { color: color.muted, fontSize: 12, lineHeight: 17 },
  error: { color: color.coral, fontSize: 13 },
});
