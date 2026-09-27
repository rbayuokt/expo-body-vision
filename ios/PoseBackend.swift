import CoreMedia
import Foundation
import MediaPipeTasksVision

/**
 Turns a frame into body joints. Implement this to use your own model or SDK, register
 it with `BodyVisionBackends.register`, and select it from JS with `backend="<name>"`.

 `detect` runs on one queue, one frame at a time. Camera frames that arrive while it runs
 are dropped, so it may block. Buffers are 32BGRA, upright and never mirrored.
 */
public protocol BodyVisionPoseBackend: AnyObject {
  /// Shown in stats, e.g. "cpu", "gpu", "ane".
  var delegateName: String { get }
  func detect(_ buffer: CMSampleBuffer, timestampMs: Int, into result: BodyVisionPoseResult) throws
}

public struct BodyVisionBackendOptions {
  /// The `model` prop: "lite", "full", a file path, or nil when unset.
  public let model: String?
  /// `accuracy` performance mode is on.
  public let preferAccuracy: Bool
  public let preferGpu: Bool
}

/**
 Where a backend writes one frame's joints: normalized 0...1 coordinates in the buffer it was
 given. Joints follow the BlazePose order in `jointNames`. Leave the ones your model doesn't
 have alone and they stay untracked.
 */
public final class BodyVisionPoseResult {
  public static let jointNames = Joint.names
  let sample: BodySample

  init(_ sample: BodySample) {
    self.sample = sample
  }

  /// Set when a body was found. Setting any joint sets it too.
  public var present: Bool {
    get { sample.present }
    set { sample.present = newValue }
  }

  public func setJoint(_ index: Int, x: Double, y: Double, z: Double = 0, confidence: Double) {
    guard index >= 0 && index < Joint.count else { return }
    sample.present = true
    sample.x[index] = x
    sample.y[index] = y
    sample.z[index] = z
    sample.confidence[index] = confidence
  }

  /// False for a name that isn't in `jointNames`.
  @discardableResult
  public func setJoint(_ name: String, x: Double, y: Double, z: Double = 0, confidence: Double) -> Bool {
    guard let joint = Joint.named(name) else { return false }
    setJoint(joint.rawValue, x: x, y: y, z: z, confidence: confidence)
    return true
  }
}

public enum BodyVisionBackends {
  public typealias Factory = (BodyVisionBackendOptions) throws -> BodyVisionPoseBackend

  private static let lock = NSLock()
  private static var factories: [String: Factory] = ["mediapipe": MediaPipePoseBackend.make]

  /// Registers or replaces a backend. Call it before a view selects it, e.g. at app start.
  public static func register(_ name: String, factory: @escaping Factory) {
    lock.lock()
    factories[name] = factory
    lock.unlock()
  }

  public static var names: [String] {
    lock.lock()
    defer { lock.unlock() }
    return factories.keys.sorted()
  }

  static func factory(_ name: String) -> Factory? {
    lock.lock()
    defer { lock.unlock() }
    return factories[name]
  }
}

/**
 MediaPipe Pose Landmarker in VIDEO mode: synchronous, so the caller owns scheduling and
 backpressure, and results use MediaPipe's cross-frame tracking. Timestamps must increase.
 */
final class MediaPipePoseBackend: BodyVisionPoseBackend {
  let delegateName = "cpu"
  private let landmarker: PoseLandmarker
  private var lastTimestamp = -1

  static func make(_ options: BodyVisionBackendOptions) throws -> BodyVisionPoseBackend {
    let model = options.model ?? (options.preferAccuracy ? "full" : "lite")
    let path: String?
    switch model {
    case "lite": path = bundledPath("pose_landmarker_lite")
    case "full": path = bundledPath("pose_landmarker_full")
    default: path = model.hasPrefix("file://") ? URL(string: model)?.path : model
    }
    guard let path = path, FileManager.default.fileExists(atPath: path) else {
      throw BodyVisionException(.modelLoadFailed, "Pose model '\(model)' was not found.")
    }
    return try MediaPipePoseBackend(path: path)
  }

  init(path: String) throws {
    let options = PoseLandmarkerOptions()
    options.baseOptions.modelAssetPath = path
    options.baseOptions.delegate = .CPU
    options.runningMode = .video
    options.numPoses = 1
    options.minPoseDetectionConfidence = 0.5
    options.minPosePresenceConfidence = 0.5
    options.minTrackingConfidence = 0.5
    do {
      landmarker = try PoseLandmarker(options: options)
    } catch {
      throw BodyVisionException(.modelLoadFailed, "Could not load \((path as NSString).lastPathComponent): \(error.localizedDescription)", cause: error)
    }
  }

  func detect(_ buffer: CMSampleBuffer, timestampMs: Int, into result: BodyVisionPoseResult) throws {
    // VIDEO mode rejects non-increasing timestamps, which a camera restart can produce.
    let ts = max(timestampMs, lastTimestamp + 1)
    lastTimestamp = ts
    let image = try MPImage(sampleBuffer: buffer, orientation: .up)
    let detection = try landmarker.detect(videoFrame: image, timestampInMilliseconds: ts)
    guard let landmarks = detection.landmarks.first, landmarks.count >= Joint.count else { return }
    for i in 0..<Joint.count {
      let l = landmarks[i]
      result.setJoint(i, x: Double(l.x), y: Double(l.y), z: Double(l.z), confidence: l.visibility?.doubleValue ?? l.presence?.doubleValue ?? 1)
    }
  }

  private static func bundledPath(_ name: String) -> String? {
    let host = Bundle(for: MediaPipePoseBackend.self)
    let bundle = host.url(forResource: "ExpoBodyVisionModels", withExtension: "bundle").flatMap(Bundle.init(url:)) ?? host
    return bundle.path(forResource: name, ofType: "task")
  }
}
