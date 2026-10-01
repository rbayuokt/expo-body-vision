import AVFoundation
import ExpoModulesCore

public class ExpoBodyVisionModule: Module {
  // Decoding and inference are heavy. Keep them off Expo's shared module queue.
  private let videoQueue = DispatchQueue(label: "expo.modules.bodyvision.analyze", qos: .userInitiated)

  public func definition() -> ModuleDefinition {
    Name("ExpoBodyVision")

    Function("getCapabilities") { () -> [String: Any] in
      [
        "platform": "ios",
        "backend": "mediapipe",
        "backends": BodyVisionBackends.names,
        "joints": Joint.count,
        "maxBodies": 1,
        "testInput": ReplaySource.isEnabled
      ]
    }

    AsyncFunction("getCameraPermissionsAsync") { () -> [String: Any] in
      Self.permissionResponse()
    }

    AsyncFunction("requestCameraPermissionsAsync") { (promise: Promise) in
      // Asking without the usage string kills the app instead of failing.
      guard Bundle.main.object(forInfoDictionaryKey: "NSCameraUsageDescription") != nil else {
        promise.reject(BodyVisionException(.cameraUnavailable, "NSCameraUsageDescription is missing from Info.plist."))
        return
      }
      AVCaptureDevice.requestAccess(for: .video) { _ in
        promise.resolve(Self.permissionResponse())
      }
    }

    AsyncFunction("analyzeVideo") { (uri: String, config: [String: Any], options: [String: Any]) -> [String: Any] in
      try VideoAnalyzer(uri: uri, config: config, options: options).run()
    }
    .runOnQueue(videoQueue)

    View(BodyVisionView.self) {
      Events("onEvents")

      Prop("facing") { (view: BodyVisionView, facing: String) in
        view.facing = facing
      }

      Prop("torch") { (view: BodyVisionView, torch: Bool) in
        view.torch = torch
      }

      Prop("active") { (view: BodyVisionView, active: Bool) in
        view.active = active
      }

      Prop("resizeMode") { (view: BodyVisionView, mode: String) in
        view.resizeMode = mode
      }

      Prop("config") { (view: BodyVisionView, config: [String: Any]) in
        view.config = config
      }

      Prop("skeleton") { (view: BodyVisionView, skeleton: [String: Any]) in
        view.skeleton = skeleton
      }

      Prop("telemetry") { (view: BodyVisionView, telemetry: [String: Any]) in
        view.telemetry = telemetry
      }

      Prop("testInput") { (view: BodyVisionView, input: [String: Any]?) in
        view.testInput = input
        view.testInputChanged = true
      }

      Prop("video") { (view: BodyVisionView, video: [String: Any]?) in
        view.video = video
      }

      // Props arrive one by one. Apply them together so a facing + input change restarts once.
      OnViewDidUpdateProps { (view: BodyVisionView) in
        view.applyProps()
      }

      AsyncFunction("acknowledge") { (view: BodyVisionView, sequence: Int) in
        view.acknowledge(sequence)
      }

      AsyncFunction("startCalibration") { (view: BodyVisionView, durationMs: Double) in
        view.startCalibration(durationMs: durationMs)
      }

      AsyncFunction("resetExercise") { (view: BodyVisionView, id: String?) in
        view.resetExercise(id)
      }
    }
  }

  private static func permissionResponse() -> [String: Any] {
    let status: String
    let canAskAgain: Bool
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      status = "granted"
      canAskAgain = true
    case .notDetermined:
      status = "undetermined"
      canAskAgain = true
    default:
      status = "denied"
      canAskAgain = false
    }
    return ["status": status, "granted": status == "granted", "canAskAgain": canAskAgain, "expires": "never"]
  }
}
