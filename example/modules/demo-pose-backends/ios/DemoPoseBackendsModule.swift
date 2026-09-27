import CoreMedia
import ExpoBodyVision
import ExpoModulesCore
import Vision

public class DemoPoseBackendsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DemoPoseBackends")

    Function("register") { () -> [String] in
      BodyVisionBackends.register("apple-vision") { _ in AppleVisionBackend() }
      return ["apple-vision"]
    }
  }
}

/// Apple's built-in body pose request: no model to ship, 19 joints mapped by name.
final class AppleVisionBackend: BodyVisionPoseBackend {
  let delegateName = "vision"
  private let request = VNDetectHumanBodyPoseRequest()

  private static let joints: [(VNHumanBodyPoseObservation.JointName, String)] = [
    (.nose, "nose"), (.leftEye, "leftEye"), (.rightEye, "rightEye"),
    (.leftEar, "leftEar"), (.rightEar, "rightEar"),
    (.leftShoulder, "leftShoulder"), (.rightShoulder, "rightShoulder"),
    (.leftElbow, "leftElbow"), (.rightElbow, "rightElbow"),
    (.leftWrist, "leftWrist"), (.rightWrist, "rightWrist"),
    (.leftHip, "leftHip"), (.rightHip, "rightHip"),
    (.leftKnee, "leftKnee"), (.rightKnee, "rightKnee"),
    (.leftAnkle, "leftAnkle"), (.rightAnkle, "rightAnkle")
  ]

  func detect(_ buffer: CMSampleBuffer, timestampMs: Int, into result: BodyVisionPoseResult) throws {
    try VNImageRequestHandler(cmSampleBuffer: buffer, orientation: .up).perform([request])
    guard let observation = request.results?.first else { return }
    let points = try observation.recognizedPoints(.all)
    for (visionName, name) in Self.joints {
      guard let p = points[visionName], p.confidence > 0 else { continue }
      // Vision's origin is bottom-left.
      result.setJoint(name, x: Double(p.location.x), y: 1 - Double(p.location.y), confidence: Double(p.confidence))
    }
  }
}
