import {
  angle,
  defineExercise,
  definePose,
  inclination,
  type ExerciseDefinition,
  type PoseDefinition,
} from './rules';

type ExerciseOverrides = Partial<Omit<ExerciseDefinition, 'type' | 'metric'>>;
type PoseOverrides = Partial<Omit<PoseDefinition, 'type' | 'conditions'>>;

/** Side view works best. Counts on the elbow angle of the better tracked arm. */
export function pushUp(overrides: ExerciseOverrides = {}): ExerciseDefinition {
  return defineExercise({
    id: 'pushup',
    metric: angle('leftShoulder', 'leftElbow', 'leftWrist').mirrored(),
    top: 150,
    bottom: 100,
    hysteresis: 10,
    minRepMs: 500,
    maxRepMs: 8000,
    lossGraceMs: 400,
    minConfidence: 0.5,
    requires: [inclination('leftShoulder', 'leftAnkle').mirrored().atMost(40)],
    ...overrides,
  });
}

/** Side view works best. Counts on the knee angle of the better tracked leg. */
export function squat(overrides: ExerciseOverrides = {}): ExerciseDefinition {
  return defineExercise({
    id: 'squat',
    metric: angle('leftHip', 'leftKnee', 'leftAnkle').mirrored(),
    top: 160,
    bottom: 100,
    hysteresis: 10,
    minRepMs: 400,
    maxRepMs: 8000,
    lossGraceMs: 400,
    minConfidence: 0.5,
    requires: [inclination('leftShoulder', 'leftHip').mirrored().atLeast(35)],
    ...overrides,
  });
}

/**
 * Punches with either arm, counted on sharp elbow extensions (peak mode), so fast combos count
 * even when a punch is only a few frames long. Events carry the `side`. Tuned on real footage
 * where the far arm is often tracked with low confidence.
 */
export function punch(overrides: ExerciseOverrides = {}): ExerciseDefinition {
  return defineExercise({
    id: 'punch',
    metric: angle('leftShoulder', 'leftElbow', 'leftWrist').mirrored(),
    mode: 'peak',
    top: 110,
    bottom: 80,
    hysteresis: 10,
    minRepMs: 70,
    maxRepMs: 8000,
    lossGraceMs: 400,
    minConfidence: 0.2,
    ...overrides,
  });
}

/** Both arms straight and within 20 degrees of horizontal for half a second. */
export function tPose(overrides: PoseOverrides = {}): PoseDefinition {
  return definePose({
    id: 'tpose',
    holdMs: 500,
    exitGraceMs: 150,
    minConfidence: 0.5,
    when: [
      inclination('leftShoulder', 'leftWrist').atMost(20),
      inclination('rightShoulder', 'rightWrist').atMost(20),
      angle('leftShoulder', 'leftElbow', 'leftWrist').atLeast(150),
      angle('rightShoulder', 'rightElbow', 'rightWrist').atLeast(150),
    ],
    ...overrides,
  });
}

/** Both wrists above the head. */
export function armsUp(overrides: PoseOverrides = {}): PoseDefinition {
  return definePose({
    id: 'armsUp',
    holdMs: 300,
    when: [
      inclination('leftShoulder', 'leftWrist').atLeast(50),
      inclination('rightShoulder', 'rightWrist').atLeast(50),
      { kind: 'above', joints: ['leftWrist', 'nose'], min: 0.1 },
      { kind: 'above', joints: ['rightWrist', 'nose'], min: 0.1 },
    ],
    ...overrides,
  });
}
