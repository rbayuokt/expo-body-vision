#!/usr/bin/env node
// Writes the synthetic body sequences in fixtures/. Output is deterministic (seeded noise), so
// the same files drive the Swift, Kotlin and JS tests and the example app's replay input.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'fixtures');
const EXAMPLE_OUT = path.join(__dirname, '..', 'example', 'fixtures.generated.ts');

const JOINTS = [
  'nose', 'leftEyeInner', 'leftEye', 'leftEyeOuter', 'rightEyeInner', 'rightEye', 'rightEyeOuter',
  'leftEar', 'rightEar', 'mouthLeft', 'mouthRight', 'leftShoulder', 'rightShoulder', 'leftElbow',
  'rightElbow', 'leftWrist', 'rightWrist', 'leftPinky', 'rightPinky', 'leftIndex', 'rightIndex',
  'leftThumb', 'rightThumb', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle',
  'rightAnkle', 'leftHeel', 'rightHeel', 'leftFootIndex', 'rightFootIndex',
];
const J = Object.fromEntries(JOINTS.map((n, i) => [n, i]));

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const rad = (d) => (d * Math.PI) / 180;
const step = (p, len, deg) => ({ u: p.u + len * Math.cos(rad(deg)), v: p.v + len * Math.sin(rad(deg)) });
const lerp = (a, b, t) => ({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t });
const smooth = (t) => t * t * (3 - 2 * t);

// Figures live in "height units": u = x * aspect, v = y, so angles are true angles.
function emptyPose() {
  return JOINTS.map(() => ({ u: 0, v: 0, c: 0.95 }));
}

function set(pose, name, p, c = 0.95) {
  pose[J[name]] = { u: p.u, v: p.v, c };
}

function addHead(pose, neck, dir, facing, scale) {
  const nose = step(neck, 0.09 * scale, dir);
  set(pose, 'nose', nose);
  const side = facing === 'front' ? 1 : 0;
  const depth = facing === 'front' ? 0 : 0.012 * scale;
  const eye = 0.022 * scale;
  for (const [n, du] of [['leftEyeInner', 0.4], ['leftEye', 0.7], ['leftEyeOuter', 1]]) {
    set(pose, n, { u: nose.u + du * eye * side + depth, v: nose.v - 0.02 * scale });
  }
  for (const [n, du] of [['rightEyeInner', 0.4], ['rightEye', 0.7], ['rightEyeOuter', 1]]) {
    set(pose, n, { u: nose.u - du * eye * side - depth, v: nose.v - 0.02 * scale });
  }
  set(pose, 'leftEar', { u: nose.u + 1.8 * eye * side - 2 * depth, v: nose.v - 0.012 * scale });
  set(pose, 'rightEar', { u: nose.u - 1.8 * eye * side - 3 * depth, v: nose.v - 0.012 * scale });
  set(pose, 'mouthLeft', { u: nose.u + 0.6 * eye * side, v: nose.v + 0.022 * scale });
  set(pose, 'mouthRight', { u: nose.u - 0.6 * eye * side, v: nose.v + 0.022 * scale });
}

function addHand(pose, side, elbow, wrist, scale) {
  const dir = (Math.atan2(wrist.v - elbow.v, wrist.u - elbow.u) * 180) / Math.PI;
  set(pose, `${side}Pinky`, step(wrist, 0.035 * scale, dir + 12));
  set(pose, `${side}Index`, step(wrist, 0.04 * scale, dir - 6));
  set(pose, `${side}Thumb`, step(wrist, 0.03 * scale, dir - 25));
}

function addFoot(pose, side, ankle, forward, scale) {
  set(pose, `${side}Heel`, { u: ankle.u - forward * 0.015 * scale, v: ankle.v + 0.015 * scale });
  set(pose, `${side}FootIndex`, { u: ankle.u + forward * 0.05 * scale, v: ankle.v + 0.02 * scale });
}

