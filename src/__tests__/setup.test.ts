import { tPose } from '../presets';
import { promptForReadiness } from '../setup/prompts';
import { SetupSession, setupPoseId, type SetupState, type SetupStep } from '../setup/session';
import type { CalibrationResult, ReadinessEvent } from '../types';

const event = (issue: ReadinessEvent['issue'], mirrored = true): ReadinessEvent =>
  ({
    type: 'readiness',
    timestamp: 0,
    status: issue === null ? 'ready' : issue === 'noBody' ? 'noBody' : 'adjusting',
    issue,
    mirrored,
  }) as ReadinessEvent;

describe('promptForReadiness', () => {
  it('turns screen directions into the user own left and right', () => {
    expect(promptForReadiness(event('moveLeft', true))).toBe('stepToYourLeft');
    expect(promptForReadiness(event('moveLeft', false))).toBe('stepToYourRight');
    expect(promptForReadiness(event('moveRight', true))).toBe('stepToYourRight');
    expect(promptForReadiness(event(null))).toBe('holdPosition');
    expect(promptForReadiness(event('tooClose'))).toBe('tooClose');
  });
});

describe('SetupSession', () => {
  let now = 0;
  let states: SetupState[];
  let calibrate: jest.Mock<Promise<CalibrationResult>, [number]>;

  beforeEach(() => {
    jest.useFakeTimers();
    now = 0;
    states = [];
    calibrate = jest.fn(() => Promise.resolve({ torsoLength: 0.24 }));
  });
  afterEach(() => jest.useRealTimers());

  const session = (options: { holdMs?: number; steps?: SetupStep[] } = {}) =>
    new SetupSession(
      { holdMs: 1000, ...options },
      calibrate,
      (s) => states.push(s),
      () => now
    );
  const advance = (ms: number) => {
    now += ms;
    jest.advanceTimersByTime(ms);
  };
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  it('holds, calibrates, then completes by default', async () => {
    const s = session();
    s.readiness(event('moveLeft'));
    expect(s.state).toMatchObject({
      phase: 'positioning',
      prompt: 'stepToYourLeft',
      screenDirection: 'left',
    });
    s.readiness(event(null));
    advance(500);
    expect(s.state.phase).toBe('holding');
    expect(s.state.progress).toBeCloseTo(0.5, 1);
    advance(600);
    expect(s.state).toMatchObject({ phase: 'calibrating', step: 1, stepCount: 2 });
    expect(calibrate).toHaveBeenCalledWith(2000);
    await flush();
    expect(s.state).toMatchObject({
      phase: 'done',
      prompt: 'done',
      calibration: { torsoLength: 0.24 },
    });
  });

  it('drops back to positioning when readiness is lost during the hold', () => {
    const s = session();
    s.readiness(event(null));
    advance(700);
    s.readiness(event('moving'));
    expect(s.state).toMatchObject({ phase: 'positioning', prompt: 'moving', progress: 0 });
    advance(2000);
    expect(calibrate).not.toHaveBeenCalled();
  });

  it('runs custom steps: position, pose, calibrate, countdown', async () => {
    const s = session({
      steps: [
        'position',
        { pose: tPose(), prompt: 'Arms out wide' },
        'calibrate',
        { countdown: 3 },
      ],
    });
    s.readiness(event(null));
    advance(1100);
    expect(s.state).toMatchObject({
      phase: 'posing',
      stepKind: 'pose',
      text: 'Arms out wide',
      step: 1,
    });
    // Moving into the pose must not bounce the user back to positioning.
    s.readiness(event('moving'));
    expect(s.state.phase).toBe('posing');
    s.poseEntered('tpose');
    expect(s.state.phase).toBe('posing');
    s.poseEntered(setupPoseId(1));
    expect(s.state).toMatchObject({ phase: 'calibrating', step: 2 });
    await flush();
    expect(s.state).toMatchObject({ phase: 'countdown', countdown: 3, text: '3' });
    advance(1100);
    expect(s.state).toMatchObject({ countdown: 2, text: '2' });
    advance(2000);
    expect(s.state).toMatchObject({ phase: 'done', step: 4, calibration: { torsoLength: 0.24 } });
  });

  it('starts over when the user leaves during a later step', () => {
    const s = session({ steps: ['position', { countdown: 5 }] });
    s.readiness(event(null));
    advance(1100);
    expect(s.state.phase).toBe('countdown');
    s.readiness(event('noBody'));
    expect(s.state).toMatchObject({ phase: 'positioning', step: 0, prompt: 'noBody' });
  });

  it('starts over after a failed calibration', async () => {
    calibrate.mockReturnValueOnce(Promise.reject(new Error('no')));
    const s = session({ holdMs: 100 });
    s.readiness(event(null));
    advance(200);
    await flush();
    expect(s.state).toMatchObject({ phase: 'positioning', step: 0, prompt: 'calibrationFailed' });
  });

  it('stops reporting after dispose', () => {
    const s = session();
    s.readiness(event(null));
    const count = states.length;
    s.dispose();
    advance(2000);
    expect(states.length).toBe(count);
  });
});
