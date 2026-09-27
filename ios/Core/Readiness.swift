import Foundation

enum Framing: String {
  case fullBody, upperBody
  /// Side-on on the floor (push-ups, planks). Wants a landscape view.
  case floor
}

struct ReadinessParams: Equatable {
  var framing = Framing.fullBody
  /// Nose to ankles (full body) or nose to hips (upper body) as a fraction of view height.
  /// Shoulder to ankle as a fraction of view width for `floor`.
  var minBodyHeight: Double?
  /// Joints closer than this to a view edge count as out of frame.
  var edgeMargin = 0.02
  /// Allowed distance of the body's center from the view's center, as a fraction of its width.
  var centerTolerance = 0.18
  var minConfidence = 0.5
  /// Mean confidence below this reads as poor lighting or occlusion.
  var lowVisibility = 0.65
  /// Joint speed in view short-sides per second that still counts as standing still.
  var stillSpeed = 0.25
  /// A new state must hold this long before it's reported.
  var settle = 0.3

  var resolvedMinBodyHeight: Double {
    minBodyHeight ?? (framing == .upperBody ? 0.3 : framing == .floor ? 0.3 : 0.45)
  }
}

enum ReadinessIssue: String {
  case rotateToLandscape, noBody, getIntoPosition, tooClose, feetHidden, headHidden, handsHidden, tooFar, moveLeft, moveRight, lowVisibility, moving
}

/**
 Whether the user is positioned for tracking, judged in view space so the preview's crop and
 mirroring count. `moveLeft`/`moveRight` are screen directions. Reports only settled changes.
 */
final class ReadinessMonitor {
  let params: ReadinessParams
  private(set) var issue: ReadinessIssue?
  private var reported = false
  private var candidate: ReadinessIssue?
  private var hasCandidate = false
  private var candidateSince: Double = 0

  private static let head: [Joint] = [.nose]
  private static let torso: [Joint] = [.leftShoulder, .rightShoulder, .leftHip, .rightHip]
  private static let hands: [Joint] = [.leftWrist, .rightWrist]
  private static let feet: [Joint] = [.leftAnkle, .rightAnkle]
  private static let legs: [Joint] = [.leftKnee, .rightKnee]

  init(_ params: ReadinessParams) {
    self.params = params
  }

  var status: String {
    guard let issue = issue else { return "ready" }
    return issue == .noBody ? "noBody" : "adjusting"
  }

  func update(_ tracker: BodyTracker, view: ViewTransform, at t: Double) -> EngineEvent? {
    let next: ReadinessIssue?
    if !view.isValid {
      next = .noBody
    } else if params.framing == .floor && view.height > view.width {
      next = .rotateToLandscape
    } else {
      next = params.framing == .floor ? evaluateFloor(tracker, view) : evaluate(tracker, view)
    }
    if !hasCandidate || next != candidate {
      hasCandidate = true
      candidate = next
      candidateSince = t
    }
    guard t - candidateSince >= params.settle, !reported || candidate != issue else { return nil }
    reported = true
    issue = candidate
    return EngineEvent("readiness", t, ["status": status, "issue": issue?.rawValue ?? NSNull(), "mirrored": view.mirrored])
  }

  func reset() {
    issue = nil
    reported = false
    hasCandidate = false
  }

  private func position(_ tracker: BodyTracker, _ view: ViewTransform, _ j: Joint) -> (x: Double, y: Double) {
    let v = view.point(x: tracker.x(j.rawValue), y: tracker.y(j.rawValue))
    return (v.x / view.width, v.y / view.height)
  }

  private func inFrame(_ tracker: BodyTracker, _ view: ViewTransform, _ j: Joint) -> Bool {
    guard tracker.confidence(j.rawValue) >= params.minConfidence else { return false }
    let q = position(tracker, view, j)
    let m = params.edgeMargin
    return q.x >= m && q.x <= 1 - m && q.y >= m && q.y <= 1 - m
  }

