import Foundation

enum MetricKind: String {
  case angle, inclination, distance, above

  var jointCount: Int {
    self == .angle ? 3 : 2
  }

  var isAngular: Bool {
    self == .angle || self == .inclination
  }
}

/**
 A measurement on the body. Distances and `above` are in body-scale units (torso lengths).
 With `mirror`, the left/right-swapped joints are measured too and the better tracked side wins.
 */
struct Metric: Equatable {
  let kind: MetricKind
  let joints: [Joint]
  let mirror: Bool

  /// The joints per side: just `joints`, or with `mirror` also the swapped set.
  var sides: [[Joint]] {
    mirror ? [joints, joints.map(\.mirrored)] : [joints]
  }

  /// Value, or nil when the joints aren't tracked.
  func measure(_ g: BodyGeometry, minConfidence: Double) -> Double? {
    guard mirror else { return measure(g, joints, minConfidence) }
    let left = measure(g, joints, minConfidence)
    let right = measure(g, joints.map(\.mirrored), minConfidence)
    switch (left, right) {
    case let (l?, r?):
      return sideConfidence(g, joints) >= sideConfidence(g, joints.map(\.mirrored)) ? l : r
    default:
      return left ?? right
    }
  }

  private func sideConfidence(_ g: BodyGeometry, _ joints: [Joint]) -> Double {
    joints.map { g.confidence($0) }.min() ?? 0
  }

  func measure(_ g: BodyGeometry, _ j: [Joint], _ minConfidence: Double) -> Double? {
    for joint in j where g.confidence(joint) < minConfidence {
      return nil
    }
    switch kind {
    case .angle: return g.angle(j[0], j[1], j[2])
    case .inclination: return g.inclination(j[0], j[1])
    case .distance:
      guard let s = g.scale(minConfidence: minConfidence) else { return nil }
      return g.distance(j[0], j[1]) / s
    case .above:
      guard let s = g.scale(minConfidence: minConfidence) else { return nil }
      return (g.point(j[1]).y - g.point(j[0]).y) / s
    }
  }
}

struct Condition: Equatable {
  let metric: Metric
  let min: Double?
  let max: Double?
  /// Added to the range while the owning rule is active, so it doesn't flicker at the edge.
  let hysteresis: Double

  /// true/false, or nil when it can't be measured.
  func evaluate(_ g: BodyGeometry, minConfidence: Double, active: Bool) -> Bool? {
    guard let v = metric.measure(g, minConfidence: minConfidence) else { return nil }
    let slack = active ? hysteresis : 0
    if let lo = min, v < lo - slack { return false }
    if let hi = max, v > hi + slack { return false }
    return true
  }
}

/// All-of semantics: any false wins over unknown.
func evaluateAll(_ conditions: [Condition], _ g: BodyGeometry, minConfidence: Double, active: Bool) -> Bool? {
  var unknown = false
  for c in conditions {
    switch c.evaluate(g, minConfidence: minConfidence, active: active) {
    case false?: return false
    case nil: unknown = true
    default: break
    }
  }
  return unknown ? nil : true
}
