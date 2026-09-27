import fs from 'fs';
import path from 'path';

import { BodyVisionError } from '../errors';
import { armsUp, punch, pushUp, squat, tPose } from '../presets';
import { angle, defineExercise, definePose, inclination } from '../rules';
import { defineTarget } from '../targets';
import { parseBodySequence } from '../testing';

const FIXTURES = path.join(__dirname, '../../fixtures');

function codeAndPath(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    const err = e as BodyVisionError;
    return [err.code, err.path];
  }
  return null;
}

describe('presets', () => {
  it('match the definitions the native fixture tests run', () => {
    const presets = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'presets.json'), 'utf8'));
    expect(pushUp()).toEqual(presets.pushup);
    expect(squat()).toEqual(presets.squat);
    expect(punch()).toEqual(presets.punch);
    expect(tPose()).toEqual(presets.tpose);
  });

  it('apply overrides', () => {
    expect(pushUp({ bottom: 90 }).bottom).toBe(90);
    expect(tPose({ id: 'start' }).id).toBe('start');
    expect(armsUp().conditions).toHaveLength(4);
  });
});

describe('rule builders', () => {
  it('serialize measurements to plain data', () => {
    const pose = definePose({
      id: 'lean',
      when: [inclination('leftShoulder', 'leftHip').mirrored().atMost(70, 5)],
    });
    expect(JSON.parse(JSON.stringify(pose))).toEqual({
      type: 'pose',
      id: 'lean',
      conditions: [
        {
          kind: 'inclination',
          joints: ['leftShoulder', 'leftHip'],
          mirror: true,
          max: 70,
          hysteresis: 5,
        },
      ],
    });
  });

  it('reject rules native would reject, with a path', () => {
    expect(
      codeAndPath(() =>
        definePose({
          id: 'x',
          when: [angle('leftShoulder', 'leftElbow', 'nope' as never).atLeast(1)],
        })
      )
    ).toEqual(['INVALID_RULE', 'pose.conditions[0].joints[2]']);
    expect(codeAndPath(() => definePose({ id: 'x', when: [] }))).toEqual([
      'INVALID_RULE',
      'pose.conditions',
    ]);
    expect(
      codeAndPath(() =>
        defineExercise({
          id: 'x',
          metric: angle('leftHip', 'leftKnee', 'leftAnkle'),
          top: 120,
          bottom: 110,
        })
      )
    ).toEqual(['INVALID_RULE', 'exercise.hysteresis']);
    expect(codeAndPath(() => defineTarget({ id: 't', x: 0.5, y: 0.5, radius: 0 }))).toEqual([
      'INVALID_RULE',
      'target.radius',
    ]);
  });
});

describe('parseBodySequence', () => {
  it('flattens fixture rows, padding absent frames', () => {
    const csv = fs.readFileSync(path.join(FIXTURES, 'pushup-dropout.csv'), 'utf8');
    const input = parseBodySequence(csv);
    const rows = csv.split('\n').filter((l) => l && !l.startsWith('#'));
    expect(input.frames).toHaveLength(rows.length * 101);
    expect(input.aspect).toBeCloseTo(16 / 9);
    expect(input.loop).toBe(true);
  });
});
