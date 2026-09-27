import Foundation

/**
 Measurements on the tracker's filtered joints. Points are in image-height units (x scaled by
 the aspect ratio) so angles are true angles whatever the camera resolution.
 */
struct BodyGeometry {
  let tracker: BodyTracker
  /// Calibrated torso length. The live one is used when nil.
  var calibratedScale: Double?

  func confidence(_ j: Joint) -> Double {
    tracker.confidence(j.rawValue)
  }

  func point(_ j: Joint) -> (x: Double, y: Double) {
    (tracker.x(j.rawValue) * tracker.aspect, tracker.y(j.rawValue))
  }

  /// Interior angle at `b`, 0...180 degrees.
  func angle(_ a: Joint, _ b: Joint, _ c: Joint) -> Double {
    let pa = point(a), pb = point(b), pc = point(c)
    let v1 = (pa.x - pb.x, pa.y - pb.y)
    let v2 = (pc.x - pb.x, pc.y - pb.y)
    let cross = v1.0 * v2.1 - v1.1 * v2.0
    let dot = v1.0 * v2.0 + v1.1 * v2.1
    return abs(atan2(cross, dot)) * 180 / .pi
  }

  /// Angle between the segment and the horizontal, 0...90 degrees.
  func inclination(_ a: Joint, _ b: Joint) -> Double {
    let pa = point(a), pb = point(b)
    let d = abs(atan2(pb.y - pa.y, pb.x - pa.x)) * 180 / .pi
    return min(d, 180 - d)
  }

  func distance(_ a: Joint, _ b: Joint) -> Double {
    let pa = point(a), pb = point(b)
    return ((pa.x - pb.x) * (pa.x - pb.x) + (pa.y - pb.y) * (pa.y - pb.y)).squareRoot()
  }

  /// Mid-shoulder to mid-hip, or nil when the torso isn't tracked well enough.
  func torsoLength(minConfidence: Double) -> Double? {
    let joints: [Joint] = [.leftShoulder, .rightShoulder, .leftHip, .rightHip]
    let seen = joints.filter { confidence($0) >= minConfidence }
    let leftSide = seen.contains(.leftShoulder) && seen.contains(.leftHip)
    let rightSide = seen.contains(.rightShoulder) && seen.contains(.rightHip)
    // Side views often hide one side completely. One side is enough.
    switch (leftSide, rightSide) {
    case (true, true):
      let s = midpoint(.leftShoulder, .rightShoulder), h = midpoint(.leftHip, .rightHip)
      return hypot(s.x - h.x, s.y - h.y)
    case (true, false): return distance(.leftShoulder, .leftHip)
    case (false, true): return distance(.rightShoulder, .rightHip)
    default: return nil
    }
  }

  func scale(minConfidence: Double) -> Double? {
    if let calibratedScale = calibratedScale { return calibratedScale }
    guard let torso = torsoLength(minConfidence: minConfidence), torso > 1e-3 else { return nil }
    return torso
  }

  func midpoint(_ a: Joint, _ b: Joint) -> (x: Double, y: Double) {
    let pa = point(a), pb = point(b)
    return ((pa.x + pb.x) / 2, (pa.y + pb.y) / 2)
  }
}
