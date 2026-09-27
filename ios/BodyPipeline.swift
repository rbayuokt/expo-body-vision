import AVFoundation
import QuartzCore
import UIKit

/**
 Threads: camera frames and inference on the camera's video queue (inline, so AVFoundation
 drops late frames instead of queueing them), replay on its own queue, drawing and event
 delivery on the main thread's display link. `lock` guards the engine and stats and is only
 held for bookkeeping. Inference and drawing happen outside it. JS is never on this path.
 */
final class BodyPipeline: CameraSourceDelegate {
  let camera = CameraSource()
  private(set) lazy var video = VideoPlayerSource(
    queue: camera.videoQueue,
    deliver: { [weak self] in self?.process($0) },
    ended: { [weak self] in
      guard let self = self else { return }
      self.locked { self.engine.events.push(EngineEvent("videoEnded", CACurrentMediaTime(), [:])) }
    }
  )
  private let engine = BodyEngine()
  private let lock = NSLock()
  private var stats = StatsWindow()
  private var telemetry = Telemetry()

  // Video queue.
  private var backend: BodyVisionPoseBackend?
  private var backendKey: String?
  private var failedKey: String?
  private let sample = BodySample()
  private var lastInferenceStart: Double = 0
  private var lastErrorAt: Double = -.infinity

  // Main thread.
  private var replay: ReplaySource?

  // Lock.
  private var cameraReadyPending = true
  private var backendName = "mediapipe"
  private var modelSpec: String?
  private var activeBackend = (name: "mediapipe", delegate: "cpu")
  private var landmarkScratch = (x: [Double](repeating: 0, count: Joint.count), y: [Double](repeating: 0, count: Joint.count), c: [Double](repeating: 0, count: Joint.count))

  struct Telemetry {
    var stats = false
    var landmarks = false
    var landmarksInterval: Double = 0.1
    var lastLandmarks: Double = 0
  }

  init() {
    camera.delegate = self
    NotificationCenter.default.addObserver(self, selector: #selector(thermalStateChanged), name: ProcessInfo.thermalStateDidChangeNotification, object: nil)
    thermalStateChanged()
  }

  func shutdown() {
    NotificationCenter.default.removeObserver(self)
    camera.shutdown()
    video.stop()
    replay?.stop()
    replay = nil
  }

  private func locked<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }

  // MARK: - Configuration (main thread)

  func configure(_ config: EngineConfig, style: SkeletonStyle) {
    locked {
      let modeChanged = config.performance != engine.config.performance
      engine.configure(config)
      engine.style = style
      if modeChanged { pushPerformance(at: CACurrentMediaTime()) }
    }
  }

  /// `model` "pending" pauses inference while JS resolves a bundled model file.
  func setBackend(_ name: String, model: String?) {
    locked {
      backendName = name
      modelSpec = model
    }
  }

  func setTelemetry(stats: Bool, landmarks: Bool, intervalMs: Double) {
    locked {
      telemetry.stats = stats
      telemetry.landmarks = landmarks
      telemetry.landmarksInterval = max(intervalMs, 16) / 1000
    }
  }

  func setView(width: Double, height: Double, mirrored: Bool, cover: Bool) {
    locked {
      engine.view.width = width
      engine.view.height = height
      engine.view.mirrored = mirrored
      engine.view.cover = cover
    }
  }

  /// Switches between camera, video and replay. Any change voids current tracks.
  func setSource(active: Bool, front: Bool, replayInput: [String: Any]?, videoInput: [String: Any]?) {
    replay?.stop()
    replay = nil
    locked {
      engine.resetTracking(at: CACurrentMediaTime())
      cameraReadyPending = true
    }
    if let uri = videoInput?["uri"] as? String {
      camera.update(running: false, front: front)
      // "pending": JS is still copying a bundled file out.
      guard uri != "pending" else {
        video.stop()
        return
      }
      guard video.load(uri, loop: videoInput?["loop"] as? Bool ?? false) else {
        pushError(.videoReadFailed, "Not a file URL: \(uri)")
        return
      }
      video.setPlaying(active)
      return
    }
    video.stop()
    guard active else {
      camera.update(running: false, front: front)
      return
    }
    if let input = replayInput {
      camera.update(running: false, front: front)
      guard ReplaySource.isEnabled else {
        pushError(.testInputDisabled, "testInput needs the config plugin's enableTestInput option.")
        return
      }
      guard let source = ReplaySource(input, deliver: { [weak self] in self?.processReplay($0) }) else {
        pushError(.invalidConfig, "testInput must have frames in rows of \(ReplaySource.rowLength) and a positive aspect.")
        return
      }
      replay = source
      source.start()
      locked { engine.events.push(EngineEvent("cameraReady", CACurrentMediaTime(), ["width": 0, "height": 0, "backend": "replay", "delegate": "none"])) }
      return
    }
    camera.update(running: true, front: front)
  }

