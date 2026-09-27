package expo.modules.bodyvision

import expo.modules.kotlin.exception.CodedException

internal object ErrorCodes {
  const val CAMERA_PERMISSION_DENIED = "CAMERA_PERMISSION_DENIED"
  const val CAMERA_UNAVAILABLE = "CAMERA_UNAVAILABLE"
  const val MODEL_LOAD_FAILED = "MODEL_LOAD_FAILED"
  const val INFERENCE_FAILED = "INFERENCE_FAILED"
  const val GPU_UNAVAILABLE = "GPU_UNAVAILABLE"
  const val INVALID_CONFIG = "INVALID_CONFIG"
  const val INVALID_RULE = "INVALID_RULE"
  const val TEST_INPUT_DISABLED = "TEST_INPUT_DISABLED"
  const val VIDEO_READ_FAILED = "VIDEO_READ_FAILED"
}

/**
 * CodedException infers its code from the class name (`FooException` -> `ERR_FOO`).
 * Passing the code explicitly keeps JS on the same codes as iOS.
 */
internal class BodyVisionException(
  code: String,
  message: String,
  cause: Throwable? = null
) : CodedException(code, message, cause)
