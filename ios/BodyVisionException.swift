import ExpoModulesCore

enum BodyVisionErrorCode: String {
  case cameraPermissionDenied = "CAMERA_PERMISSION_DENIED"
  case cameraUnavailable = "CAMERA_UNAVAILABLE"
  case cameraInterrupted = "CAMERA_INTERRUPTED"
  case modelLoadFailed = "MODEL_LOAD_FAILED"
  case inferenceFailed = "INFERENCE_FAILED"
  case invalidConfig = "INVALID_CONFIG"
  case invalidRule = "INVALID_RULE"
  case testInputDisabled = "TEST_INPUT_DISABLED"
  case videoReadFailed = "VIDEO_READ_FAILED"
}

/**
 Expo's `Exception` derives its code from the class name (`FooException` -> `ERR_FOO`).
 Overriding `code` keeps JS on the stable codes documented in the TS types.
 */
final class BodyVisionException: Exception, @unchecked Sendable {
  private let errorCode: String
  private let message: String

  init(_ code: BodyVisionErrorCode, _ message: String, cause: Error? = nil) {
    self.errorCode = code.rawValue
    self.message = message
    super.init()
    self.cause = cause
  }

  override var code: String {
    errorCode
  }

  override var reason: String {
    message
  }
}
