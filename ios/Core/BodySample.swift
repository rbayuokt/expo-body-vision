import Foundation

/**
 One inference result. Coordinates are normalized to the upright, un-mirrored camera image
 (0...1 on both axes), `aspect` is that image's width / height. Backends fill a reused instance.
 */
final class BodySample {
  var timestamp: Double = 0
  var present = false
  var aspect: Double = 1
  var x = [Double](repeating: 0, count: Joint.count)
  var y = [Double](repeating: 0, count: Joint.count)
  var z = [Double](repeating: 0, count: Joint.count)
  var confidence = [Double](repeating: 0, count: Joint.count)

  func clear(timestamp: Double, aspect: Double) {
    self.timestamp = timestamp
    self.aspect = aspect
    present = false
    for i in 0..<Joint.count {
      x[i] = 0
      y[i] = 0
      z[i] = 0
      confidence[i] = 0
    }
  }

  func copy(from other: BodySample) {
    timestamp = other.timestamp
    present = other.present
    aspect = other.aspect
    for i in 0..<Joint.count {
      x[i] = other.x[i]
      y[i] = other.y[i]
      z[i] = other.z[i]
      confidence[i] = other.confidence[i]
    }
  }
}
