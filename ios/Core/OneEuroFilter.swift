import Foundation

struct SmoothingParams: Equatable {
  var minCutoff: Double
  var beta: Double
  var derivativeCutoff: Double = 1

  /// Units are normalized image coordinates per second. Beta is large because body speeds in
  /// those units are small: a fast punch is ~3/s, jitter ~0.05/s.
  static func preset(_ name: String) -> SmoothingParams? {
    switch name {
    case "none": return SmoothingParams(minCutoff: 1000, beta: 0)
    case "light": return SmoothingParams(minCutoff: 2.5, beta: 30)
    case "balanced": return SmoothingParams(minCutoff: 1.2, beta: 15)
    case "stable": return SmoothingParams(minCutoff: 0.4, beta: 4)
    default: return nil
    }
  }
}

/// One Euro filter (Casiez et al. 2012). `velocity` is the filtered derivative, reused for prediction.
struct OneEuroFilter {
  var params: SmoothingParams
  private(set) var value: Double = 0
  private(set) var velocity: Double = 0
  private var lastTime: Double = 0
  private(set) var initialized = false

  init(params: SmoothingParams) {
    self.params = params
  }

  mutating func reset() {
    initialized = false
    velocity = 0
  }

  @discardableResult
  mutating func filter(_ x: Double, at t: Double) -> Double {
    guard initialized else {
      value = x
      velocity = 0
      lastTime = t
      initialized = true
      return x
    }
    let dt = t - lastTime
    guard dt > 1e-6 else { return value }
    lastTime = t
    let rawVelocity = (x - value) / dt
    velocity += Self.alpha(cutoff: params.derivativeCutoff, dt: dt) * (rawVelocity - velocity)
    let cutoff = params.minCutoff + params.beta * abs(velocity)
    value += Self.alpha(cutoff: cutoff, dt: dt) * (x - value)
    return value
  }

  private static func alpha(cutoff: Double, dt: Double) -> Double {
    let tau = 1 / (2 * Double.pi * cutoff)
    return 1 / (1 + tau / dt)
  }
}
