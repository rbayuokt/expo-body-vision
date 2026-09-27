import { BodyVisionError } from './errors';
import { isJointName } from './joints';
import type { TargetDefinition } from './types';

export function defineTarget(target: Omit<TargetDefinition, 'type'>): TargetDefinition {
  const def: TargetDefinition = { type: 'target', ...target };
  validateTarget(def, 'target');
  return def;
}

export function validateTarget(t: TargetDefinition, path: string): void {
  const fail = (p: string, message: string): never => {
    throw new BodyVisionError('INVALID_RULE', message, `${path}.${p}`);
  };
  if (typeof t.id !== 'string' || !t.id) fail('id', 'is required');
  for (const key of ['x', 'y'] as const) {
    if (typeof t[key] !== 'number' || !Number.isFinite(t[key]))
      fail(key, 'expected a finite number');
  }
  if (t.radius !== undefined && !(t.radius > 0)) fail('radius', 'must be greater than 0');
  if (t.colliders !== undefined) {
    if (!t.colliders.length) fail('colliders', 'needs at least one joint');
    t.colliders.forEach((j, i) => {
      if (!isJointName(j)) fail(`colliders[${i}]`, `unknown joint '${String(j)}'`);
    });
  }
  if (t.mode !== undefined && t.mode !== 'hit' && t.mode !== 'zone') {
    fail('mode', "expected 'hit' or 'zone'");
  }
}
