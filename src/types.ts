import type { ColorValue } from 'react-native';

import type { BodyVisionErrorCode } from './errors';
import type { BoneName, JointName } from './joints';

export type CameraFacing = 'front' | 'back';
export type ResizeMode = 'cover' | 'contain';

/**
 * `auto` adapts the inference rate to measured latency and thermal state. The fixed modes hold
 * 15, 24 or 30 inferences per second. `accuracy` also uses the larger pose model.
 */
export type PerformanceMode = 'auto' | 'performance' | 'balanced' | 'accuracy';

/** `light` suits fast movement like boxing, `stable` suits held poses. */
export type SmoothingPreset = 'none' | 'light' | 'balanced' | 'stable';

/** One Euro filter parameters, in normalized image units per second. */
export interface SmoothingOptions {
  minCutoff?: number;
  beta?: number;
  derivativeCutoff?: number;
}

export interface PredictionOptions {
  enabled?: boolean;
  /** Longest extrapolation past the last inference. Default 100. */
  maxMs?: number;
}

export interface TrackingOptions {
  /** Joints below this are ignored. Default 0.3. */
  minJointConfidence?: number;
  /** A missing joint is hidden after this long. Default 250. */
  jointHoldMs?: number;
  /** `bodyLost` after the body is gone this long. Default 500. */
  lostAfterMs?: number;
}

export interface BoneStyle {
  visible?: boolean;
  color?: ColorValue;
  width?: number;
}

export interface JointStyle {
  visible?: boolean;
  color?: ColorValue;
  radius?: number;
}

export interface TrailStyle {
  joint: JointName;
  /** Default 350. */
  lengthMs?: number;
  color?: ColorValue;
  width?: number;
}

export interface SkeletonStyle {
  visible?: boolean;
  boneColor?: ColorValue;
  boneWidth?: number;
  jointColor?: ColorValue;
  jointRadius?: number;
  showJoints?: boolean;
  /** Bones and joints under this confidence aren't drawn. Default 0.5. */
  minConfidence?: number;
  /** Fade with confidence above `minConfidence`. Default true. */
  fadeWithConfidence?: boolean;
  bones?: Partial<Record<BoneName, BoneStyle>>;
  joints?: Partial<Record<JointName, JointStyle>>;
  trails?: TrailStyle[];
}

export interface TargetStyle {
  color?: ColorValue;
  hitColor?: ColorValue;
  lineWidth?: number;
  filled?: boolean;
  visible?: boolean;
  /** Particles in the hit burst. Halved when `auto` performance reduces effects. Default 12. */
  particles?: number;
  effectDurationMs?: number;
}

/** A body interaction area, hit-tested natively. */
export interface TargetDefinition {
  type: 'target';
  id: string;
  /** Center as a fraction of the view width. */
  x: number;
  /** Center as a fraction of the view height. */
  y: number;
  /** Fraction of the view's shorter side. Default 0.08. */
  radius?: number;
  /** Default both wrists. */
  colliders?: JointName[];
  /** Fraction of the view's shorter side. Default 0.03. */
  colliderRadius?: number;
  /** Minimum collider speed in view short-sides per second. Default 0. */
  minSpeed?: number;
  /** Default 500. */
  cooldownMs?: number;
  /** `hit` fires once per arrival, `zone` fires enter and exit. Default `hit`. */
  mode?: 'hit' | 'zone';
  minConfidence?: number;
  style?: TargetStyle;
}

export interface BodyEventBase {
  /** Milliseconds on the native monotonic clock of the sample that caused the event. */
  timestamp: number;
}

export interface BodyDetectedEvent extends BodyEventBase {
  bodyId: number;
}

export type BodyLostEvent = BodyDetectedEvent;

export interface PoseEnteredEvent extends BodyEventBase {
  pose: string;
  bodyId: number;
}

export interface PoseExitedEvent extends PoseEnteredEvent {
  durationMs: number;
}

export type ExercisePhase = 'ready' | 'top' | 'descending' | 'bottom' | 'ascending';

export interface ExercisePhaseEvent extends BodyEventBase {
  exercise: string;
  phase: ExercisePhase;
}

export interface RepEvent extends BodyEventBase {
  exercise: string;
  bodyId: number;
  count: number;
  durationMs: number;
  /** Peak mode with a mirrored metric: which side's movement it was. */
  side?: 'left' | 'right';
  /** Peak mode: the joint that moved, and where it was in view points when it counted. */
  joint?: JointName;
  x?: number;
  y?: number;
}