  /// Lighting, then stillness, over `joints`.
  private func settledIssue(_ tracker: BodyTracker, _ view: ViewTransform, _ joints: [Joint]) -> ReadinessIssue? {
    let meanConfidence = joints.map { tracker.confidence($0.rawValue) }.reduce(0, +) / Double(joints.count)
    if meanConfidence < params.lowVisibility { return .lowVisibility }
    let scale = view.displayedSize
    for j in joints {
      let vx = tracker.velocityX(j.rawValue) * scale.width, vy = tracker.velocityY(j.rawValue) * scale.height
      if hypot(vx, vy) / view.shortSide > params.stillSpeed { return .moving }
    }
    return nil
  }

  private func evaluate(_ tracker: BodyTracker, _ view: ViewTransform) -> ReadinessIssue? {
    guard tracker.visible else { return .noBody }
    let p = params
    func position(_ j: Joint) -> (x: Double, y: Double) { self.position(tracker, view, j) }
    func allIn(_ joints: [Joint]) -> Bool { joints.allSatisfy { inFrame(tracker, view, $0) } }

    guard allIn(Self.torso) else { return .tooClose }
    let hipY = (position(.leftHip).y + position(.rightHip).y) / 2
    let headHidden = !allIn(Self.head)
    let feetHidden = p.framing == .fullBody && !(allIn(Self.feet) && allIn(Self.legs))
    if headHidden && feetHidden { return .tooClose }
    if feetHidden {
      // Head to hips alone filling most of the frame means too close, not a camera aimed too high.
      return hipY - position(.nose).y > 0.45 ? .tooClose : .feetHidden
    }
    if headHidden { return .headHidden }
    if !allIn(Self.hands) { return .handsHidden }

    let bottom = p.framing == .fullBody ? (position(.leftAnkle).y + position(.rightAnkle).y) / 2 : hipY
    if bottom - position(.nose).y < p.resolvedMinBodyHeight { return .tooFar }

    let centerX = (position(.leftShoulder).x + position(.rightShoulder).x + position(.leftHip).x + position(.rightHip).x) / 4
    if centerX < 0.5 - p.centerTolerance { return .moveRight }
    if centerX > 0.5 + p.centerTolerance { return .moveLeft }

    return settledIssue(tracker, view, Self.head + Self.torso + Self.hands + (p.framing == .fullBody ? Self.feet : []))
  }

  /// Side-on on the floor: the far side is often hidden, so the better tracked side decides.
  private func evaluateFloor(_ tracker: BodyTracker, _ view: ViewTransform) -> ReadinessIssue? {
    guard tracker.visible else { return .noBody }
    let left: [Joint] = [.leftShoulder, .leftHip, .leftKnee, .leftAnkle, .leftWrist]
    let side = [left, left.map(\.mirrored)].max {
      $0.map { tracker.confidence($0.rawValue) }.min()! < $1.map { tracker.confidence($0.rawValue) }.min()!
    }!
    guard side.allSatisfy({ inFrame(tracker, view, $0) }) else { return .tooClose }
    let shoulder = position(tracker, view, side[0]), hip = position(tracker, view, side[1]), ankle = position(tracker, view, side[3])
    // Angle of shoulder to ankle from horizontal, in view points.
    let dx = abs(ankle.x - shoulder.x) * view.width, dy = abs(ankle.y - shoulder.y) * view.height
    if atan2(dy, dx) * 180 / .pi > 40 { return .getIntoPosition }
    if abs(ankle.x - shoulder.x) < params.resolvedMinBodyHeight { return .tooFar }
    let centerX = (shoulder.x + hip.x + ankle.x) / 3
    if centerX < 0.5 - params.centerTolerance { return .moveRight }
    if centerX > 0.5 + params.centerTolerance { return .moveLeft }
    return settledIssue(tracker, view, side)
  }
}
