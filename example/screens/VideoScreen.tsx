import {
  analyzeVideo,
  BodyVisionView,
  JOINTS,
  punch,
  pushUp,
  squat,
  tPose,
  type AnalyzeVideoOptions,
  type VideoAnalysis,
} from '@rbayuokt/expo-body-vision';
import { registerDemoBackends } from 'demo-pose-backends';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DemoProps } from '../App';
import { Choice, GhostButton, Label, PrimaryButton, Readout } from '../components/ui';
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
  options: Pick<AnalyzeVideoOptions, 'backend' | 'model'>;
}

const MODELS: ModelChoice[] = [
  ...(Platform.OS === 'android'
    ? [{ id: 'mlkit', label: 'ML Kit', options: { backend: 'mlkit' } }]
    : []),
  { id: 'lite', label: 'MediaPipe Lite', options: { backend: 'mediapipe', model: 'lite' } },
  { id: 'full', label: 'MediaPipe Full', options: { backend: 'mediapipe', model: 'full' } },
  { id: 'heavy', label: 'MediaPipe Heavy', options: { backend: 'mediapipe', model: HEAVY_MODEL } },
  ...(PLATFORM_BACKEND
    ? [{ id: 'platform', label: 'Apple Vision', options: { backend: PLATFORM_BACKEND } }]
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

/** Runs a picked video through the engine, once or with every model for a side-by-side comparison. */
export function VideoScreen({ onBack }: DemoProps) {
  const insets = useSafeAreaInsets();
  const [video, setVideo] = useState<{ uri: string; name: string } | null>(null);
  const [detect, setDetect] = useState<Detect>('squat');
  const [model, setModel] = useState(MODELS[0].id);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Summary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [liveReps, setLiveReps] = useState(0);
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
    setLiveReps(0);
    setResults([]);
    setError(null);
  };

  const run = async (choices: ModelChoice[]) => {
    if (!video) return;
    setResults([]);
    setError(null);
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
        out.push(summarize(choice.label, result, (Date.now() - started) / 1000));
        setResults([...out]);
      } catch (e) {
        const message = `${choice.label}: ${e instanceof Error ? e.message : String(e)}`;
        setError((prev) => (prev ? `${prev}\n${message}` : message));
      }
    }
    setRunning(null);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={styles.back}
          testID="back"
          accessibilityRole="button"
          accessibilityLabel="Back">
          <View style={styles.chevron} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={[type.label, styles.tag]}>Offline</Text>
          <Text style={styles.title}>Video analysis</Text>
        </View>
        <View style={styles.backSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
        <Text style={styles.note}>
          Pick a clip and it runs through the same engine as the live camera, as fast as the phone
          can go. Compare all models to see how they differ on exactly the same frames.
        </Text>
        <PrimaryButton
          label={video ? 'Pick another video' : 'Pick a video'}
          onPress={pick}
          testID="video-pick"
        />
        {video ? (
          <View style={styles.preview} testID="video-preview">
            <BodyVisionView
              style={StyleSheet.absoluteFill}
              video={video.uri}
              videoLoop
              active={!running}
              resizeMode="contain"
              rules={RULES[detect]}
              smoothing={detect === 'punch' ? 'none' : undefined}
              {...chosen.options}
              onRep={() => setLiveReps((n) => n + 1)}
              onPoseEntered={() => setLivePose(true)}
              onPoseExited={() => setLivePose(false)}
              onError={(e) => setError(e.message)}
            />
            <View style={styles.previewBadge} pointerEvents="none">
              <Text style={[type.label, styles.previewLabel]}>
                {detect === 'tpose' ? 'Pose' : detect === 'punch' ? 'Live punches' : 'Live reps'}
              </Text>
              <Text style={styles.previewValue}>
                {detect === 'tpose' ? (livePose ? 'Yes' : 'No') : liveReps}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.group}>
          <Label>Detect</Label>
          <Choice
            options={['squat', 'pushup', 'punch', 'tpose'] as const}
            labels={{ squat: 'Squats', pushup: 'Push-ups', punch: 'Punches', tpose: 'T-pose' }}
            value={detect}
            onChange={(d) => {
              setDetect(d);
              setLiveReps(0);
            }}
          />
        </View>
        <View style={styles.group}>
          <Label>Model</Label>
          <Choice
            options={MODELS.map((m) => m.id)}
            labels={Object.fromEntries(MODELS.map((m) => [m.id, m.label]))}
            value={model}
            onChange={(m) => {
              setModel(m);
              setLiveReps(0);
            }}
          />
        </View>

        <View style={styles.row}>
          <View style={styles.flex}>
            <PrimaryButton
              label={running ? `Running ${running}…` : 'Analyse'}
              disabled={!video || !!running}
              onPress={() => run(MODELS.filter((m) => m.id === model))}
              testID="video-run"
            />
          </View>
          <View style={styles.flex}>
            <GhostButton
              label="Compare all models"
              onPress={() => !running && video && run(MODELS)}
              testID="video-compare"
            />
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {results.map((r) => (
          <View key={r.model} style={styles.card} testID={`video-result-${r.model}`}>
            <Text style={styles.cardTitle}>{r.model}</Text>
            <View style={styles.row}>
              <Readout
                label={detect === 'tpose' ? 'Poses' : detect === 'punch' ? 'Punches' : 'Reps'}
                value={`${detect === 'tpose' ? r.poses : r.reps}`}
                tint={color.lime}
              />
              <Readout
                label="Not counted"
                value={`${r.rejected}`}
                tint={r.rejected ? color.coral : color.text}
              />
              <Readout label="Body found" value={`${r.bodyFound.toFixed(0)}%`} />
            </View>
            <View style={styles.row}>
              <Readout label="Shakiness" value={`${r.shake.toFixed(2)}%`} />
              <Readout label="Per frame" value={`${r.msPerFrame.toFixed(0)} ms`} />
              <Readout label="Took" value={`${r.seconds.toFixed(1)} s`} />
            </View>
          </View>
        ))}
        {results.length ? (
          <Text style={styles.note}>
            Shakiness is how far the shoulders, hips and knees move between frames, as a percent of
            the frame. On a clip where you stand still, lower means steadier.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    width: 12,
    height: 12,
    marginLeft: 4,
    borderLeftWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: color.text,
    borderBottomLeftRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  backSpacer: { width: 44 },
  titleWrap: { flex: 1, alignItems: 'center' },
  tag: { color: color.lime, fontSize: 10 },
  title: { color: color.text, fontSize: 17, fontWeight: '700' },
  content: { padding: space.lg, gap: space.lg },
  note: { color: color.muted, fontSize: 14, lineHeight: 20 },
  group: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.md },
  flex: { flex: 1 },
  error: { color: color.coral, fontSize: 14 },
  preview: {
    height: 440,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: color.panelSolid,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  previewBadge: {
    position: 'absolute',
    top: space.md,
    left: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 16,
    backgroundColor: color.panel,
  },
  previewLabel: { color: color.lime, fontSize: 10 },
  previewValue: { color: color.text, fontSize: 22, fontWeight: '800' },
  card: {
    backgroundColor: color.panelSolid,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.lg,
    gap: space.md,
  },
  cardTitle: { color: color.text, fontSize: 18, fontWeight: '800' },
});
