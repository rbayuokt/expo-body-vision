import { BodyVisionError } from './errors';
import type { ReplayInput } from './types';

const JOINT_COUNT = 33;
const ROW = 2 + JOINT_COUNT * 3;

/**
 * Parses a recorded body sequence (the CSV format in the repo's `fixtures/`) into replay input.
 * Replay only runs in apps built with the config plugin's `enableTestInput`.
 */
export function parseBodySequence(csv: string, options: { loop?: boolean } = {}): ReplayInput {
  let aspect = 1;
  const frames: number[] = [];
  for (const line of csv.split('\n')) {
    if (!line) continue;
    if (line.startsWith('# aspect: ')) {
      aspect = Number(line.slice(10));
      continue;
    }
    if (line.startsWith('#')) continue;
    const values = line.split(',').map(Number);
    if (values[1] === 0) {
      frames.push(values[0], 0);
      for (let i = 2; i < ROW; i++) frames.push(0);
    } else if (values.length === ROW) {
      frames.push(...values);
    } else {
      throw new BodyVisionError(
        'INVALID_CONFIG',
        `expected ${ROW} values, got ${values.length}`,
        'testInput'
      );
    }
  }
  return { frames, aspect, loop: options.loop ?? true };
}
