import Foundation

enum PerformanceMode: String {
  case auto, performance, balanced, accuracy
}

/**
 Picks the inference rate. Fixed modes hold their rate. `auto` backs off when inference can't
 keep up or the device is hot, and climbs back slowly once there is headroom. Preview, tracking
 and rendering keep running at display rate either way.
 */
final class PerformanceGovernor {
  private(set) var mode: PerformanceMode
  private(set) var inferenceFps: Double
  /// 0 nominal ... 3 critical, mapped from the platform's thermal state.
  private(set) var thermalLevel = 0
  private(set) var reducedEffects = false

  private let range: ClosedRange<Double>
  private var windowStart: Double?
  private var latencySum: Double = 0
  private var latencyCount = 0
  private var lastChange: Double = -.infinity

  init(mode: PerformanceMode) {
    self.mode = mode
    switch mode {
    case .performance:
      range = 15...15
      inferenceFps = 15
    case .balanced:
      range = 24...24
      inferenceFps = 24
    case .accuracy:
      range = 30...30
      inferenceFps = 30
    case .auto:
      range = 10...30
      inferenceFps = 24
    }
  }

  /// True when the rate or effect level changed.
  @discardableResult
  func setThermal(_ level: Int, at t: Double) -> Bool {
    guard level != thermalLevel else { return false }
    thermalLevel = level
    guard mode == .auto else { return false }
    if level >= 2 {
      return apply(fps: min(inferenceFps, level >= 3 ? range.lowerBound : 15), at: t)
    }
    return apply(fps: inferenceFps, at: t)
  }

  /// Feed every completed inference. Returns true when the rate or effect level changed.
  @discardableResult
  func record(latencyMs: Double, at t: Double) -> Bool {
    guard mode == .auto else { return false }
    let start = windowStart ?? t
    windowStart = start
    latencySum += latencyMs
    latencyCount += 1
    guard t - start >= 1 else { return false }

    let average = latencySum / Double(latencyCount)
    windowStart = t
    latencySum = 0
    latencyCount = 0
    let budget = 1000 / inferenceFps
    if average > budget * 0.85 {
      return apply(fps: max(range.lowerBound, (inferenceFps * 0.8).rounded()), at: t)
    }
    if average < budget * 0.5 && thermalLevel < 2 && t - lastChange >= 3 {
      return apply(fps: min(range.upperBound, inferenceFps + 3), at: t)
    }
    return false
  }

  private func apply(fps: Double, at t: Double) -> Bool {
    let reduced = thermalLevel >= 2 || fps <= range.lowerBound + 2
    guard fps != inferenceFps || reduced != reducedEffects else { return false }
    if fps != inferenceFps { lastChange = t }
    inferenceFps = fps
    reducedEffects = reduced && mode == .auto
    return true
  }
}
