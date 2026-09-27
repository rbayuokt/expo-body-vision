package expo.modules.bodyvision.core

import kotlin.math.abs

/**
 * Averages body proportions while the user stands still and fully visible. Lengths are in
 * image-height units. `torsoLength` becomes the body scale for distance rules afterwards.
 */
class Calibrator(val duration: Double, private val started: Double) {
  private var frames = 0
  private var valid = 0
  private val sums = HashMap<String, Double>()
  private val counts = HashMap<String, Int>()

  sealed class Outcome {
    object Pending : Outcome()
    class Completed(val measurements: Map<String, Double>) : Outcome()
    class Failed(val reason: String) : Outcome()
  }

  fun update(g: BodyGeometry, t: Double): Outcome {
    frames += 1
    val minConfidence = 0.6
    val ok = { j: Joint -> g.confidence(j) >= minConfidence }
    val torso = g.torsoLength(minConfidence)
    if (torso != null) {
      valid += 1
      add("torsoLength", torso)
      if (ok(Joint.leftShoulder) && ok(Joint.rightShoulder)) {
        add("shoulderWidth", g.distance(Joint.leftShoulder, Joint.rightShoulder))
      }
      for ((a, b, c) in listOf(
        Triple(Joint.leftShoulder, Joint.leftElbow, Joint.leftWrist),
        Triple(Joint.rightShoulder, Joint.rightElbow, Joint.rightWrist)
      )) {
        if (ok(a) && ok(b) && ok(c)) add("armLength", g.distance(a, b) + g.distance(b, c))
      }
      for ((a, b, c) in listOf(
        Triple(Joint.leftHip, Joint.leftKnee, Joint.leftAnkle),
        Triple(Joint.rightHip, Joint.rightKnee, Joint.rightAnkle)
      )) {
        if (ok(a) && ok(b) && ok(c)) add("legLength", g.distance(a, b) + g.distance(b, c))
      }
      if (ok(Joint.nose) && ok(Joint.leftAnkle) && ok(Joint.rightAnkle)) {
        add("height", abs(g.midpoint(Joint.leftAnkle, Joint.rightAnkle).y - g.point(Joint.nose).y))
      }
    }
    if (t - started < duration) return Outcome.Pending
    if (frames == 0 || valid.toDouble() / frames < 0.6) return Outcome.Failed("body-not-visible")
    return Outcome.Completed(sums.mapValues { (k, sum) -> sum / (counts[k] ?: 1) })
  }

  private fun add(key: String, value: Double) {
    sums[key] = (sums[key] ?: 0.0) + value
    counts[key] = (counts[key] ?: 0) + 1
  }
}
