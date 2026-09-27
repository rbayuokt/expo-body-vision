import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Platform,
  processColor,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  NativeBodyVisionView,
  type NativeBodyVisionRef,
  type NativeEngineConfig,
  type NativeEvent,
  type NativeEventBatch,
} from './NativeBodyVisionView';
import { BodyVisionError } from './errors';
import { BodyEventsContext, type BodyVisionEvent } from './events';
import { resolveAsset, resolveModel, type PoseModelSource } from './model';
import { validateRule, type RuleDefinition } from './rules';
import { BodySetupContext, type BodySetupContextValue } from './setup/context';
import { DEFAULT_SETUP_PROMPTS, type SetupPrompt } from './setup/prompts';
import {
  INITIAL_SETUP_STATE,
  isSetupPoseId,
  resolveSteps,
  setupPoseId,
  SetupSession,
  type SetupSessionOptions,
  type SetupState,
} from './setup/session';
import { createSpeaker, type VoiceOptions } from './setup/speech';
import { validateTarget } from './targets';
import type {
  BodyDetectedEvent,
  BodyLostEvent,
  BodyVisionStats,
  CalibrationResult,
  CameraFacing,
  CameraReadyEvent,
  ExercisePhaseEvent,
  LandmarksEvent,
  PerformanceChangeEvent,
  PerformanceMode,
  PoseEnteredEvent,
  PoseExitedEvent,
  PredictionOptions,
  Framing,
  ReadinessEvent,
  ReadinessOptions,
  RepEvent,
  RepRejectedEvent,
  ReplayInput,
  ResizeMode,
  SkeletonStyle,
  SmoothingOptions,
  SmoothingPreset,
  TargetDefinition,
  TargetHitEvent,
  TrackingOptions,
  ZoneEvent,
} from './types';
import type { VideoSource } from './video';

export interface BodyVisionViewProps {
  /** Default `front`. */
  facing?: CameraFacing;
  /** false stops the camera and inference. Default true. */
  active?: boolean;
  /** Default `cover`. */
  resizeMode?: ResizeMode;
  /** Default `auto`. */
  performance?: PerformanceMode;
  /** Default `balanced`. */
  smoothing?: SmoothingPreset | SmoothingOptions;
  /** Extrapolate joints to display time. Default on, 100 ms max. */
  prediction?: boolean | PredictionOptions;
  tracking?: TrackingOptions;
  /** Poses, exercises and targets evaluated natively on every inference. */
  rules?: (RuleDefinition | TargetDefinition)[];
  /** Native skeleton overlay. `false` hides it. */
  skeleton?: SkeletonStyle | false;
  /** Opt-in raw joints in view coordinates, throttled natively. Default off, 100 ms when on. */
  landmarks?: boolean | { intervalMs?: number };
  /** Shows native performance counters over the preview. */
  debug?: boolean;
  /**
   * Experimental: run the pose model on the GPU. Falls back to CPU with a `GPU_UNAVAILABLE`
   * error when the device can't. Default `cpu` until benchmarks settle the default.
   */
  experimentalDelegate?: 'cpu' | 'gpu';
  /**
   * Pose backend by name. Built in: `mlkit` (Android default) and `mediapipe` (iOS default, and
   * on Android whenever `model` is `full` or a file, or `performance` is `accuracy`). Apps can
   * register their own natively with `BodyVisionBackends.register`, listed in
   * `getCapabilities().backends`.
   */
  backend?: string;
  /**
   * MediaPipe model: `lite` (default), `full` (default in `accuracy` mode), or your own `.task`
   * file. Custom backends receive it as-is.
   */
  model?: PoseModelSource;
  /**
   * A calibration saved from an earlier `onSetupComplete` or `calibrate()`, so distance rules use
   * the user's proportions without measuring again on this screen.
   */
  calibration?: CalibrationResult | null;
  /** Native readiness checks (in frame, distance, centered, still). Results go to `onReadiness`. */
  readiness?: boolean | ReadinessOptions;
  /**
   * Guided setup: waits until the user is positioned, holds, then calibrates. Pair with
   * `<BodySetup />` from `@rbayuokt/expo-body-vision/setup` for the built-in overlay, or build
   * your own from `onSetupChange` / `useBodySetup()`.
   */
  setup?: boolean | BodySetupOptions;
  /** Replaces the camera with recorded frames. Requires the config plugin's `enableTestInput`. */
  testInput?: ReplayInput | null;
  /**
   * Plays a video file in place of the camera, tracked and drawn live like the camera. Inference
   * keeps pace with playback by skipping frames. `analyzeVideo` processes every frame instead.
   * `active={false}` pauses it.
   */
  video?: VideoSource | null;
  /** Loop `video`. Default false, `onVideoEnd` fires when it finishes. */
  videoLoop?: boolean;

