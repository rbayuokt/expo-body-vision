import Foundation

enum TargetMode: String {
  /// One event when a collider arrives, with a cooldown.
  case hit
  /// Enter and exit events while any collider overlaps.
  case zone
}

struct TargetDefinition: Equatable {
  let id: String
  /// Center as a fraction of the view's width and height.
  let x: Double
  let y: Double
  /// Fractions of the view's shorter side.
  let radius: Double
  var colliders: [Joint] = [.leftWrist, .rightWrist]
  var colliderRadius: Double = 0.03
  /// Collider speed in view short-sides per second.
  var minSpeed: Double = 0
  var cooldown: Double = 0.5
  var mode = TargetMode.hit
  var minConfidence: Double = 0.5
  var style = TargetStyle()
}

struct TargetStyle: Equatable {
  var color: UInt32 = 0xCCFFFFFF
  var hitColor: UInt32 = 0xFFFFD60A
  var lineWidth: Double = 3
  var filled = false
  var visible = true
  var particles = 12
  var effectDuration: Double = 0.45
}

/**
 Hit testing in view space. Each collider is tested as a swept circle between consecutive
 samples, so a fast hand that skips over a target between inference frames still hits it.
 */
final class InteractionEngine {
  private(set) var targets: [TargetDefinition] = []
  private var inside: [[Bool]] = []
  private var lastHit: [Double] = []
  private var previous = [(x: Double, y: Double)?](repeating: nil, count: Joint.count)
  private var previousTime: Double = 0
  /// Latest hit time per target for the renderer's effect.
  private(set) var hitTimes: [Double] = []

  func configure(_ targets: [TargetDefinition]) {
    let old = Dictionary(self.targets.enumerated().map { ($0.element.id, $0.offset) }, uniquingKeysWith: { a, _ in a })
    let oldInside = inside, oldHit = lastHit, oldTimes = hitTimes
    self.targets = targets
    inside = targets.map { t in old[t.id].map { oldInside[$0] } ?? Array(repeating: false, count: t.colliders.count) }
    lastHit = targets.map { t in old[t.id].map { oldHit[$0] } ?? -.infinity }
    hitTimes = targets.map { t in old[t.id].map { oldTimes[$0] } ?? -.infinity }
    for (i, t) in targets.enumerated() where inside[i].count != t.colliders.count {
      inside[i] = Array(repeating: false, count: t.colliders.count)
    }
  }

  func reset() {
    previous = Array(repeating: nil, count: Joint.count)
    for i in inside.indices {
      inside[i] = Array(repeating: false, count: inside[i].count)
    }
  }

  func update(_ tracker: BodyTracker, view: ViewTransform, at t: Double, bodyId: Int, emit: (EngineEvent) -> Void) {
    guard view.isValid, !targets.isEmpty else { return }
    let dt = t - previousTime
    let unit = view.shortSide
    var current = [(x: Double, y: Double)?](repeating: nil, count: Joint.count)

    for (ti, target) in targets.enumerated() {
      let center = (x: target.x * view.width, y: target.y * view.height)
      for (ci, joint) in target.colliders.enumerated() {
        let j = joint.rawValue
        guard tracker.confidence(j) >= target.minConfidence else {
          if inside[ti][ci] { leave(ti, ci, joint, t, emit) }
          continue
        }
        let p = current[j] ?? view.point(x: tracker.x(j), y: tracker.y(j))
        current[j] = p
        let reach = (target.radius + target.colliderRadius) * unit
        let from = previous[j] ?? p
        let crossed = segmentDistance(center, from, p) <= reach
        let overlapping = hypot(p.x - center.x, p.y - center.y) <= reach

        if crossed && !inside[ti][ci] {
          let speed = dt > 0 ? hypot(p.x - from.x, p.y - from.y) / dt / unit : 0
          switch target.mode {
          case .hit:
            if speed >= target.minSpeed && t - lastHit[ti] >= target.cooldown {
              lastHit[ti] = t
              hitTimes[ti] = t
              emit(EngineEvent("targetHit", t, ["target": target.id, "joint": joint.name, "bodyId": bodyId, "speed": speed, "x": center.x, "y": center.y]))
            }
          case .zone:
            if overlapping && !inside[ti].contains(true) {
              hitTimes[ti] = t
              emit(EngineEvent("zoneEntered", t, ["target": target.id, "joint": joint.name, "bodyId": bodyId]))
            }
          }
        }
        if overlapping {
          inside[ti][ci] = true
        } else if inside[ti][ci] {
          leave(ti, ci, joint, t, emit)
        }
      }
    }
    previous = current
    previousTime = t
  }

  private func leave(_ ti: Int, _ ci: Int, _ joint: Joint, _ t: Double, _ emit: (EngineEvent) -> Void) {
    inside[ti][ci] = false
    let target = targets[ti]
    if target.mode == .zone && !inside[ti].contains(true) {
      emit(EngineEvent("zoneExited", t, ["target": target.id, "joint": joint.name]))
    }
  }
}

/// Distance from `c` to the segment a-b.
func segmentDistance(_ c: (x: Double, y: Double), _ a: (x: Double, y: Double), _ b: (x: Double, y: Double)) -> Double {
  let dx = b.x - a.x, dy = b.y - a.y
  let len2 = dx * dx + dy * dy
  let k = len2 > 0 ? clamp(((c.x - a.x) * dx + (c.y - a.y) * dy) / len2, 0, 1) : 0
  return hypot(a.x + k * dx - c.x, a.y + k * dy - c.y)
}
