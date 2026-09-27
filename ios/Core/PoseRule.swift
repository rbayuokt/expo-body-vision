import Foundation

struct PoseRuleDefinition: Equatable {
  let id: String
  let conditions: [Condition]
  var hold: Double = 0.3
  var exitGrace: Double = 0.15
  var minConfidence: Double = 0.5
}

/// idle -> pending (conditions hold) -> active after `hold`. Exits once failing for `exitGrace`.
final class PoseRule {
  let definition: PoseRuleDefinition
  private(set) var active = false
  private var pendingSince: Double?
  private var activeSince: Double = 0
  private var failingSince: Double?

  init(_ definition: PoseRuleDefinition) {
    self.definition = definition
  }

  func reset() {
    active = false
    pendingSince = nil
    failingSince = nil
  }

  func update(_ g: BodyGeometry, at t: Double, bodyId: Int, emit: (EngineEvent) -> Void) {
    let passing = evaluateAll(definition.conditions, g, minConfidence: definition.minConfidence, active: active) == true
    if active {
      if passing {
        failingSince = nil
        return
      }
      let since = failingSince ?? t
      failingSince = since
      if t - since >= definition.exitGrace {
        active = false
        failingSince = nil
        pendingSince = nil
        emit(EngineEvent("poseExited", t, ["pose": definition.id, "bodyId": bodyId, "durationMs": (since - activeSince) * 1000]))
      }
      return
    }
    guard passing else {
      pendingSince = nil
      return
    }
    let since = pendingSince ?? t
    pendingSince = since
    if t - since >= definition.hold {
      active = true
      activeSince = since
      emit(EngineEvent("poseEntered", t, ["pose": definition.id, "bodyId": bodyId]))
    }
  }
}
