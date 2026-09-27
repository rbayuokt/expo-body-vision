import { BodyVisionError } from './errors';
import { isJointName, type JointName } from './joints';

export type MetricKind = 'angle' | 'inclination' | 'distance' | 'above';

/** A measurement, serialized as sent to native. */
export interface MetricDefinition {
  kind: MetricKind;
  joints: JointName[];
  /** Also measure the left/right-swapped joints and use the better tracked side. */
  mirror?: boolean;
}

export interface ConditionDefinition extends MetricDefinition {
  min?: number;
  max?: number;
  /** Slack added to the range while the rule is active. Default 8 degrees or 0.1 body units. */
  hysteresis?: number;
}

export interface PoseDefinition {
  type: 'pose';
  id: string;
  conditions: ConditionDefinition[];
  /** How long all conditions must hold before `poseEntered`. Default 300. */
  holdMs?: number;
  /** How long they may fail before `poseExited`. Default 150. */
  exitGraceMs?: number;
  /** Joints below this confidence make a condition unknown. Default 0.5. */
  minConfidence?: number;
}

export interface ExerciseDefinition {
  type: 'exercise';
  id: string;
  /** Large at the top of the movement, small at the bottom, e.g. elbow angle for push-ups. */
  metric: MetricDefinition;
  /**
   * `cycle` (default) counts top, down to bottom and back to top. `peak` counts each rise of at
   * least `top - bottom` that reaches `top`, for strikes too fast for a full cycle to be seen. In
   * peak mode a mirrored metric watches both sides at once and `minRepMs` merges near peaks.
   */
  mode?: 'cycle' | 'peak';
  top: number;
  bottom: number;
  /** Default 10. */
  hysteresis?: number;
  /** Faster reps are rejected as `too-fast`. Default 400. */
  minRepMs?: number;
  /** Slower reps are rejected as `too-slow`. Default 8000. */
  maxRepMs?: number;
  /** How long the metric may be untracked before an in-progress rep is dropped. Default 400. */
  lossGraceMs?: number;
  minConfidence?: number;
  /** Form checks. A rep in progress is rejected as `form` when one fails. */
  requires?: ConditionDefinition[];
}

export type RuleDefinition = PoseDefinition | ExerciseDefinition;

const JOINT_COUNT: Record<MetricKind, number> = { angle: 3, inclination: 2, distance: 2, above: 2 };

/**
 * Chainable measurement. `angle(...)` alone is a metric (for exercises). Add a range to make it
 * a condition: `angle('leftShoulder', 'leftElbow', 'leftWrist').atLeast(150)`.
 */
export class Measure implements MetricDefinition {
  readonly kind: MetricKind;
  readonly joints: JointName[];
  mirror?: boolean;

  constructor(kind: MetricKind, joints: JointName[], mirror?: boolean) {
    this.kind = kind;
    this.joints = joints;
    if (mirror) this.mirror = true;
  }

  mirrored(): Measure {
    return new Measure(this.kind, this.joints, true);
  }

  between(min: number, max: number, hysteresis?: number): ConditionDefinition {
    return this.range(min, max, hysteresis);
  }

  atLeast(min: number, hysteresis?: number): ConditionDefinition {
    return this.range(min, undefined, hysteresis);
  }

  atMost(max: number, hysteresis?: number): ConditionDefinition {
    return this.range(undefined, max, hysteresis);
  }

  toJSON(): MetricDefinition {
    return this.mirror
      ? { kind: this.kind, joints: [...this.joints], mirror: true }
      : { kind: this.kind, joints: [...this.joints] };
  }

  private range(min?: number, max?: number, hysteresis?: number): ConditionDefinition {
    const c: ConditionDefinition = this.toJSON();
    if (min !== undefined) c.min = min;
    if (max !== undefined) c.max = max;
    if (hysteresis !== undefined) c.hysteresis = hysteresis;
    return c;
  }
}

/** Interior angle at `b` in degrees, 0..180. */
export function angle(a: JointName, b: JointName, c: JointName): Measure {
  return new Measure('angle', [a, b, c]);
}

/** Angle of the segment from horizontal in degrees, 0..90. */
export function inclination(a: JointName, b: JointName): Measure {
  return new Measure('inclination', [a, b]);
}

/** Distance in torso lengths (or the calibrated torso length). */
export function distance(a: JointName, b: JointName): Measure {
  return new Measure('distance', [a, b]);
}

/** How far `a` is above `b`, in torso lengths. Negative when below. */
export function above(a: JointName, b: JointName): Measure {
  return new Measure('above', [a, b]);
}