  onCameraReady?: (event: CameraReadyEvent) => void;
  onBodyDetected?: (event: BodyDetectedEvent) => void;
  onBodyLost?: (event: BodyLostEvent) => void;
  onPoseEntered?: (event: PoseEnteredEvent) => void;
  onPoseExited?: (event: PoseExitedEvent) => void;
  onExercisePhase?: (event: ExercisePhaseEvent) => void;
  onRep?: (event: RepEvent) => void;
  onRepRejected?: (event: RepRejectedEvent) => void;
  onTargetHit?: (event: TargetHitEvent) => void;
  onZoneEntered?: (event: ZoneEvent) => void;
  onZoneExited?: (event: ZoneEvent) => void;
  onPerformanceChange?: (event: PerformanceChangeEvent) => void;
  /** About once a second. */
  onStats?: (stats: BodyVisionStats) => void;
  onLandmarks?: (event: LandmarksEvent) => void;
  onError?: (error: BodyVisionError) => void;
  onReadiness?: (event: ReadinessEvent) => void;
  onSetupChange?: (state: SetupState) => void;
  onSetupComplete?: (calibration: CalibrationResult | null) => void;
  onVideoEnd?: () => void;

  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}

export interface BodySetupOptions extends SetupSessionOptions {
  /** Default `fullBody`. */
  framing?: Framing;
  /** Readiness thresholds for the `position` step. */
  readiness?: Omit<ReadinessOptions, 'framing'>;
  /** Speak prompts through expo-speech (optional peer). `true` or voice options. Default false. */
  voice?: boolean | VoiceOptions;
  /** Your own text-to-speech. Takes precedence over `voice`. */
  speak?: (text: string) => void;
  /** Text per prompt, merged over `DEFAULT_SETUP_PROMPTS` (English). */
  prompts?: Partial<Record<SetupPrompt, string>>;
}

export interface BodyVisionViewRef {
  /** Stand still, fully in view, for `durationMs` (default 2000). */
  calibrate(options?: { durationMs?: number }): Promise<CalibrationResult>;
  /** Zeroes one exercise's count, or all of them. */
  resetExercise(id?: string): Promise<void>;
  /** Starts the guided setup over. */
  restartSetup(): void;
}

const HANDLERS: Record<string, keyof BodyVisionViewProps> = {
  cameraReady: 'onCameraReady',
  bodyDetected: 'onBodyDetected',
  bodyLost: 'onBodyLost',
  poseEntered: 'onPoseEntered',
  poseExited: 'onPoseExited',
  exercisePhase: 'onExercisePhase',
  repCompleted: 'onRep',
  repRejected: 'onRepRejected',
  targetHit: 'onTargetHit',
  zoneEntered: 'onZoneEntered',
  zoneExited: 'onZoneExited',
  performanceChanged: 'onPerformanceChange',
  stats: 'onStats',
  landmarks: 'onLandmarks',
  videoEnded: 'onVideoEnd',
};

