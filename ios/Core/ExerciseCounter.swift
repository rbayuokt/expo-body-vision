import Foundation

struct ExerciseDefinition: Equatable {
  let id: String
  /// Large at the top of the movement, small at the bottom (e.g. elbow or knee angle).
  let metric: Metric
  let top: Double
  let bottom: Double
  var hysteresis: Double = 10
  var minRep: Double = 0.4
  var maxRep: Double = 8
  var lossGrace: Double = 0.4
  var minConfidence: Double = 0.5
  /// Form requirements. Unmeasurable counts as met, so a joint out of frame doesn't void a rep.
  var requires: [Condition] = []
  /// Count peaks instead of full cycles, see `updatePeaks`.
  var peak = false
}

enum ExercisePhase: String {
  case ready, top, descending, bottom, ascending
}

/**
 ready -> top -> descending -> bottom -> ascending -> top (rep). Thresholds use hysteresis so
 noise at a threshold can't flip phases, and brief tracking loss holds the phase for `lossGrace`.
 */
final class ExerciseCounter {
  let definition: ExerciseDefinition
  private(set) var phase = ExercisePhase.ready
  private(set) var count = 0
  private var repStart: Double = 0
  private var lostSince: Double?
  // Peak mode, per side: armed waits for a rise, `extreme` is the low while armed, the high after.
  private var armed = [true, true]
  private var extreme = [Double.infinity, Double.infinity]
  private var lastPeak = -Double.infinity

  init(_ definition: ExerciseDefinition) {
    self.definition = definition
  }

  func reset(keepCount: Bool = false) {
    phase = .ready
    lostSince = nil
    armed = [true, true]
    extreme = [.infinity, .infinity]
    lastPeak = -.infinity
    if !keepCount { count = 0 }
  }

  private var midRep: Bool {
    phase == .descending || phase == .bottom || phase == .ascending
  }

  func update(_ g: BodyGeometry, at t: Double, bodyId: Int, emit: (EngineEvent) -> Void) {
    let d = definition
    if d.peak {
      updatePeaks(g, at: t, bodyId: bodyId, emit: emit)
      return
    }
    guard let value = d.metric.measure(g, minConfidence: d.minConfidence) else {
      let since = lostSince ?? t
      lostSince = since
      if phase != .ready && t - since >= d.lossGrace {
        abandon(t, reason: "lost", emit)
      }
      return
    }
    lostSince = nil

    if evaluateAll(d.requires, g, minConfidence: d.minConfidence, active: midRep) == false {
      if phase != .ready { abandon(t, reason: "form", emit) }
      return
    }
    if midRep && t - repStart > d.maxRep {
      abandon(t, reason: "too-slow", emit)
      return
    }

    switch phase {
    case .ready:
      if value >= d.top { move(to: .top, t, emit) }
    case .top:
      if value < d.top - d.hysteresis {
        repStart = t
        move(to: .descending, t, emit)
      }
    case .descending:
      if value <= d.bottom {
        move(to: .bottom, t, emit)
      } else if value >= d.top {
        reject(t, reason: "incomplete", emit)
        move(to: .top, t, emit)
      }
    case .bottom:
      if value > d.bottom + d.hysteresis { move(to: .ascending, t, emit) }
    case .ascending:
      if value >= d.top {
        let duration = t - repStart
        if duration < d.minRep {
          reject(t, reason: "too-fast", emit)
        } else {
          count += 1
          emit(EngineEvent("repCompleted", t, ["exercise": d.id, "bodyId": bodyId, "count": count, "durationMs": duration * 1000]))
        }
        move(to: .top, t, emit)
      } else if value <= d.bottom {
        move(to: .bottom, t, emit)
      }
    }
  }

  /**
   Counts each rise of at least `top - bottom` that reaches `top`, and re-arms after an equal
   drop. For fast strikes like punches, where a full cycle is often not sampled. A mirrored metric
   watches both sides at once. Peaks closer than `minRep` are one movement.
   */
  private func updatePeaks(_ g: BodyGeometry, at t: Double, bodyId: Int, emit: (EngineEvent) -> Void) {
    let d = definition
    if evaluateAll(d.requires, g, minConfidence: d.minConfidence, active: false) == false {
      reset(keepCount: true)
      return
    }
    let rise = d.top - d.bottom
    for (i, joints) in d.metric.sides.enumerated() {
      guard let v = d.metric.measure(g, joints, d.minConfidence) else { continue }
      if armed[i] {
        extreme[i] = min(extreme[i], v)
        guard v >= d.top, v - extreme[i] >= rise else { continue }
        armed[i] = false
        extreme[i] = v
        guard t - lastPeak >= d.minRep else { continue }
        var payload: [String: Any] = ["exercise": d.id, "bodyId": bodyId, "count": count + 1, "durationMs": lastPeak.isFinite ? (t - lastPeak) * 1000 : 0, "joint": joints[joints.count - 1].name]
        let name = joints[0].name
        if name.hasPrefix("left") { payload["side"] = "left" } else if name.hasPrefix("right") { payload["side"] = "right" }
        count += 1
        lastPeak = t
        emit(EngineEvent("repCompleted", t, payload))
      } else {
        extreme[i] = max(extreme[i], v)
        if extreme[i] - v >= rise {
          armed[i] = true
          extreme[i] = v
        }
      }
    }
  }

  private func abandon(_ t: Double, reason: String, _ emit: (EngineEvent) -> Void) {
    if midRep { reject(t, reason: reason, emit) }
    move(to: .ready, t, emit)
  }

  private func reject(_ t: Double, reason: String, _ emit: (EngineEvent) -> Void) {
    emit(EngineEvent("repRejected", t, ["exercise": definition.id, "reason": reason]))
  }

  private func move(to next: ExercisePhase, _ t: Double, _ emit: (EngineEvent) -> Void) {
    guard next != phase else { return }
    phase = next
    emit(EngineEvent("exercisePhase", t, ["exercise": definition.id, "phase": next.rawValue]))
  }
}