/** Front view. Angles in degrees: arm abduction from hanging down, elbow flex from straight. */
function frontPose({ hip, scale = 1, leftArm = 10, rightArm = 10, leftElbow = 0, rightElbow = 0 }) {
  const pose = emptyPose();
  const s = scale;
  const neck = { u: hip.u, v: hip.v - 0.24 * s };
  const shoulders = { left: { u: neck.u + 0.085 * s, v: neck.v }, right: { u: neck.u - 0.085 * s, v: neck.v } };
  for (const side of ['left', 'right']) {
    const outward = side === 'left' ? 1 : -1;
    const abd = side === 'left' ? leftArm : rightArm;
    const flex = side === 'left' ? leftElbow : rightElbow;
    const upperDir = 90 - outward * abd;
    const sh = shoulders[side];
    const elbow = step(sh, 0.14 * s, upperDir);
    const wrist = step(elbow, 0.12 * s, upperDir - outward * flex);
    set(pose, `${side}Shoulder`, sh);
    set(pose, `${side}Elbow`, elbow);
    set(pose, `${side}Wrist`, wrist);
    addHand(pose, side, elbow, wrist, s);
    const hp = { u: hip.u + outward * 0.06 * s, v: hip.v };
    const knee = step(hp, 0.19 * s, 90 - outward * 3);
    const ankle = step(knee, 0.19 * s, 90 - outward * 2);
    set(pose, `${side}Hip`, hp);
    set(pose, `${side}Knee`, knee);
    set(pose, `${side}Ankle`, ankle);
    addFoot(pose, side, ankle, 0, s);
  }
  addHead(pose, neck, -90, 'front', s);
  return pose;
}

/** Side view facing +u. The far (right) side is offset and less confident. */
function sidePose(build) {
  const pose = emptyPose();
  build(pose);
  for (const n of JOINTS) {
    if (!n.startsWith('left')) continue;
    const far = n.replace('left', 'right');
    const p = pose[J[n]];
    pose[J[far]] = { u: p.u - 0.012, v: p.v - 0.006, c: 0.7 };
  }
  return pose;
}

function squatPose({ ankle, knee: kneeAngle, scale = 1 }) {
  return sidePose((pose) => {
    const s = scale;
    const bend = 180 - kneeAngle;
    const shinDir = -90 + bend * 0.45;
    const knee = step(ankle, 0.19 * s, shinDir);
    const thighDir = shinDir + 180 + kneeAngle;
    const hip = step(knee, 0.19 * s, thighDir);
    const torsoDir = -90 + bend * 0.4;
    const shoulder = step(hip, 0.24 * s, torsoDir);
    const elbow = step(shoulder, 0.14 * s, -bend * 0.2);
    const wrist = step(elbow, 0.12 * s, -bend * 0.2);
    set(pose, 'leftAnkle', ankle);
    set(pose, 'leftKnee', knee);
    set(pose, 'leftHip', hip);
    set(pose, 'leftShoulder', shoulder);
    set(pose, 'leftElbow', elbow);
    set(pose, 'leftWrist', wrist);
    addHand(pose, 'left', elbow, wrist, s);
    addFoot(pose, 'left', ankle, 1, s);
    addHead(pose, shoulder, torsoDir + 15, 'side', s);
  });
}

function pushupPose({ wrist, elbow: elbowAngle, scale = 1 }) {
  return sidePose((pose) => {
    const s = scale;
    const forearmDir = -90 - 8;
    const elbow = step(wrist, 0.12 * s, forearmDir);
    // Measured from the elbow->wrist direction, rotating toward the head (+u) as the elbow bends.
    const shoulder = step(elbow, 0.14 * s, forearmDir + 180 - elbowAngle);
    const bodyLen = 0.62 * s;
    const ground = wrist.v;
    const drop = Math.min(bodyLen * 0.95, ground - 0.02 * s - shoulder.v);
    const ankle = { u: shoulder.u - Math.sqrt(bodyLen ** 2 - drop ** 2), v: ground - 0.02 * s };
    const hip = lerp(shoulder, ankle, 0.24 / 0.62);
    const knee = lerp(shoulder, ankle, 0.43 / 0.62);
    set(pose, 'leftWrist', wrist);
    set(pose, 'leftElbow', elbow);
    set(pose, 'leftShoulder', shoulder);
    set(pose, 'leftHip', hip);
    set(pose, 'leftKnee', knee);
    set(pose, 'leftAnkle', ankle);
    addHand(pose, 'left', elbow, { u: wrist.u + 0.01, v: wrist.v }, s);
    addFoot(pose, 'left', ankle, 1, s);
    const bodyDir = (Math.atan2(shoulder.v - ankle.v, shoulder.u - ankle.u) * 180) / Math.PI;
    addHead(pose, shoulder, bodyDir + 10, 'side', s);
  });
}

class Sequence {
  constructor({ name, aspect, fps = 30, seed = 1, noise = 0.003, description }) {
    Object.assign(this, { name, aspect, fps, noise, description });
    this.rand = rng(seed);
    this.t = 0;
    this.rows = [];
    this.meta = [];
  }