export type RepRejectionReason = 'incomplete' | 'too-fast' | 'too-slow' | 'form' | 'lost';

export interface RepRejectedEvent extends BodyEventBase {
  exercise: string;
  reason: RepRejectionReason;
}

export interface TargetHitEvent extends BodyEventBase {
  target: string;
  joint: JointName;
  bodyId: number;
  /** View short-sides per second. */
  speed: number;
  /** Target center in view points. */
  x: number;
  y: number;
}

export interface ZoneEvent extends BodyEventBase {
  target: string;
  joint: JointName;
}

/** Lengths in camera-image heights. */
export interface CalibrationResult {
  torsoLength: number;
  shoulderWidth?: number;
  armLength?: number;
  legLength?: number;
  height?: number;
}

export interface PerformanceChangeEvent extends BodyEventBase {
  mode: PerformanceMode;
  inferenceFps: number;
  reducedEffects: boolean;
  thermalLevel: number;
}

/** Measured natively over the last second. */
export interface BodyVisionStats extends BodyEventBase {
  cameraFps: number;
  inferenceFps: number;
  targetInferenceFps: number;
  /** Mean inference time. */
  inferenceMs: number;
  renderFps: number;
  /** 95th percentile interval between rendered frames. */
  frameIntervalP95Ms: number;
  /** Camera frames skipped because inference was busy or throttled. */
  droppedFrames: number;
  /** Capture to display time of the drawn body. */
  latencyMs: number;
  backend: string;
  delegate: string;
  performanceMode: PerformanceMode;
  thermalLevel: number;
  bodyVisible: boolean;
}

export interface LandmarksEvent extends BodyEventBase {
  bodyId: number;
  /** x, y in view points and confidence for each joint, in `JOINTS` order. */
  points: number[];
}

export interface CameraReadyEvent extends BodyEventBase {
  width: number;
  height: number;
  backend: string;
  delegate: string;
  /** The camera has a torch. False for video and test input. */
  hasTorch: boolean;
}

export interface BodyVisionErrorEvent extends BodyEventBase {
  code: BodyVisionErrorCode;
  message: string;
}

/** `floor` is side-on on the floor (push-ups, planks) and wants a landscape view. */
export type Framing = 'fullBody' | 'upperBody' | 'floor';

export interface ReadinessOptions {
  /** `fullBody` needs head to ankles in view, `upperBody` head to hips, `floor` a side-on body
   * lying horizontally. Default `fullBody`. */
  framing?: Framing;
  /** Nose to ankles (or hips) as a fraction of view height. Default 0.45 full body, 0.3 upper. */
  minBodyHeight?: number;
  /** Allowed offset of the body's center from the view's center, fraction of width. Default 0.18. */
  centerTolerance?: number;
  /** Joint speed in view short-sides per second that still counts as still. Default 0.25. */
  stillSpeed?: number;
}

/** What stands between the user and a good tracking position, most important first. */
export type ReadinessIssue =
  | 'rotateToLandscape'
  | 'noBody'
  | 'getIntoPosition'
  | 'tooClose'
  | 'feetHidden'
  | 'headHidden'
  | 'handsHidden'
  | 'tooFar'
  | 'moveLeft'
  | 'moveRight'
  | 'lowVisibility'
  | 'moving';

/** Sent only when the settled state changes. */
export interface ReadinessEvent extends BodyEventBase {
  status: 'noBody' | 'adjusting' | 'ready';
  /** null when ready. `moveLeft`/`moveRight` are screen directions. */
  issue: ReadinessIssue | null;
  /** Whether the preview is mirrored, which decides how screen directions read to the user. */
  mirrored: boolean;
}

/** Recorded body frames that replace the camera (see `parseBodySequence`). */
export interface ReplayInput {
  /** Rows of `timeMs, present, x, y, confidence` per joint, flattened. */
  frames: number[];
  /** Width / height of the recorded image. */
  aspect: number;
  loop?: boolean;
}

export interface Capabilities {
  platform: 'ios' | 'android' | 'web';
  /** The default backend. */
  backend: string;
  /** Every registered backend, including native ones registered by the app. */
  backends: string[];
  joints: number;
  maxBodies: number;
  testInput: boolean;
}
