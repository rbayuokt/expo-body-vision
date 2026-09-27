import Foundation

struct TrackingParams: Equatable {
  var smoothing = SmoothingParams.preset("balanced")!
  var minJointConfidence = 0.3
  /// A joint missing for longer than this is hidden and its filter restarts on return.
  var jointHold = 0.25
  var lostAfter = 0.5
  var predictionEnabled = true
  var maxPrediction = 0.1
  /// Normalized units per second. Faster filter velocities are treated as noise when predicting.
  var maxPredictionSpeed = 4.0
}

enum TrackerTransition {
  case none, detected, lost
}

/**
 Single-body tracker. Filters every joint, keeps velocity for prediction and decides when the
 body is detected or lost. Ids increase per detection, so a re-entry is a new body.
 */
final class BodyTracker {
  private(set) var params: TrackingParams
  private(set) var bodyId = 0
  private(set) var visible = false
  private(set) var aspect: Double = 1
  private(set) var lastSampleTime: Double = 0

  private var fx: [OneEuroFilter]
  private var fy: [OneEuroFilter]
  private var lastSeen = [Double](repeating: -.infinity, count: Joint.count)
  private var jointConfidence = [Double](repeating: 0, count: Joint.count)
  private var lastPresent: Double = -.infinity

  init(params: TrackingParams = TrackingParams()) {
    self.params = params
    fx = Array(repeating: OneEuroFilter(params: params.smoothing), count: Joint.count)
    fy = fx
  }

  func configure(_ params: TrackingParams) {
    if params.smoothing != self.params.smoothing {
      for i in 0..<Joint.count {
        fx[i].params = params.smoothing
        fy[i].params = params.smoothing
      }
    }
    self.params = params
  }

  func reset() {
    visible = false
    lastPresent = -.infinity
    for i in 0..<Joint.count {
      fx[i].reset()
      fy[i].reset()
      lastSeen[i] = -.infinity
      jointConfidence[i] = 0
    }
  }

  private func reseat() {
    for i in 0..<Joint.count {
      fx[i].reset()
      fy[i].reset()
      lastSeen[i] = -.infinity
    }
  }

  func update(_ sample: BodySample) -> TrackerTransition {
    let t = sample.timestamp
    lastSampleTime = t
    let nextAspect = sample.aspect > 0 ? sample.aspect : 1
    if visible && abs(nextAspect - aspect) > 0.05 {
      // The device rotated: old positions are in the other frame. Restart the filters so joints
      // don't streak across the screen. The body keeps its id.
      reseat()
    }
    aspect = nextAspect
    var validJoints = 0
    if sample.present {
      for i in 0..<Joint.count where accept(sample, i) {
        if t - lastSeen[i] > params.jointHold {
          fx[i].reset()
          fy[i].reset()
        }
        fx[i].filter(sample.x[i], at: t)
        fy[i].filter(sample.y[i], at: t)
        lastSeen[i] = t
        jointConfidence[i] = sample.confidence[i]
        validJoints += 1
      }
    }

    if validJoints >= 4 {
      lastPresent = t
      if !visible {
        visible = true
        bodyId += 1
        return .detected
      }
    } else if visible && t - lastPresent > params.lostAfter {
      reset()
      return .lost
    }
    return .none
  }

  /// Confidence of the filtered joint at the last sample, 0 when it is stale.
  func confidence(_ joint: Int) -> Double {
    guard visible, lastSampleTime - lastSeen[joint] <= params.jointHold else { return 0 }
    return jointConfidence[joint]
  }

  func x(_ joint: Int) -> Double { fx[joint].value }
  func y(_ joint: Int) -> Double { fy[joint].value }
  func velocityX(_ joint: Int) -> Double { fx[joint].velocity }
  func velocityY(_ joint: Int) -> Double { fy[joint].velocity }

  /**
   Writes joint positions extrapolated to `time` (normally the display time). Extrapolation is
   capped at `maxPrediction` past the last sample and fades out with joint confidence, so a
   dropped or wrong joint can't fling the skeleton off screen.
   */
  func predict(at time: Double, x outX: inout [Double], y outY: inout [Double], confidence outC: inout [Double]) {
    let horizon = params.predictionEnabled ? min(max(time - lastSampleTime, 0), params.maxPrediction) : 0
    for i in 0..<Joint.count {
      let age = time - lastSeen[i]
      guard visible, age <= params.jointHold + params.maxPrediction else {
        outC[i] = 0
        continue
      }
      let c = jointConfidence[i]
      var vx = fx[i].velocity
      var vy = fy[i].velocity
      let speed = (vx * vx + vy * vy).squareRoot()
      if speed > params.maxPredictionSpeed {
        vx *= params.maxPredictionSpeed / speed
        vy *= params.maxPredictionSpeed / speed
      }
      let gain = horizon * min(c, 1)
      outX[i] = clamp(fx[i].value + vx * gain, -0.25, 1.25)
      outY[i] = clamp(fy[i].value + vy * gain, -0.25, 1.25)
      outC[i] = age <= params.jointHold ? c : c * max(0, 1 - (age - params.jointHold) / params.maxPrediction)
    }
  }

  private func accept(_ sample: BodySample, _ i: Int) -> Bool {
    let x = sample.x[i], y = sample.y[i], c = sample.confidence[i]
    return x.isFinite && y.isFinite && c.isFinite && c >= params.minJointConfidence &&
      x > -0.5 && x < 1.5 && y > -0.5 && y < 1.5
  }
}

@inline(__always)
func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
  min(max(v, lo), hi)
}
