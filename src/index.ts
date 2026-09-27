export * from './types';
export { BodyVisionError, type BodyVisionErrorCode } from './errors';
export { BONES, JOINTS, isJointName, type BoneName, type JointName } from './joints';
export {
  above,
  angle,
  defineExercise,
  definePose,
  distance,
  inclination,
  Measure,
  type ConditionDefinition,
  type ExerciseDefinition,
  type MetricDefinition,
  type MetricKind,
  type PoseDefinition,
  type RuleDefinition,
} from './rules';
export { defineTarget } from './targets';
export { armsUp, punch, pushUp, squat, tPose } from './presets';
export {
  BodyVisionView,
  type BodyVisionViewProps,
  type BodyVisionViewRef,
  type BodySetupOptions,
} from './BodyVisionView';
export {
  getCameraPermissionsAsync,
  getCapabilities,
  requestCameraPermissionsAsync,
  useCameraPermissions,
} from './permissions';
export { parseBodySequence } from './testing';
export { useBodyVisionEvents, type BodyVisionEvent } from './events';
export type { PoseModelSource } from './model';
export { BodySetupContext, useBodySetup, type BodySetupContextValue } from './setup/context';
export { DEFAULT_SETUP_PROMPTS, promptForReadiness, type SetupPrompt } from './setup/prompts';
export type {
  SetupPhase,
  SetupState,
  SetupSessionOptions,
  SetupStep,
  SetupStepKind,
} from './setup/session';
export { createSpeaker, isSpeechAvailable, type Speaker, type VoiceOptions } from './setup/speech';
export {
  analyzeVideo,
  type AnalyzeVideoOptions,
  type VideoAnalysis,
  type VideoEvent,
  type VideoSource,
} from './video';
