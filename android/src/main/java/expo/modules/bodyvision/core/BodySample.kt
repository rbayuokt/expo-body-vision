package expo.modules.bodyvision.core

/**
 * One inference result. Coordinates are normalized to the upright, un-mirrored camera image
 * (0..1 on both axes), `aspect` is that image's width / height. Backends fill a reused instance.
 */
class BodySample {
  var timestamp = 0.0
  var present = false
  var aspect = 1.0
  val x = DoubleArray(JOINT_COUNT)
  val y = DoubleArray(JOINT_COUNT)
  val z = DoubleArray(JOINT_COUNT)
  val confidence = DoubleArray(JOINT_COUNT)

  fun clear(timestamp: Double, aspect: Double) {
    this.timestamp = timestamp
    this.aspect = aspect
    present = false
    x.fill(0.0)
    y.fill(0.0)
    z.fill(0.0)
    confidence.fill(0.0)
  }

  fun copy(from: BodySample) {
    timestamp = from.timestamp
    present = from.present
    aspect = from.aspect
    from.x.copyInto(x)
    from.y.copyInto(y)
    from.z.copyInto(z)
    from.confidence.copyInto(confidence)
  }
}
