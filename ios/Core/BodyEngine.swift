import Foundation

/**
 Tracking, rules, exercises, interaction and calibration for one view, driven by inference
 samples. Not thread-safe. The owner serializes access with one lock and keeps inference and
 drawing outside it.
 */
final class BodyEngine {
  let tracker = BodyTracker()
  let events = EventQueue()
  let interaction = InteractionEngine()
  private(set) var config = EngineConfig()
  private(set) var governor = PerformanceGovernor(mode: .auto)
  private(set) var poses: [PoseRule] = []
  private(set) var exercises: [ExerciseCounter] = []
  var style = SkeletonStyle()
  var view = ViewTransform()
  private(set) var calibratedScale: Double?
  private var calibrator: Calibrator?
  private(set) var readiness: ReadinessMonitor?

  var geometry: BodyGeometry {
    BodyGeometry(tracker: tracker, calibratedScale: calibratedScale)
  }

  func configure(_ next: EngineConfig) {
    tracker.configure(next.tracking)
    if next.performance != config.performance {
      governor = PerformanceGovernor(mode: next.performance)
    }
    // Unchanged definitions keep their state, so a style tweak doesn't reset a rep count.
    poses = next.poses.map { def in poses.first { $0.definition == def } ?? PoseRule(def) }
    exercises = next.exercises.map { def in exercises.first { $0.definition == def } ?? ExerciseCounter(def) }
    interaction.configure(next.targets)
    if next.calibration != config.calibration {
      calibratedScale = next.calibration
    }
    if next.readiness != readiness?.params {
      readiness = next.readiness.map(ReadinessMonitor.init)
    }
    config = next
  }

  func process(_ sample: BodySample) {
    let t = sample.timestamp
    view.imageAspect = sample.aspect
    let emit: (EngineEvent) -> Void = { [events] in events.push($0) }
    switch tracker.update(sample) {
    case .detected:
      emit(EngineEvent("bodyDetected", t, ["bodyId": tracker.bodyId]))
    case .lost:
      emit(EngineEvent("bodyLost", t, ["bodyId": tracker.bodyId]))
      interaction.reset()
    case .none:
      break
    }
    let g = geometry
    let id = tracker.bodyId
    for p in poses { p.update(g, at: t, bodyId: id, emit: emit) }
    for e in exercises { e.update(g, at: t, bodyId: id) { emit(placed($0)) } }
    interaction.update(tracker, view: view, at: t, bodyId: id, emit: emit)
    if let e = readiness?.update(tracker, view: view, at: t) { emit(e) }

    if let c = calibrator {
      switch c.update(g, at: t) {
      case .pending:
        break
      case .completed(let measurements):
        calibrator = nil
        calibratedScale = measurements["torsoLength"]
        emit(EngineEvent("calibrationCompleted", t, ["measurements": measurements]))
      case .failed(let reason):
        calibrator = nil
        emit(EngineEvent("calibrationFailed", t, ["reason": reason]))
      }
    }
  }

  /// Peak reps name the joint that moved. This adds where it is on screen, for effects.
  private func placed(_ event: EngineEvent) -> EngineEvent {
    guard view.isValid, let name = event.payload["joint"] as? String, let joint = Joint.named(name) else { return event }
    var e = event
    let p = view.point(x: tracker.x(joint.rawValue), y: tracker.y(joint.rawValue))
    e.payload["x"] = p.x
    e.payload["y"] = p.y
    return e
  }

  func startCalibration(duration: Double, at t: Double) {
    calibrator = Calibrator(duration: duration, at: t)
  }

  func clearCalibration() {
    calibrator = nil
    calibratedScale = nil
  }

  func resetExercise(_ id: String?) {
    for e in exercises where id == nil || e.definition.id == id {
      e.reset()
    }
  }

  /// Camera stopped, switched or the source changed: tracks and in-progress reps are void.
  func resetTracking(at t: Double) {
    if tracker.visible {
      events.push(EngineEvent("bodyLost", t, ["bodyId": tracker.bodyId]))
    }
    tracker.reset()
    interaction.reset()
    for p in poses { p.reset() }
    for e in exercises { e.reset(keepCount: true) }
    readiness?.reset()
  }

  func buildScene(_ builder: SceneBuilder, at time: Double) {
    builder.build(
      tracker: tracker,
      style: style,
      view: view,
      targets: interaction.targets,
      hitTimes: interaction.hitTimes,
      reducedEffects: governor.reducedEffects,
      at: time
    )
  }

  /// View-space points for the opt-in `landmarks` event: x, y, confidence per joint.
  func landmarkPoints(at time: Double, scratchX: inout [Double], scratchY: inout [Double], scratchC: inout [Double]) -> [Double] {
    tracker.predict(at: time, x: &scratchX, y: &scratchY, confidence: &scratchC)
    var out = [Double]()
    out.reserveCapacity(Joint.count * 3)
    for i in 0..<Joint.count {
      let p = view.isValid ? view.point(x: scratchX[i], y: scratchY[i]) : (scratchX[i], scratchY[i])
      out.append(p.0)
      out.append(p.1)
      out.append(scratchC[i])
    }
    return out
  }
}