export function definePose(
  pose: Omit<PoseDefinition, 'type' | 'conditions'> & { when: ConditionDefinition[] }
): PoseDefinition {
  const { when, ...rest } = pose;
  const def: PoseDefinition = { type: 'pose', ...rest, conditions: when.map(plainCondition) };
  validateRule(def, 'pose');
  return def;
}

export function defineExercise(
  exercise: Omit<ExerciseDefinition, 'type' | 'metric'> & { metric: MetricDefinition }
): ExerciseDefinition {
  const def: ExerciseDefinition = {
    type: 'exercise',
    ...exercise,
    metric: plainMetric(exercise.metric),
  };
  if (exercise.requires) def.requires = exercise.requires.map(plainCondition);
  validateRule(def, 'exercise');
  return def;
}

function plainMetric(m: MetricDefinition): MetricDefinition {
  return m instanceof Measure ? m.toJSON() : m;
}

function plainCondition(c: ConditionDefinition): ConditionDefinition {
  return c instanceof Measure ? c.toJSON() : { ...c };
}

function fail(path: string, message: string): never {
  throw new BodyVisionError('INVALID_RULE', message, path);
}

function checkNumber(v: unknown, path: string, min = -Infinity, max = Infinity, required = false) {
  if (v === undefined && !required) return;
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'expected a finite number');
  if (v < min || v > max) fail(path, `must be between ${min} and ${max}`);
}

function checkMetric(m: MetricDefinition, path: string) {
  const count = JOINT_COUNT[m.kind];
  if (count === undefined) fail(`${path}.kind`, `unknown metric '${m.kind}'`);
  if (!Array.isArray(m.joints) || m.joints.length !== count) {
    fail(`${path}.joints`, `'${m.kind}' needs ${count} joints`);
  }
  m.joints.forEach((j, i) => {
    if (!isJointName(j)) fail(`${path}.joints[${i}]`, `unknown joint '${String(j)}'`);
  });
}

function checkCondition(c: ConditionDefinition, path: string) {
  checkMetric(c, path);
  if (c.min === undefined && c.max === undefined) fail(path, 'needs min or max');
  checkNumber(c.min, `${path}.min`);
  checkNumber(c.max, `${path}.max`);
  if (c.min !== undefined && c.max !== undefined && c.min > c.max) {
    fail(`${path}.min`, 'is greater than max');
  }
  checkNumber(c.hysteresis, `${path}.hysteresis`, 0);
}

/** Same checks native runs, so mistakes surface where the rule is written. */
export function validateRule(rule: RuleDefinition, path: string): void {
  if (typeof rule.id !== 'string' || !rule.id) fail(`${path}.id`, 'is required');
  checkNumber(rule.minConfidence, `${path}.minConfidence`, 0, 1);
  if (rule.type === 'pose') {
    if (!rule.conditions?.length) fail(`${path}.conditions`, 'needs at least one condition');
    rule.conditions.forEach((c, i) => checkCondition(c, `${path}.conditions[${i}]`));
    checkNumber(rule.holdMs, `${path}.holdMs`, 0, 60000);
    checkNumber(rule.exitGraceMs, `${path}.exitGraceMs`, 0, 60000);
    return;
  }
  checkMetric(rule.metric, `${path}.metric`);
  if (rule.mode !== undefined && rule.mode !== 'cycle' && rule.mode !== 'peak') {
    fail(`${path}.mode`, "expected 'cycle' or 'peak'");
  }
  checkNumber(rule.top, `${path}.top`, -Infinity, Infinity, true);
  checkNumber(rule.bottom, `${path}.bottom`, -Infinity, Infinity, true);
  if (rule.top <= rule.bottom) fail(`${path}.top`, 'must be greater than bottom');
  const h = rule.hysteresis ?? 10;
  checkNumber(rule.hysteresis, `${path}.hysteresis`, 0);
  if (rule.top - h <= rule.bottom + h) {
    fail(`${path}.hysteresis`, 'top - hysteresis must stay above bottom + hysteresis');
  }
  checkNumber(rule.minRepMs, `${path}.minRepMs`, 0, 600000);
  checkNumber(rule.maxRepMs, `${path}.maxRepMs`, 0, 600000);
  checkNumber(rule.lossGraceMs, `${path}.lossGraceMs`, 0, 60000);
  rule.requires?.forEach((c, i) => checkCondition(c, `${path}.requires[${i}]`));
}
