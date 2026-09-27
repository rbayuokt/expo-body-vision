import Foundation

struct DrawCommand {
  enum Kind { case line, circle }
  var kind: Kind
  var x1: Double
  var y1: Double
  var x2: Double
  var y2: Double
  /// ARGB.
  var color: UInt32
  var width: Double
  var filled: Bool
}

/// Primitives in view points for one frame. Reused across frames and only grows.
final class DrawList {
  private(set) var commands: [DrawCommand] = []

  init() {
    commands.reserveCapacity(256)
  }

  func reset() {
    commands.removeAll(keepingCapacity: true)
  }

  func line(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, color: UInt32, width: Double) {
    commands.append(DrawCommand(kind: .line, x1: x1, y1: y1, x2: x2, y2: y2, color: color, width: width, filled: false))
  }

  func circle(_ x: Double, _ y: Double, radius: Double, color: UInt32, filled: Bool, width: Double = 0) {
    commands.append(DrawCommand(kind: .circle, x1: x, y1: y, x2: radius, y2: 0, color: color, width: width, filled: filled))
  }
}

struct SkeletonStyle: Equatable {
  var visible = true
  var boneColor: UInt32 = 0xE6FFFFFF
  var boneWidth: Double = 4
  var jointColor: UInt32 = 0xFF00E0A4
  var jointRadius: Double = 5
  var minConfidence: Double = 0.5
  /// Fades bones and joints with confidence instead of cutting them at `minConfidence`.
  var fadeWithConfidence = true
  var bones: [BoneStyle] = Skeleton.bones.map { _ in BoneStyle() }
  var joints: [JointStyle] = Joint.allCases.map { Skeleton.drawnJoints.contains($0) ? JointStyle() : JointStyle(visible: false) }
  var trails: [TrailStyle] = []
}

struct BoneStyle: Equatable {
  var visible = true
  var color: UInt32?
  var width: Double?
}

struct JointStyle: Equatable {
  var visible = true
  var color: UInt32?
  var radius: Double?
}

struct TrailStyle: Equatable {
  var joint: Joint
  var length: Double = 0.35
  var color: UInt32 = 0xFF00E0A4
  var width: Double = 6
}

enum Easing {
  static func outCubic(_ p: Double) -> Double {
    let q = 1 - clamp(p, 0, 1)
    return 1 - q * q * q
  }
}

func withAlpha(_ color: UInt32, _ factor: Double) -> UInt32 {
  let a = Double(color >> 24) * clamp(factor, 0, 1)
  return (UInt32(a.rounded()) << 24) | (color & 0x00FFFFFF)
}

/**
 Builds the frame's draw list from predicted joints at display time. Owns the trail history,
 so one builder belongs to one render loop.
 */
final class SceneBuilder {
  let list = DrawList()
  private var px = [Double](repeating: 0, count: Joint.count)
  private var py = [Double](repeating: 0, count: Joint.count)
  private var pc = [Double](repeating: 0, count: Joint.count)
  private var trails: [TrailHistory] = []

  func build(tracker: BodyTracker, style: SkeletonStyle, view: ViewTransform, targets: [TargetDefinition],
             hitTimes: [Double], reducedEffects: Bool, at time: Double) {
    list.reset()
    guard view.isValid else { return }
    drawTargets(targets, hitTimes: hitTimes, view: view, reducedEffects: reducedEffects, at: time)
    guard style.visible else { return }

    tracker.predict(at: time, x: &px, y: &py, confidence: &pc)
    for i in 0..<Joint.count where pc[i] > 0 {
      let p = view.point(x: px[i], y: py[i])
      px[i] = p.x
      py[i] = p.y
    }
    drawTrails(style, at: time)
    for (i, bone) in Skeleton.bones.enumerated() {
      let s = style.bones[i]
      guard s.visible else { continue }
      let a = bone.from.rawValue, b = bone.to.rawValue
      guard let alpha = visibility(min(pc[a], pc[b]), style) else { continue }
      list.line(px[a], py[a], px[b], py[b], color: withAlpha(s.color ?? style.boneColor, alpha), width: s.width ?? style.boneWidth)
    }
    for i in 0..<Joint.count {
      let s = style.joints[i]
      guard s.visible, let alpha = visibility(pc[i], style) else { continue }
      list.circle(px[i], py[i], radius: s.radius ?? style.jointRadius, color: withAlpha(s.color ?? style.jointColor, alpha), filled: true)
    }
  }

  private func visibility(_ confidence: Double, _ style: SkeletonStyle) -> Double? {
    guard confidence >= style.minConfidence else { return nil }
    guard style.fadeWithConfidence else { return 1 }
    return 0.35 + 0.65 * clamp((confidence - style.minConfidence) / max(1 - style.minConfidence, 1e-3), 0, 1)
  }

  private func drawTrails(_ style: SkeletonStyle, at time: Double) {
    if trails.count != style.trails.count || zip(trails, style.trails).contains(where: { $0.style != $1 }) {
      trails = style.trails.map { TrailHistory(style: $0) }
    }
    for trail in trails {
      let j = trail.style.joint.rawValue
      if pc[j] >= style.minConfidence {
        trail.add(x: px[j], y: py[j], at: time)
      }
      trail.draw(into: list, at: time)
    }
  }

  private func drawTargets(_ targets: [TargetDefinition], hitTimes: [Double], view: ViewTransform, reducedEffects: Bool, at time: Double) {
    for (i, target) in targets.enumerated() where target.style.visible {
      let s = target.style
      let cx = target.x * view.width, cy = target.y * view.height
      let r = target.radius * view.shortSide
      let p = i < hitTimes.count ? (time - hitTimes[i]) / s.effectDuration : 1
      guard p >= 0 && p < 1 else {
        list.circle(cx, cy, radius: r, color: s.color, filled: s.filled, width: s.lineWidth)
        continue
      }
      let e = Easing.outCubic(p)
      list.circle(cx, cy, radius: r * (1 + 0.35 * e), color: withAlpha(s.hitColor, 1 - p * 0.6), filled: s.filled, width: s.lineWidth * (1 + e))
      let count = reducedEffects ? s.particles / 2 : s.particles
      for k in 0..<count {
        let angle = Double(k) / Double(count) * 2 * .pi + Double(i) * 0.7
        let d = r * (1 + 1.2 * e)
        list.circle(cx + cos(angle) * d, cy + sin(angle) * d, radius: max(0.5, 4 * (1 - p)), color: withAlpha(s.hitColor, 1 - p), filled: true)
      }
    }
  }
}

private final class TrailHistory {
  let style: TrailStyle
  private var xs = [Double](repeating: 0, count: 64)
  private var ys = [Double](repeating: 0, count: 64)
  private var ts = [Double](repeating: 0, count: 64)
  private var head = 0
  private var count = 0

  init(style: TrailStyle) {
    self.style = style
  }

  func add(x: Double, y: Double, at t: Double) {
    head = (head + 1) % xs.count
    xs[head] = x
    ys[head] = y
    ts[head] = t
    count = min(count + 1, xs.count)
  }

  func draw(into list: DrawList, at time: Double) {
    guard count > 1 else { return }
    var i = head
    for _ in 1..<count {
      let prev = (i - 1 + xs.count) % xs.count
      let age = time - ts[i]
      guard age < style.length else { break }
      let fade = 1 - age / style.length
      list.line(xs[prev], ys[prev], xs[i], ys[i], color: withAlpha(style.color, fade), width: style.width * max(fade, 0.2))
      i = prev
    }
  }
}
