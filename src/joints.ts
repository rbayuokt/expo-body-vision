/** Joint names in the order native code stores them (BlazePose topology). */
export const JOINTS = [
  'nose',
  'leftEyeInner',
  'leftEye',
  'leftEyeOuter',
  'rightEyeInner',
  'rightEye',
  'rightEyeOuter',
  'leftEar',
  'rightEar',
  'mouthLeft',
  'mouthRight',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftPinky',
  'rightPinky',
  'leftIndex',
  'rightIndex',
  'leftThumb',
  'rightThumb',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
  'leftHeel',
  'rightHeel',
  'leftFootIndex',
  'rightFootIndex',
] as const;

export type JointName = (typeof JOINTS)[number];

export const BONES = [
  'shoulders',
  'hips',
  'leftTorso',
  'rightTorso',
  'leftUpperArm',
  'leftForearm',
  'rightUpperArm',
  'rightForearm',
  'leftThigh',
  'leftShin',
  'rightThigh',
  'rightShin',
  'leftHand',
  'rightHand',
  'leftFoot',
  'rightFoot',
  'leftHeel',
  'rightHeel',
] as const;

export type BoneName = (typeof BONES)[number];

const JOINT_SET = new Set<string>(JOINTS);

export function isJointName(value: unknown): value is JointName {
  return typeof value === 'string' && JOINT_SET.has(value);
}

export function jointIndex(name: JointName): number {
  return JOINTS.indexOf(name);
}
