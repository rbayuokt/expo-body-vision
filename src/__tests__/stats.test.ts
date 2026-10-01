import { addMiss, addRep, EMPTY_REP_STATS } from '../stats';
import type { RepEvent, RepRejectedEvent } from '../types';

const rep = (timestamp: number, side?: 'left' | 'right'): RepEvent => ({
  timestamp,
  exercise: 'punch',
  bodyId: 1,
  count: 0,
  durationMs: 0,
  side,
});
const miss: RepRejectedEvent = { timestamp: 0, exercise: 'squat', reason: 'incomplete' };

describe('rep stats', () => {
  it('chains a combo within the gap and starts over after it', () => {
    let s = EMPTY_REP_STATS;
    for (const t of [0, 500, 1000, 3000]) s = addRep(s, rep(t, t === 500 ? 'right' : 'left'));
    expect(s).toMatchObject({ count: 4, left: 3, right: 1, combo: 1, best: 3, streak: 4 });
  });

  it('a miss ends the streak but not the count or combo', () => {
    let s = addRep(addRep(EMPTY_REP_STATS, rep(0)), rep(400));
    s = addMiss(s, miss);
    expect(s).toMatchObject({ count: 2, combo: 2, streak: 0, missed: 1, lastMiss: 'incomplete' });
  });

  it('honours a custom gap', () => {
    const s = addRep(addRep(EMPTY_REP_STATS, rep(0)), rep(1500), 2000);
    expect(s.combo).toBe(2);
  });
});