  /** Holds or tweens between two pose functions of a parameter. */
  segment(durationMs, poseAt, { present = true, edit } = {}) {
    const dt = 1000 / this.fps;
    const end = this.t + durationMs;
    while (this.t < end) {
      const k = durationMs > 0 ? Math.min(1, (durationMs - (end - this.t)) / durationMs) : 1;
      const jitter = (this.rand() - 0.5) * 0.2 * dt;
      const pose = present ? poseAt(k) : null;
      if (pose && edit) edit(pose, k, this.t);
      this.rows.push({ t: Math.round(this.t + jitter), pose });
      this.t += dt;
    }
    return this;
  }

  toCsv(configs, expect) {
    const lines = [`# name: ${this.name}`, `# description: ${this.description}`, `# aspect: ${this.aspect}`];
    for (const c of configs) lines.push(`# config: ${JSON.stringify(c)}`);
    for (const [k, v] of Object.entries(expect)) lines.push(`# expect: ${k}=${v}`);
    for (const { t, pose } of this.rows) {
      if (!pose) {
        lines.push(`${t},0`);
        continue;
      }
      const values = pose.map((p) => {
        const nx = (p.u + gaussian(this.rand) * this.noise) / this.aspect;
        const ny = p.v + gaussian(this.rand) * this.noise;
        return `${nx.toFixed(4)},${ny.toFixed(4)},${p.c.toFixed(2)}`;
      });
      lines.push(`${t},1,${values.join(',')}`);
    }
    return lines.join('\n') + '\n';
  }
}

// Kept in sync with src/presets.ts. A jest test compares the two.
const PUSHUP = {
  type: 'exercise',
  id: 'pushup',
  metric: { kind: 'angle', joints: ['leftShoulder', 'leftElbow', 'leftWrist'], mirror: true },
  top: 150,
  bottom: 100,
  hysteresis: 10,
  minRepMs: 500,
  maxRepMs: 8000,
  lossGraceMs: 400,
  minConfidence: 0.5,
  requires: [
    { kind: 'inclination', joints: ['leftShoulder', 'leftAnkle'], max: 40, mirror: true },
  ],
};
const SQUAT = {
  type: 'exercise',
  id: 'squat',
  metric: { kind: 'angle', joints: ['leftHip', 'leftKnee', 'leftAnkle'], mirror: true },
  top: 160,
  bottom: 100,
  hysteresis: 10,
  minRepMs: 400,
  maxRepMs: 8000,
  lossGraceMs: 400,
  minConfidence: 0.5,
  requires: [
    { kind: 'inclination', joints: ['leftShoulder', 'leftHip'], min: 35, mirror: true },
  ],
};
const PUNCH = {
  type: 'exercise',
  id: 'punch',
  metric: { kind: 'angle', joints: ['leftShoulder', 'leftElbow', 'leftWrist'], mirror: true },
  mode: 'peak',
  top: 110,
  bottom: 80,
  hysteresis: 10,
  minRepMs: 70,
  maxRepMs: 8000,
  lossGraceMs: 400,
  minConfidence: 0.2,
};
const TPOSE = {
  type: 'pose',
  id: 'tpose',
  holdMs: 500,
  exitGraceMs: 150,
  minConfidence: 0.5,
  conditions: [
    { kind: 'inclination', joints: ['leftShoulder', 'leftWrist'], max: 20 },
    { kind: 'inclination', joints: ['rightShoulder', 'rightWrist'], max: 20 },
    { kind: 'angle', joints: ['leftShoulder', 'leftElbow', 'leftWrist'], min: 150 },
    { kind: 'angle', joints: ['rightShoulder', 'rightElbow', 'rightWrist'], min: 150 },
  ],
};

const PUSHUP_AT = (k) => pushupPose({ wrist: { u: 1.1, v: 0.8 }, elbow: 165 - 85 * k, scale: 0.9 });
const PUSHUP_UP = (k) => pushupPose({ wrist: { u: 1.1, v: 0.8 }, elbow: 80 + 85 * k, scale: 0.9 });
const STAND = () => frontPose({ hip: { u: 0.28, v: 0.55 }, scale: 0.7 });

