import Foundation

/**
 Averages body proportions while the user stands still and fully visible. Lengths are in
 image-height units. `torsoLength` becomes the body scale for distance rules afterwards.
 */
final class Calibrator {
  let duration: Double
  private let started: Double
  private var frames = 0
  private var valid = 0
  private var sums: [String: Double] = [:]
  private var counts: [String: Int] = [:]

  init(duration: Double, at t: Double) {
    self.duration = duration
    started = t
  }

  enum Outcome {
    case pending
    case completed([String: Double])
    case failed(String)
  }

  func update(_ g: BodyGeometry, at t: Double) -> Outcome {
    frames += 1
    let minConfidence = 0.6
    if let torso = g.torsoLength(minConfidence: minConfidence) {
      valid += 1
      add("torsoLength", torso)
      if g.confidence(.leftShoulder) >= minConfidence && g.confidence(.rightShoulder) >= minConfidence {
        add("shoulderWidth", g.distance(.leftShoulder, .rightShoulder))
      }
      for side in [(Joint.leftShoulder, Joint.leftElbow, Joint.leftWrist), (.rightShoulder, .rightElbow, .rightWrist)]
        where [side.0, side.1, side.2].allSatisfy({ g.confidence($0) >= minConfidence }) {
        add("armLength", g.distance(side.0, side.1) + g.distance(side.1, side.2))
      }
      for side in [(Joint.leftHip, Joint.leftKnee, Joint.leftAnkle), (.rightHip, .rightKnee, .rightAnkle)]
        where [side.0, side.1, side.2].allSatisfy({ g.confidence($0) >= minConfidence }) {
        add("legLength", g.distance(side.0, side.1) + g.distance(side.1, side.2))
      }
      if g.confidence(.nose) >= minConfidence && g.confidence(.leftAnkle) >= minConfidence && g.confidence(.rightAnkle) >= minConfidence {
        add("height", abs(g.midpoint(.leftAnkle, .rightAnkle).y - g.point(.nose).y))
      }
    }
    guard t - started >= duration else { return .pending }
    guard frames > 0, Double(valid) / Double(frames) >= 0.6 else { return .failed("body-not-visible") }
    var result: [String: Double] = [:]
    for (k, sum) in sums {
      result[k] = sum / Double(counts[k] ?? 1)
    }
    return .completed(result)
  }

  private func add(_ key: String, _ value: Double) {
    sums[key, default: 0] += value
    counts[key, default: 0] += 1
  }
}
