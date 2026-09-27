import type { PoseDefinition } from '../rules';
import type { CalibrationResult, ReadinessEvent } from '../types';
import { promptForReadiness, type SetupPrompt } from './prompts';

/**
 * One step of the guided setup, run in order:
 * - `position`: wait until readiness reports the user in position for `holdMs`
 * - `{ pose }`: wait until the pose rule holds (evaluated natively like any pose)
 * - `calibrate`: measure body proportions
 * - `{ countdown }`: count down whole seconds
 */
export type SetupStep =
  | 'position'
  | 'calibrate'
  | { pose: PoseDefinition; prompt?: string }
  | { countdown: number; prompt?: string };

export type SetupStepKind = 'position' | 'pose' | 'calibrate' | 'countdown';

export type SetupPhase =
  'positioning' | 'holding' | 'posing' | 'calibrating' | 'countdown' | 'done';

export interface SetupState {
  phase: SetupPhase;
  prompt: SetupPrompt;
  /** Replaces the prompt's text: a step's own `prompt`, or the countdown number. */
  text: string | null;
  /** 0..1 through the current hold, calibration or countdown. */
  progress: number;
  /** Which way the body should move on screen, for arrows. */
  screenDirection: 'left' | 'right' | null;
  calibration: CalibrationResult | null;
  /** Index into `steps`. Equals `stepCount` when done. */
  step: number;
  stepCount: number;
  stepKind: SetupStepKind | null;
  /** Whole seconds left in a countdown step. */
  countdown: number | null;
}

export interface SetupSessionOptions {
  /** Default `['position', 'calibrate']`, or `['position']` with `calibrate: false`. */
  steps?: SetupStep[];
  /** How long the user must stay in position before the next step. Default 1200. */
  holdMs?: number;
  /** Only used when `steps` isn't given. Default true. */
  calibrate?: boolean;
  calibrationMs?: number;
}

export const INITIAL_SETUP_STATE: SetupState = {
  phase: 'positioning',
  prompt: 'noBody',
  text: null,
  progress: 0,
  screenDirection: null,
  calibration: null,
  step: 0,
  stepCount: 2,
  stepKind: 'position',
  countdown: null,
};

/** Pose rules of `pose` steps are sent to native under these ids. */
export function setupPoseId(step: number): string {
  return `__setup_${step}`;
}

export function isSetupPoseId(id: string): boolean {
  return id.startsWith('__setup_');
}

export function resolveSteps(options: SetupSessionOptions): SetupStep[] {
  return options.steps ?? (options.calibrate === false ? ['position'] : ['position', 'calibrate']);
}

function kindOf(step: SetupStep): SetupStepKind {
  if (typeof step === 'string') return step;
  return 'pose' in step ? 'pose' : 'countdown';
}

/**
 * Runs the steps in order. Driven by readiness and pose events, which native sends only when
 * something settles, plus a timer. Nothing per frame. Losing the body in a later step, or a failed
 * calibration, starts over from the first step.
 */
export class SetupSession {
  state: SetupState;
  private readonly steps: SetupStep[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private stepStarted = 0;
  private ready = false;
  private disposed = false;

  constructor(
    private options: SetupSessionOptions,
    private calibrate: (durationMs: number) => Promise<CalibrationResult>,
    private onChange: (state: SetupState) => void,
    private now: () => number = Date.now
  ) {
    this.steps = resolveSteps(options);
    this.state = this.initialState();
  }

  readiness(event: ReadinessEvent): void {
    this.ready = event.issue === null;
    const { phase } = this.state;
    if (phase === 'done' || phase === 'calibrating') return;
    if (this.state.stepKind !== 'position') {
      // Poses and countdowns involve moving, so only leaving the frame interrupts them.
      if (event.issue === 'noBody') this.startOver('noBody');
      return;
    }
    const screenDirection =
      event.issue === 'moveLeft' ? 'left' : event.issue === 'moveRight' ? 'right' : null;
    if (event.issue !== null) {
      this.stopTimer();
      this.set({
        phase: 'positioning',
        prompt: promptForReadiness(event),
        progress: 0,
        screenDirection,
      });
      return;
    }
    if (phase !== 'holding') this.startHold();
  }

  poseEntered(id: string): void {
    if (this.state.stepKind === 'pose' && id === setupPoseId(this.state.step)) {
      this.enter(this.state.step + 1);
    }
  }

  restart(): void {
    this.stopTimer();
    this.set(this.initialState());
    if (this.ready) this.startHold();
  }

  dispose(): void {
    this.disposed = true;
    this.stopTimer();
  }

  private initialState(): SetupState {
    return { ...INITIAL_SETUP_STATE, stepCount: this.steps.length, stepKind: this.kindAt(0) };
  }

  private kindAt(i: number): SetupStepKind | null {
    return i < this.steps.length ? kindOf(this.steps[i]) : null;
  }

  private startOver(prompt: SetupPrompt): void {
    this.stopTimer();
    this.set({ ...this.initialState(), prompt, calibration: this.state.calibration });
  }

  private startHold(): void {
    this.stopTimer();
    this.stepStarted = this.now();
    this.set({ phase: 'holding', prompt: 'holdPosition', progress: 0, screenDirection: null });
    this.timer = setInterval(() => {
      const progress = Math.min(1, (this.now() - this.stepStarted) / (this.options.holdMs ?? 1200));
      if (progress < 1) {
        this.set({ progress });
        return;
      }
      this.enter(this.state.step + 1);
    }, 100);
  }

  private enter(index: number): void {
    this.stopTimer();
    const base = {
      step: index,
      stepKind: this.kindAt(index),
      text: null,
      progress: 0,
      screenDirection: null,
      countdown: null,
    };
    if (index >= this.steps.length) {
      this.set({ ...base, step: this.steps.length, phase: 'done', prompt: 'done', progress: 1 });
      return;
    }
    const step = this.steps[index];
    if (step === 'position') {
      this.set({ ...base, phase: 'positioning', prompt: 'noBody' });
      if (this.ready) this.startHold();
      return;
    }
    if (step === 'calibrate') {
      this.set({ ...base, phase: 'calibrating', prompt: 'calibrating' });
      const durationMs = this.options.calibrationMs ?? 2000;
      this.stepStarted = this.now();
      this.timer = setInterval(() => {
        this.set({ progress: Math.min(1, (this.now() - this.stepStarted) / durationMs) });
      }, 100);
      this.calibrate(durationMs).then(
        (calibration) => {
          if (this.state.step !== index) return;
          this.set({ calibration });
          this.enter(index + 1);
        },
        () => {
          if (this.state.step === index) this.startOver('calibrationFailed');
        }
      );
      return;
    }
    if ('pose' in step) {
      this.set({ ...base, phase: 'posing', prompt: 'holdPose', text: step.prompt ?? null });
      return;
    }
    const seconds = Math.max(1, Math.round(step.countdown));
    this.stepStarted = this.now();
    this.set({
      ...base,
      phase: 'countdown',
      prompt: 'countdown',
      text: step.prompt ?? String(seconds),
      countdown: seconds,
    });
    this.timer = setInterval(() => {
      const elapsed = (this.now() - this.stepStarted) / 1000;
      const left = Math.ceil(seconds - elapsed);
      if (left <= 0) {
        this.enter(index + 1);
        return;
      }
      if (left !== this.state.countdown) {
        this.set({ countdown: left, text: step.prompt ?? String(left) });
      }
      this.set({ progress: Math.min(1, elapsed / seconds) });
    }, 100);
  }

  private set(patch: Partial<SetupState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