function pushupRep(seq, downMs = 600, upMs = 600, holdMs = 250) {
  seq.segment(downMs, (k) => PUSHUP_AT(smooth(k)));
  seq.segment(150, () => PUSHUP_AT(1));
  seq.segment(upMs, (k) => PUSHUP_UP(smooth(k)));
  seq.segment(holdMs, () => PUSHUP_UP(1));
}

function squatRep(seq, downMs = 900, upMs = 900) {
  const ankle = { u: 0.3, v: 0.9 };
  seq.segment(downMs, (k) => squatPose({ ankle, knee: 175 - 95 * smooth(k) }));
  seq.segment(120, () => squatPose({ ankle, knee: 80 }));
  seq.segment(upMs, (k) => squatPose({ ankle, knee: 80 + 95 * smooth(k) }));
  seq.segment(250, () => squatPose({ ankle, knee: 175 }));
}

const fixtures = [];

{
  const s = new Sequence({ name: 'pushup-clean', aspect: 16 / 9, description: 'Three clean push-ups, side view, landscape.' });
  s.segment(600, () => PUSHUP_UP(1));
  for (let i = 0; i < 3; i++) pushupRep(s);
  fixtures.push([s, [PUSHUP], { 'reps.pushup': 3, 'rejected.pushup': 0, phases: 'top,descending,bottom,ascending,top' }]);
}

{
  const s = new Sequence({ name: 'pushup-partial-noisy', aspect: 16 / 9, seed: 7, noise: 0.007, description: 'Two full push-ups, one that stops at 125 degrees, heavy jitter.' });
  s.segment(600, () => PUSHUP_UP(1));
  pushupRep(s);
  s.segment(500, (k) => pushupPose({ wrist: { u: 1.1, v: 0.8 }, elbow: 165 - 40 * smooth(k), scale: 0.9 }));
  s.segment(500, (k) => pushupPose({ wrist: { u: 1.1, v: 0.8 }, elbow: 125 + 40 * smooth(k), scale: 0.9 }));
  s.segment(300, () => PUSHUP_UP(1));
  pushupRep(s);
  fixtures.push([s, [PUSHUP], { 'reps.pushup': 2, 'rejected.pushup': 1 }]);
}

{
  const s = new Sequence({ name: 'pushup-dropout', aspect: 16 / 9, seed: 11, description: 'Wrist confidence drops mid-rep, then the user leaves and comes back.' });
  s.segment(600, () => PUSHUP_UP(1));
  s.segment(600, (k) => PUSHUP_AT(smooth(k)), {
    edit: (pose, k) => {
      if (k > 0.4 && k < 0.7) pose[J.leftWrist].c = pose[J.rightWrist].c = 0.1;
    },
  });
  s.segment(150, () => PUSHUP_AT(1));
  s.segment(600, (k) => PUSHUP_UP(smooth(k)));
  s.segment(250, () => PUSHUP_UP(1));
  pushupRep(s);
  s.segment(1200, () => null, { present: false });
  s.segment(600, () => PUSHUP_UP(1));
  pushupRep(s);
  fixtures.push([s, [PUSHUP], { 'reps.pushup': 3, bodyLost: 1, bodyDetected: 2 }]);
}

{
  const s = new Sequence({ name: 'pushup-15fps', aspect: 16 / 9, fps: 15, seed: 3, description: 'Three push-ups sampled at 15 fps, like a throttled low-end device.' });
  s.segment(600, () => PUSHUP_UP(1));
  for (let i = 0; i < 3; i++) pushupRep(s, 500, 500, 200);
  fixtures.push([s, [PUSHUP], { 'reps.pushup': 3 }]);
}

{
  const s = new Sequence({ name: 'squat-clean', aspect: 9 / 16, seed: 5, description: 'Three squats, side view, portrait.' });
  s.segment(600, () => squatPose({ ankle: { u: 0.3, v: 0.9 }, knee: 175 }));
  for (let i = 0; i < 3; i++) squatRep(s);
  fixtures.push([s, [SQUAT], { 'reps.squat': 3, 'rejected.squat': 0 }]);
}

{
  const s = new Sequence({ name: 'squat-fast', aspect: 9 / 16, seed: 9, noise: 0.004, description: 'Three quick squats, 0.7 s each.' });
  s.segment(500, () => squatPose({ ankle: { u: 0.3, v: 0.9 }, knee: 175 }));
  for (let i = 0; i < 3; i++) squatRep(s, 300, 300);
  fixtures.push([s, [SQUAT], { 'reps.squat': 3 }]);
}

