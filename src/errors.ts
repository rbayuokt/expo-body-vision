export type BodyVisionErrorCode =
  | 'CAMERA_PERMISSION_DENIED'
  | 'CAMERA_UNAVAILABLE'
  | 'CAMERA_INTERRUPTED'
  | 'MODEL_LOAD_FAILED'
  | 'INFERENCE_FAILED'
  | 'GPU_UNAVAILABLE'
  | 'INVALID_CONFIG'
  | 'INVALID_RULE'
  | 'TEST_INPUT_DISABLED'
  | 'VIDEO_READ_FAILED'
  | 'CALIBRATION_FAILED'
  | 'NOT_MOUNTED'
  | 'UNSUPPORTED_PLATFORM';

export class BodyVisionError extends Error {
  readonly code: BodyVisionErrorCode;
  /** Where in a rule or config the problem is, e.g. `rules[1].conditions[0].joints`. */
  readonly path?: string;

  constructor(code: BodyVisionErrorCode, message: string, path?: string) {
    super(path ? `${path}: ${message}` : message);
    this.name = 'BodyVisionError';
    this.code = code;
    this.path = path;
  }
}