function color(value: ColorValue | undefined, path: string): number | undefined {
  if (value === undefined) return undefined;
  const processed = processColor(value);
  if (typeof processed !== 'number') {
    throw new BodyVisionError('INVALID_CONFIG', `unsupported color ${String(value)}`, path);
  }
  return processed;
}

function withColors<T extends object>(style: T | undefined, keys: string[], path: string) {
  if (!style) return undefined;
  const out: Record<string, unknown> = { ...(style as Record<string, unknown>) };
  for (const key of keys) {
    if (key in out) out[key] = color(out[key] as ColorValue, `${path}.${key}`);
  }
  return out;
}

function nativeSkeleton(skeleton: SkeletonStyle | false | undefined): Record<string, unknown> {
  if (skeleton === false) return { visible: false };
  if (!skeleton) return {};
  const out = withColors(skeleton, ['boneColor', 'jointColor'], 'skeleton')!;
  const mapEach = (group: 'bones' | 'joints') => {
    const entries = skeleton[group];
    if (!entries) return undefined;
    return Object.fromEntries(
      Object.entries(entries).map(([k, v]) => [
        k,
        withColors(v, ['color'], `skeleton.${group}.${k}`),
      ])
    );
  };
  if (skeleton.bones) out.bones = mapEach('bones');
  if (skeleton.joints) out.joints = mapEach('joints');
  if (skeleton.trails) {
    out.trails = skeleton.trails.map((t, i) => withColors(t, ['color'], `skeleton.trails[${i}]`));
  }
  return out;
}

function nativeRules(rules: BodyVisionViewProps['rules']): unknown[] {
  return (rules ?? []).map((rule, i) => {
    const path = `rules[${i}]`;
    if (rule.type === 'target') {
      validateTarget(rule, path);
      return rule.style
        ? { ...rule, style: withColors(rule.style, ['color', 'hitColor'], `${path}.style`) }
        : rule;
    }
    validateRule(rule, path);
    return rule;
  });
}

type Built<T> = { value: T; error: null } | { value: null; error: BodyVisionError };

function build<T>(fn: () => T): Built<T> {
  try {
    return { value: fn(), error: null };
  } catch (e) {
    const error =
      e instanceof BodyVisionError ? e : new BodyVisionError('INVALID_CONFIG', String(e));
    return { value: null, error };
  }
}

/**
 * Camera preview with native pose tracking, rules and skeleton rendering. Frames and per-frame
 * body data never cross into JS. The props describe what to do and callbacks receive results.
 */