{
  const s = new Sequence({ name: 'tpose-hold', aspect: 9 / 16, seed: 13, description: 'T-pose held for 1.5 s, then a 0.2 s flicker that must not trigger.' });
  const tpose = (k) => frontPose({ hip: { u: 0.28, v: 0.55 }, scale: 0.7, leftArm: 10 + 80 * k, rightArm: 10 + 80 * k });
  s.segment(800, STAND);
  s.segment(400, (k) => tpose(smooth(k)));
  s.segment(1500, () => tpose(1));
  s.segment(400, (k) => tpose(1 - smooth(k)));
  s.segment(800, STAND);
  s.segment(150, (k) => tpose(smooth(k)));
  s.segment(200, () => tpose(1));
  s.segment(150, (k) => tpose(1 - smooth(k)));
  s.segment(800, STAND);
  fixtures.push([s, [TPOSE], { 'entered.tpose': 1, 'exited.tpose': 1 }]);
}

{
  const s = new Sequence({ name: 'reach-target', aspect: 9 / 16, seed: 17, description: 'Right arm swings up through a target, twice inside the cooldown, then once after it.' });
  const reach = (k) => frontPose({ hip: { u: 0.28, v: 0.55 }, scale: 0.7, rightArm: 10 + 140 * k });
  s.segment(600, STAND);
  s.segment(250, (k) => reach(smooth(k)));
  s.segment(250, (k) => reach(1 - smooth(k)));
  s.segment(250, (k) => reach(smooth(k)));
  s.segment(250, (k) => reach(1 - smooth(k)));
  s.segment(1200, STAND);
  s.segment(250, (k) => reach(smooth(k)));
  s.segment(600, () => reach(1));
  const target = {
    type: 'target',
    id: 'pad',
    x: 0.9,
    y: 0.32,
    radius: 0.06,
    colliders: ['leftWrist', 'rightWrist'],
    colliderRadius: 0.03,
    minSpeed: 0,
    cooldownMs: 1000,
    mode: 'hit',
  };
  const view = { type: 'view', width: 360, height: 640, mirrored: true, resizeMode: 'cover' };
  fixtures.push([s, [target, view], { 'hits.pad': 2 }]);
}

{
  const s = new Sequence({ name: 'setup-walk-in', aspect: 9 / 16, seed: 23, description: 'Walks in off-center, comes too close, steps back, waves, then settles.' });
  const at = (u, scale, arms = 10) => frontPose({ hip: { u, v: 0.55 }, scale, leftArm: arms, rightArm: arms });
  s.segment(500, () => null, { present: false });
  s.segment(1200, () => at(0.12, 0.7));
  s.segment(600, (k) => at(0.12 + 0.16 * smooth(k), 0.7 + 0.8 * smooth(k)));
  s.segment(1200, () => at(0.28, 1.5));
  s.segment(800, (k) => at(0.28, 1.5 - 0.8 * smooth(k)));
  s.segment(1500, () => at(0.28, 0.7));
  s.segment(800, (k) => at(0.28, 0.7, 10 + 60 * Math.abs(Math.sin(k * Math.PI * 3))));
  // Long enough after the last settle for a hold plus a 2 s calibration.
  s.segment(4500, () => at(0.28, 0.7));
  const view = { type: 'view', width: 360, height: 640, mirrored: true, resizeMode: 'cover' };
  const readiness = { type: 'readiness', framing: 'fullBody' };
  fixtures.push([s, [view, readiness], { readinessSeq: 'moveLeft,tooClose,ready,moving,ready', readinessLast: 'ready' }]);
}

{
  const s = new Sequence({ name: 'setup-floor', aspect: 16 / 9, seed: 29, description: 'Landscape: stands facing the camera, then gets into a side-on plank and holds.' });
  const plank = () => pushupPose({ wrist: { u: 1.25, v: 0.85 }, elbow: 170, scale: 1.1 });
  s.segment(1200, () => frontPose({ hip: { u: 0.89, v: 0.55 }, scale: 0.7 }));
  s.segment(3500, plank);
  const view = { type: 'view', width: 844, height: 390, mirrored: false, resizeMode: 'cover' };
  const readiness = { type: 'readiness', framing: 'floor' };
  fixtures.push([s, [view, readiness], { readinessSeq: 'getIntoPosition,ready', readinessLast: 'ready' }]);
}