  func startCalibration(durationMs: Double) {
    locked { engine.startCalibration(duration: durationMs / 1000, at: CACurrentMediaTime()) }
  }

  func resetExercise(_ id: String?) {
    locked { engine.resetExercise(id) }
  }

  func acknowledge(_ sequence: Int) {
    locked { engine.events.acknowledge(sequence) }
  }

  func pushError(_ code: BodyVisionErrorCode, _ message: String) {
    locked { engine.events.push(EngineEvent("error", CACurrentMediaTime(), ["code": code.rawValue, "message": message])) }
  }

  // MARK: - Frames

  func camera(_ camera: CameraSource, didOutput buffer: CMSampleBuffer) {
    process(buffer)
  }

  /// Video queue, for camera and video frames alike.
  private func process(_ buffer: CMSampleBuffer) {
    let now = CACurrentMediaTime()
    let (fps, request, readyPending) = locked { () -> (Double, BackendRequest, Bool) in
      stats.cameraFrames += 1
      let ready = cameraReadyPending
      cameraReadyPending = false
      let request = BackendRequest(name: backendName, model: modelSpec, accuracy: engine.config.performance == .accuracy)
      return (engine.governor.inferenceFps, request, ready)
    }
    guard let image = CMSampleBufferGetImageBuffer(buffer) else { return }
    let width = Double(CVPixelBufferGetWidth(image)), height = Double(CVPixelBufferGetHeight(image))
    guard request.model != "pending" else { return }
    // Small tolerance so a 30 fps camera isn't aliased down to 15 by frame-time jitter.
    guard now - lastInferenceStart >= 1 / fps - 0.004 else {
      locked { stats.droppedFrames += 1 }
      return
    }
    guard let backend = backend(for: request) else { return }
    if readyPending {
      locked { engine.events.push(EngineEvent("cameraReady", now, ["width": width, "height": height, "backend": request.name, "delegate": backend.delegateName])) }
    }
    lastInferenceStart = now

    let pts = CMSampleBufferGetPresentationTimeStamp(buffer)
    let captured = pts.isValid ? pts.seconds : now
    sample.clear(timestamp: captured, aspect: width / height)
    do {
      try backend.detect(buffer, timestampMs: Int(captured * 1000), into: BodyVisionPoseResult(sample))
    } catch {
      if now - lastErrorAt > 5 {
        lastErrorAt = now
        pushError(.inferenceFailed, (error as? BodyVisionException)?.reason ?? error.localizedDescription)
      }
      // A backend that keeps failing must still let the body time out instead of staying stale.
      sample.clear(timestamp: captured, aspect: width / height)
    }
    let latencyMs = (CACurrentMediaTime() - now) * 1000
    locked {
      engine.process(sample)
      stats.inferences += 1
      stats.inferenceMsSum += latencyMs
      if engine.governor.record(latencyMs: latencyMs, at: now) {
        pushPerformance(at: now)
      }
      publishLandmarks(at: captured)
    }
  }

  func cameraDidDropFrame(_ camera: CameraSource) {
    locked {
      stats.cameraFrames += 1
      stats.droppedFrames += 1
    }
  }

  func camera(_ camera: CameraSource, didFail code: BodyVisionErrorCode, message: String) {
    pushError(code, message)
  }

  private func processReplay(_ sample: BodySample) {
    locked {
      engine.process(sample)
      stats.cameraFrames += 1
      stats.inferences += 1
      publishLandmarks(at: sample.timestamp)
    }
  }

  private struct BackendRequest {
    let name: String
    let model: String?
    let accuracy: Bool

    var key: String { "\(name)|\(model ?? "")|\(accuracy)" }
  }

  private func backend(for request: BackendRequest) -> BodyVisionPoseBackend? {
    let key = request.key
    if backendKey == key, let b = backend { return b }
    guard failedKey != key else { return nil }
    backend = nil
    backendKey = nil
    guard let factory = BodyVisionBackends.factory(request.name) else {
      failedKey = key
      pushError(.modelLoadFailed, "No pose backend is registered as '\(request.name)'. Registered: \(BodyVisionBackends.names.joined(separator: ", ")).")
      return nil
    }
    do {
      let created = try factory(BodyVisionBackendOptions(model: request.model, preferAccuracy: request.accuracy, preferGpu: false))
      backend = created
      backendKey = key
      failedKey = nil
      locked { activeBackend = (request.name, created.delegateName) }
      return created
    } catch {
      failedKey = key
      pushError(.modelLoadFailed, (error as? BodyVisionException)?.reason ?? error.localizedDescription)
      return nil
    }
  }

