import type { ReadinessEvent } from '../types';

export type SetupPrompt =
  | 'rotateToLandscape'
  | 'noBody'
  | 'getIntoPosition'
  | 'tooClose'
  | 'feetHidden'
  | 'headHidden'
  | 'handsHidden'
  | 'tooFar'
  | 'stepToYourLeft'
  | 'stepToYourRight'
  | 'lowVisibility'
  | 'moving'
  | 'holdPosition'
  | 'holdPose'
  | 'countdown'
  | 'calibrating'
  | 'calibrationFailed'
  | 'done';

export const DEFAULT_SETUP_PROMPTS: Record<SetupPrompt, string> = {
  rotateToLandscape: 'Turn your phone sideways',
  noBody: 'Step into view',
  getIntoPosition: 'Get into position, side-on to the camera',
  tooClose: 'Step back',
  feetHidden: 'Tilt the phone down so your feet are in view',
  headHidden: 'Tilt the phone up so your head is in view',
  handsHidden: 'Keep both hands in view',
  tooFar: 'Come a little closer',
  stepToYourLeft: 'Take a step to your left',
  stepToYourRight: 'Take a step to your right',
  lowVisibility: 'Find better light',
  moving: 'Stand still',
  holdPosition: 'Perfect, hold that',
  holdPose: 'Hold the pose',
  countdown: 'Get ready',
  calibrating: 'Measuring, stay still',
  calibrationFailed: "Couldn't measure you, let's try again",
  done: "You're all set",
};

/**
 * The prompt for a readiness state. Screen directions become the user's own: in a mirrored
 * preview moving toward screen-left is the user's left, in an unmirrored one it's their right.
 */
export function promptForReadiness(event: Pick<ReadinessEvent, 'issue' | 'mirrored'>): SetupPrompt {
  switch (event.issue) {
    case null:
      return 'holdPosition';
    case 'moveLeft':
      return event.mirrored ? 'stepToYourLeft' : 'stepToYourRight';
    case 'moveRight':
      return event.mirrored ? 'stepToYourRight' : 'stepToYourLeft';
    default:
      return event.issue;
  }
}