{
  const s = new Sequence({ name: 'setup-steps', aspect: 9 / 16, seed: 31, description: 'Walks in, stands still, does a T-pose to confirm, then stays still for measuring and a countdown.' });
  const at = (arms) => frontPose({ hip: { u: 0.28, v: 0.55 }, scale: 0.7, leftArm: arms, rightArm: arms });
  s.segment(500, () => null, { present: false });
  s.segment(2500, () => at(10));
  s.segment(500, (k) => at(10 + 80 * smooth(k)));
  s.segment(1500, () => at(90));
  s.segment(500, (k) => at(90 - 80 * smooth(k)));
  s.segment(7000, () => at(10));
  const view = { type: 'view', width: 360, height: 640, mirrored: true, resizeMode: 'cover' };
  const readiness = { type: 'readiness', framing: 'fullBody' };
  fixtures.push([s, [view, readiness, TPOSE], { readinessLast: 'ready', 'entered.tpose': 1 }]);
}

{
  const s = new Sequence({ name: 'punches', aspect: 9 / 16, seed: 37, noise: 0.004, description: 'Guard, three alternating punches, a half punch, a six-punch combo at 100 ms per extension, then both arms at once.' });
  const GUARD = 110;
  // Elbow flex (0 is straight) for a punch starting at `start` ms, out and back in `half` ms each.
  const flex = (t, start, half, to = 10) => {
    const x = t - start;
    if (x < 0 || x > 2 * half) return GUARD;
    const k = x < half ? x / half : (2 * half - x) / half;
    return GUARD + (to - GUARD) * k;
  };
  const guard = (leftElbow, rightElbow) => frontPose({ hip: { u: 0.28, v: 0.55 }, scale: 0.7, leftArm: 25, rightArm: 25, leftElbow, rightElbow });
  s.segment(600, () => guard(GUARD, GUARD));
  for (const side of ['left', 'right', 'left']) {
    s.segment(500, (k) => {
      const f = flex(k * 500, 0, 150);
      return side === 'left' ? guard(f, GUARD) : guard(GUARD, f);
    });
  }
  s.segment(500, (k) => guard(flex(k * 500, 0, 150, 80), GUARD));
  s.segment(800, (k) => {
    const t = k * 800;
    const left = Math.min(flex(t, 0, 100), flex(t, 200, 100), flex(t, 400, 100));
    const right = Math.min(flex(t, 100, 100), flex(t, 300, 100), flex(t, 500, 100));
    return guard(left, right);
  });
  s.segment(300, () => guard(GUARD, GUARD));
  s.segment(400, (k) => guard(flex(k * 400, 0, 150), flex(k * 400, 0, 150)));
  s.segment(500, () => guard(GUARD, GUARD));
  fixtures.push([s, [PUNCH], { 'reps.punch': 10 }]);
}

{
  const s = new Sequence({ name: 'standing-glitches', aspect: 9 / 16, seed: 21, noise: 0.01, description: 'Standing still with heavy jitter, NaN and out-of-range spikes.' });
  s.segment(3000, STAND, {
    edit: (pose, k, t) => {
      if (Math.floor(t / 33) % 17 === 5) pose[J.leftWrist] = { u: NaN, v: NaN, c: 0.9 };
      if (Math.floor(t / 33) % 23 === 7) pose[J.rightElbow] = { u: 40, v: -30, c: 0.9 };
    },
  });
  fixtures.push([s, [PUSHUP, SQUAT, TPOSE], { 'reps.pushup': 0, 'reps.squat': 0, 'entered.tpose': 0 }]);
}

fs.mkdirSync(OUT, { recursive: true });
const generated = [];
for (const [seq, configs, expect] of fixtures) {
  const csv = seq.toCsv(configs, expect);
  fs.writeFileSync(path.join(OUT, `${seq.name}.csv`), csv);
  generated.push([seq.name, csv]);
}
fs.writeFileSync(path.join(OUT, 'presets.json'), JSON.stringify({ pushup: PUSHUP, squat: SQUAT, punch: PUNCH, tpose: TPOSE }, null, 2) + '\n');

if (fs.existsSync(path.dirname(EXAMPLE_OUT))) {
  const body = generated.map(([name, csv]) => `  '${name}': ${JSON.stringify(csv)},`).join('\n');
  fs.writeFileSync(EXAMPLE_OUT, `// Generated by scripts/generate-fixtures.js\nexport const FIXTURES: Record<string, string> = {\n${body}\n};\n`);
}
console.log(`Wrote ${generated.length} fixtures to ${path.relative(process.cwd(), OUT)}`);