  // MARK: - Display (main thread)

  /// Builds this frame's draw list and returns an event batch to deliver, if any.
  func renderFrame(into builder: SceneBuilder, displayTime: Double) -> EventBatch? {
    locked {
      engine.buildScene(builder, at: displayTime)
      let now = CACurrentMediaTime()
      stats.render(at: now, latency: engine.tracker.visible ? displayTime - engine.tracker.lastSampleTime : nil)
      if telemetry.stats, let snapshot = stats.snapshot(at: now) {
        var payload = snapshot
        payload["targetInferenceFps"] = engine.governor.inferenceFps
        payload["backend"] = replay != nil ? "replay" : activeBackend.name
        payload["delegate"] = replay != nil ? "none" : activeBackend.delegate
        payload["performanceMode"] = engine.config.performance.rawValue
        payload["thermalLevel"] = engine.governor.thermalLevel
        payload["bodyVisible"] = engine.tracker.visible
        engine.events.publish(EngineEvent("stats", now, payload))
      }
      return engine.events.takeBatch(now: now)
    }
  }

  // MARK: - Under the lock

  private func pushPerformance(at t: Double) {
    let g = engine.governor
    engine.events.push(EngineEvent("performanceChanged", t, [
      "mode": g.mode.rawValue,
      "inferenceFps": g.inferenceFps,
      "reducedEffects": g.reducedEffects,
      "thermalLevel": g.thermalLevel
    ]))
  }

  private func publishLandmarks(at t: Double) {
    guard telemetry.landmarks, engine.tracker.visible, t - telemetry.lastLandmarks >= telemetry.landmarksInterval else { return }
    telemetry.lastLandmarks = t
    let points = engine.landmarkPoints(at: t, scratchX: &landmarkScratch.x, scratchY: &landmarkScratch.y, scratchC: &landmarkScratch.c)
    engine.events.publish(EngineEvent("landmarks", t, ["bodyId": engine.tracker.bodyId, "points": points]))
  }

  @objc private func thermalStateChanged() {
    let level: Int
    switch ProcessInfo.processInfo.thermalState {
    case .nominal: level = 0
    case .fair: level = 1
    case .serious: level = 2
    case .critical: level = 3
    @unknown default: level = 0
    }
    let now = CACurrentMediaTime()
    locked {
      if engine.governor.setThermal(level, at: now) { pushPerformance(at: now) }
    }
  }
}

/// Per-second counters for the `stats` event.
struct StatsWindow {
  var cameraFrames = 0
  var droppedFrames = 0
  var inferences = 0
  var inferenceMsSum: Double = 0
  private var start: Double?
  private var renderFrames = 0
  private var lastRender: Double?
  private var intervals = [Double](repeating: 0, count: 240)
  private var intervalCount = 0
  private var latencySum: Double = 0
  private var latencyCount = 0

  mutating func render(at t: Double, latency: Double?) {
    if start == nil { start = t }
    renderFrames += 1
    if let last = lastRender, intervalCount < intervals.count {
      intervals[intervalCount] = t - last
      intervalCount += 1
    }
    lastRender = t
    if let latency = latency, latency >= 0, latency < 1 {
      latencySum += latency
      latencyCount += 1
    }
  }

  mutating func snapshot(at t: Double) -> [String: Any]? {
    guard let s = start, t - s >= 1 else { return nil }
    let span = t - s
    var sorted = Array(intervals[0..<intervalCount])
    sorted.sort()
    let p95 = sorted.isEmpty ? 0 : sorted[min(sorted.count - 1, Int(Double(sorted.count) * 0.95))]
    let out: [String: Any] = [
      "cameraFps": Double(cameraFrames) / span,
      "inferenceFps": Double(inferences) / span,
      "inferenceMs": inferences > 0 ? inferenceMsSum / Double(inferences) : 0,
      "renderFps": Double(renderFrames) / span,
      "frameIntervalP95Ms": p95 * 1000,
      "droppedFrames": droppedFrames,
      "latencyMs": latencyCount > 0 ? latencySum / Double(latencyCount) * 1000 : 0
    ]
    self = StatsWindow()
    start = t
    lastRender = t
    return out
  }
}