export const BodyVisionView = forwardRef<BodyVisionViewRef, BodyVisionViewProps>(
  function BodyVisionView(props, ref) {
    const {
      facing = 'front',
      active = true,
      resizeMode = 'cover',
      performance = 'auto',
      smoothing,
      prediction,
      tracking,
      rules,
      skeleton,
      landmarks,
      debug = false,
      testInput = null,
      experimentalDelegate,
      setup,
      backend,
      model,
      videoLoop = false,
    } = props;
    const setupOptions: BodySetupOptions | null = setup ? (setup === true ? {} : setup) : null;
    const readinessOption: boolean | ReadinessOptions | undefined = setupOptions
      ? { ...setupOptions.readiness, framing: setupOptions.framing ?? 'fullBody' }
      : props.readiness;
    // Pose steps are ordinary native pose rules under reserved ids.
    const setupRules = setupOptions
      ? resolveSteps(setupOptions).flatMap((step, i) =>
          typeof step === 'object' && 'pose' in step ? [{ ...step.pose, id: setupPoseId(i) }] : []
        )
      : [];

    const native = useRef<NativeBodyVisionRef | null>(null);
    const latest = useRef(props);
    useEffect(() => {
      latest.current = props;
    });
    const resolvedModel = useResolvedModel(model, latest);
    const videoUri = useResolvedVideo(props.video, latest);
    const video = useMemo(
      () => (videoUri ? { uri: videoUri, loop: videoLoop } : null),
      [videoUri, videoLoop]
    );
    const calibration = useRef<{
      resolve: (r: CalibrationResult) => void;
      reject: (e: BodyVisionError) => void;
    } | null>(null);
    const [stats, setStats] = useState<BodyVisionStats | null>(null);

    // Keyed on the serialized value so inline objects don't resend props every render.
    const configKey = JSON.stringify({
      smoothing,
      prediction,
      tracking,
      performance,
      rules: [...(rules ?? []), ...setupRules],
      delegate: experimentalDelegate,
      readiness: readinessOption || undefined,
      calibration: props.calibration?.torsoLength,
      backend,
      model: resolvedModel,
    });
    const config = useMemo(
      () =>
        build<NativeEngineConfig>(() => {
          const parsed = JSON.parse(configKey) as NativeEngineConfig &
            Pick<BodyVisionViewProps, 'rules'>;
          return { ...parsed, rules: nativeRules(parsed.rules) };
        }),
      [configKey]
    );
    const skeletonKey = JSON.stringify(skeleton ?? null);
    const nativeSkeletonStyle = useMemo(
      () => build(() => nativeSkeleton(JSON.parse(skeletonKey) ?? undefined)),
      [skeletonKey]
    );
    const configError = config.error ?? nativeSkeletonStyle.error;

    useEffect(() => {
      if (configError) latest.current.onError?.(configError);
    }, [configError]);

    const wantsStats = debug || !!props.onStats;
    const landmarkInterval =
      typeof landmarks === 'object' ? (landmarks.intervalMs ?? 100) : landmarks ? 100 : 0;
    const telemetry = useMemo(
      () => ({
        stats: wantsStats,
        landmarks: landmarkInterval > 0,
        landmarksIntervalMs: landmarkInterval,
      }),
      [wantsStats, landmarkInterval]
    );

    useEffect(
      () => () => {
        calibration.current?.reject(new BodyVisionError('NOT_MOUNTED', 'The view was unmounted.'));
        calibration.current = null;
      },
      []
    );

    const startCalibration = useCallback((durationMs: number) => {
      const view = native.current;
      if (!view) {
        return Promise.reject(new BodyVisionError('NOT_MOUNTED', 'The view is not mounted.'));
      }
      calibration.current?.reject(
        new BodyVisionError('CALIBRATION_FAILED', 'Superseded by a new calibration.')
      );
      return new Promise<CalibrationResult>((resolve, reject) => {
        calibration.current = { resolve, reject };
        view.startCalibration(durationMs).catch((error: unknown) => {
          calibration.current = null;
          reject(error);
        });
      });
    }, []);

    const setupContext = useSetupSession(setupOptions, startCalibration, latest);

    const listeners = useRef(new Set<(event: BodyVisionEvent) => void>());
    const subscribe = useCallback((listener: (event: BodyVisionEvent) => void) => {
      listeners.current.add(listener);
      return () => {
        listeners.current.delete(listener);
      };
    }, []);

    const dispatch = useCallback(
      (event: NativeEvent) => {
        const p = latest.current;
        const setupPose =
          (event.type === 'poseEntered' || event.type === 'poseExited') &&
          isSetupPoseId(String(event.pose));
        if (!setupPose) for (const listener of listeners.current) listener(event);
        switch (event.type) {
          case 'readiness':
            setupContext.session?.readiness(event as unknown as ReadinessEvent);
            p.onReadiness?.(event as unknown as ReadinessEvent);
            return;
          case 'poseEntered':
          case 'poseExited':
            if (isSetupPoseId(String(event.pose))) {
              if (event.type === 'poseEntered')
                setupContext.session?.poseEntered(String(event.pose));
              return;
            }
            break;
          case 'error':
            p.onError?.(new BodyVisionError(event.code as never, String(event.message)));
            return;
          case 'calibrationCompleted':
            calibration.current?.resolve(event.measurements as CalibrationResult);
            calibration.current = null;
            return;
          case 'calibrationFailed':
            calibration.current?.reject(
              new BodyVisionError('CALIBRATION_FAILED', String(event.reason))
            );
            calibration.current = null;
            return;
          case 'stats':
            if (p.debug) setStats(event as unknown as BodyVisionStats);
            break;
        }
        const handler = HANDLERS[event.type];
        const fn = handler ? (p[handler] as ((e: unknown) => void) | undefined) : undefined;
        fn?.(event);
      },
      [setupContext.session]
    );

    const onEvents = useCallback(
      (e: { nativeEvent: NativeEventBatch }) => {
        const batch = e.nativeEvent;
        try {
          for (const event of batch.events) {
            try {
              dispatch(event);
            } catch (error) {
              // A throwing handler must not stall delivery of the rest.
              setTimeout(() => {
                throw error;
              });
            }
          }
        } finally {
          native.current?.acknowledge(batch.sequence).catch(() => {});
        }
      },
      [dispatch]
    );

    useImperativeHandle(
      ref,
      () => ({
        calibrate({ durationMs = 2000 } = {}) {
          return startCalibration(durationMs);
        },
        resetExercise(id?: string) {
          const view = native.current;
          if (!view) {
            return Promise.reject(new BodyVisionError('NOT_MOUNTED', 'The view is not mounted.'));
          }
          return view.resetExercise(id ?? null);
        },
        restartSetup() {
          setupContext.value?.restart();
        },
      }),
      [startCalibration, setupContext.value]
    );

    return (
      <View style={[styles.container, props.style]} testID={props.testID}>
        <NativeBodyVisionView
          ref={native}
          style={StyleSheet.absoluteFill}
          facing={facing}
          active={active}
          resizeMode={resizeMode}
          config={config.value ?? { performance }}
          skeleton={nativeSkeletonStyle.value ?? {}}
          telemetry={telemetry}
          testInput={testInput}
          video={video}
          onEvents={onEvents}
        />
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <BodyEventsContext.Provider value={subscribe}>
            <BodySetupContext.Provider value={setupContext.value}>
              {props.children}
            </BodySetupContext.Provider>
          </BodyEventsContext.Provider>
        </View>
        {debug ? <DebugPanel stats={stats} error={configError} /> : null}
      </View>
    );
  }
);

