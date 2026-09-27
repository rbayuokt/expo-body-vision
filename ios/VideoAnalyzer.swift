import AVFoundation
import QuartzCore

/**
 Runs a video file through a pose backend and the engine as fast as the phone allows, with the
 same rules and events as the live camera. Targets are hit-tested against the whole frame.
 */
final class VideoAnalyzer {
  private let uri: String
  private let config: [String: Any]
  private let options: [String: Any]

  init(uri: String, config: [String: Any], options: [String: Any]) {
    self.uri = uri
    self.config = config
    self.options = options
  }

  func run() throws -> [String: Any] {
    let engineConfig: EngineConfig
    do {
      engineConfig = try ConfigParser.engine(config)
    } catch let error as ConfigError {
      throw BodyVisionException(error.path.hasPrefix("rules") ? .invalidRule : .invalidConfig, error.description)
    }
    let url = uri.hasPrefix("file://") ? URL(string: uri) : URL(fileURLWithPath: uri)
    guard let url = url else { throw BodyVisionException(.videoReadFailed, "Not a file URL: \(uri)") }
    let asset = AVURLAsset(url: url)
    guard let track = asset.tracks(withMediaType: .video).first else {
      throw BodyVisionException(.videoReadFailed, "The file has no video track.")
    }

    // A video composition applies the track's transform, so portrait phone videos come out upright.
    let composition = AVMutableVideoComposition(propertiesOf: asset)
    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: asset)
    } catch {
      throw BodyVisionException(.videoReadFailed, "Could not open the video: \(error.localizedDescription)", cause: error)
    }
    let output = AVAssetReaderVideoCompositionOutput(
      videoTracks: [track],
      videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    )
    output.videoComposition = composition
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { throw BodyVisionException(.videoReadFailed, "Could not read the video track.") }
    reader.add(output)

    let model = config["model"] as? String
    let name = config["backend"] as? String ?? "mediapipe"
    guard let factory = BodyVisionBackends.factory(name) else {
      throw BodyVisionException(.modelLoadFailed, "No pose backend is registered as '\(name)'.")
    }
    let backend = try factory(BodyVisionBackendOptions(model: model, preferAccuracy: engineConfig.performance == .accuracy, preferGpu: false))

    let width = Double(composition.renderSize.width), height = Double(composition.renderSize.height)
    let engine = BodyEngine()
    engine.configure(engineConfig)
    engine.view = ViewTransform(width: width, height: height, mirrored: false, cover: true, imageAspect: width / height)
    let targetFps = (options["fps"] as? Double) ?? 30
    let wantLandmarks = options["landmarks"] as? Bool ?? false
    let sample = BodySample()
    var events: [[String: Any]] = []
    var landmarks: [[String: Any]] = []
    var analyzed = 0
    var inferenceMs = 0.0
    var lastTime = -Double.infinity

    guard reader.startReading() else {
      throw BodyVisionException(.videoReadFailed, reader.error?.localizedDescription ?? "Could not start reading the video.")
    }
    while let buffer = output.copyNextSampleBuffer() {
      let t = CMSampleBufferGetPresentationTimeStamp(buffer).seconds
      guard t.isFinite, t - lastTime >= 1 / targetFps - 0.001 else { continue }
      lastTime = t
      sample.clear(timestamp: t, aspect: width / height)
      let start = CACurrentMediaTime()
      do {
        try backend.detect(buffer, timestampMs: Int(t * 1000), into: BodyVisionPoseResult(sample))
      } catch {
        sample.clear(timestamp: t, aspect: width / height)
      }
      inferenceMs += (CACurrentMediaTime() - start) * 1000
      if wantLandmarks {
        var points: [Double] = []
        points.reserveCapacity(Joint.count * 3)
        for i in 0..<Joint.count {
          points.append(sample.x[i])
          points.append(sample.y[i])
          points.append(sample.present ? sample.confidence[i] : 0)
        }
        landmarks.append(["timestamp": t * 1000, "points": points])
      }
      engine.process(sample)
      if let batch = engine.events.takeBatch(now: t) {
        events += batch.events.map(\.dictionary)
        engine.events.acknowledge(batch.sequence)
      }
      analyzed += 1
    }
    if reader.status == .failed {
      throw BodyVisionException(.videoReadFailed, reader.error?.localizedDescription ?? "Reading the video failed.")
    }

    var result: [String: Any] = [
      "durationMs": asset.duration.seconds * 1000,
      "width": width,
      "height": height,
      "framesAnalyzed": analyzed,
      "sourceFps": Double(track.nominalFrameRate),
      "backend": name,
      "delegate": backend.delegateName,
      "averageInferenceMs": analyzed > 0 ? inferenceMs / Double(analyzed) : 0,
      "events": events
    ]
    if wantLandmarks { result["landmarks"] = landmarks }
    return result
  }
}