/**
 * Resolves `model` to what native loads. Returns 'pending' while a bundled file is copied out,
 * which pauses inference instead of briefly running the default model.
 */
function useResolvedModel(
  model: PoseModelSource | undefined,
  latest: { current: BodyVisionViewProps }
) {
  const key = JSON.stringify(model ?? null);
  const [resolved, setResolved] = useState<{ key: string; value: string | undefined } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const source = JSON.parse(key) as PoseModelSource | null;
    resolveModel(source ?? undefined).then(
      (value) => !cancelled && setResolved({ key, value }),
      (error: unknown) => {
        if (cancelled) return;
        latest.current.onError?.(
          error instanceof BodyVisionError
            ? error
            : new BodyVisionError('MODEL_LOAD_FAILED', String(error))
        );
      }
    );
    return () => {
      cancelled = true;
    };
  }, [key, latest]);
  if (model === undefined || typeof model === 'string') return model;
  return resolved?.key === key ? resolved.value : 'pending';
}

/** The video's URI, 'pending' while a bundled one is copied out (keeps the camera off). */
function useResolvedVideo(
  video: VideoSource | null | undefined,
  latest: { current: BodyVisionViewProps }
) {
  const asset = typeof video === 'number' ? video : null;
  const [resolved, setResolved] = useState<{ asset: number; uri: string } | null>(null);
  useEffect(() => {
    if (asset === null) return;
    let cancelled = false;
    resolveAsset(asset).then(
      (uri) => !cancelled && setResolved({ asset, uri }),
      (error: unknown) => {
        if (cancelled) return;
        latest.current.onError?.(
          error instanceof BodyVisionError
            ? error
            : new BodyVisionError('VIDEO_READ_FAILED', String(error))
        );
      }
    );
    return () => {
      cancelled = true;
    };
  }, [asset, latest]);
  if (video === null || video === undefined) return null;
  if (typeof video === 'string') return video;
  if (typeof video === 'object') return video.uri;
  return resolved?.asset === asset ? resolved.uri : 'pending';
}

/**
 * Runs the setup session while `options` is set. Voice prompts wait `SPEECH_DELAY_MS` so a
 * state that flickers past isn't spoken.
 */
function useSetupSession(
  options: BodySetupOptions | null,
  calibrate: (durationMs: number) => Promise<CalibrationResult>,
  latest: { current: BodyVisionViewProps }
): { session: SetupSession | null; value: BodySetupContextValue | null } {
  const enabled = options !== null;
  const optionsKey = JSON.stringify(options ?? null);
  const [entry, setEntry] = useState<{ session: SetupSession; state: SetupState } | null>(null);
  const session = useMemo(() => {
    if (!enabled) return null;
    const o = JSON.parse(optionsKey) as BodySetupOptions;
    const created: SetupSession = new SetupSession(o, calibrate, (next) => {
      setEntry({ session: created, state: next });
      latest.current.onSetupChange?.(next);
      if (next.phase === 'done') latest.current.onSetupComplete?.(next.calibration);
    });
    return created;
  }, [enabled, optionsKey, calibrate, latest]);
  useEffect(() => () => session?.dispose(), [session]);
  // A new session starts from the initial state without a reset render.
  const state = entry && entry.session === session ? entry.state : INITIAL_SETUP_STATE;

  const voiceKey = JSON.stringify(options?.voice ?? false);
  const speaker = useMemo(() => {
    const voice = JSON.parse(voiceKey) as BodySetupOptions['voice'];
    return voice ? createSpeaker(voice === true ? {} : voice) : null;
  }, [voiceKey]);
  useEffect(() => () => speaker?.stop(), [speaker]);

  const text =
    state.text ?? options?.prompts?.[state.prompt] ?? DEFAULT_SETUP_PROMPTS[state.prompt];
  const say = options?.speak ?? speaker?.speak;
  const lastSpoken = useRef<string | null>(null);
  useEffect(() => {
    if (!session || !say || text === lastSpoken.current) return;
    const timer = setTimeout(() => {
      lastSpoken.current = text;
      say(text);
    }, SPEECH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [session, say, text]);

  const framing = options?.framing ?? 'fullBody';
  const value = useMemo<BodySetupContextValue | null>(
    () =>
      session
        ? {
            state,
            text,
            framing,
            restart: () => {
              lastSpoken.current = null;
              session.restart();
            },
          }
        : null,
    [session, state, text, framing]
  );
  return { session, value };
}

const SPEECH_DELAY_MS = 350;

function DebugPanel({
  stats,
  error,
}: {
  stats: BodyVisionStats | null;
  error: BodyVisionError | null;
}) {
  const lines = stats
    ? [
        `${stats.backend}/${stats.delegate}  ${stats.performanceMode}  thermal ${stats.thermalLevel}`,
        `camera ${stats.cameraFps.toFixed(0)} fps  dropped ${stats.droppedFrames}`,
        `inference ${stats.inferenceFps.toFixed(0)}/${stats.targetInferenceFps.toFixed(0)} fps  ${stats.inferenceMs.toFixed(1)} ms`,
        `render ${stats.renderFps.toFixed(0)} fps  p95 ${stats.frameIntervalP95Ms.toFixed(1)} ms`,
        `latency ${stats.latencyMs.toFixed(0)} ms  body ${stats.bodyVisible ? 'yes' : 'no'}`,
      ]
    : ['waiting for stats'];
  if (error) lines.push(`${error.code}: ${error.message}`);
  return (
    <View style={styles.debug} pointerEvents="none" testID="body-vision-debug">
      {lines.map((line) => (
        <Text key={line} style={styles.debugText}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: 'black' },
  debug: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  debugText: {
    color: '#9EF0C8',
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
});
