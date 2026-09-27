package expo.modules.bodyvision.core

@Suppress("EnumEntryName")
enum class MetricKind(val jointCount: Int, val isAngular: Boolean) {
  angle(3, true), inclination(2, true), distance(2, false), above(2, false)
}

/**
 * A measurement on the body. Distances and `above` are in body-scale units (torso lengths).
 * With `mirror`, the left/right-swapped joints are measured too and the better tracked side wins.
 */
data class Metric(val kind: MetricKind, val joints: List<Joint>, val mirror: Boolean) {
  private val mirroredJoints = joints.map { it.mirrored }

  /** The joints per side: just `joints`, or with `mirror` also the swapped set. */
  val sides: List<List<Joint>> = if (mirror) listOf(joints, mirroredJoints) else listOf(joints)

  /** Value, or null when the joints aren't tracked. */
  fun measure(g: BodyGeometry, minConfidence: Double): Double? {
    if (!mirror) return measure(g, joints, minConfidence)
    val left = measure(g, joints, minConfidence)
    val right = measure(g, mirroredJoints, minConfidence)
    if (left != null && right != null) {
      return if (sideConfidence(g, joints) >= sideConfidence(g, mirroredJoints)) left else right
    }
    return left ?: right
  }

  private fun sideConfidence(g: BodyGeometry, joints: List<Joint>): Double =
    joints.minOfOrNull { g.confidence(it) } ?: 0.0

  fun measure(g: BodyGeometry, j: List<Joint>, minConfidence: Double): Double? {
    for (joint in j) {
      if (g.confidence(joint) < minConfidence) return null
    }
    return when (kind) {
      MetricKind.angle -> g.angle(j[0], j[1], j[2])
      MetricKind.inclination -> g.inclination(j[0], j[1])
      MetricKind.distance -> {
        val s = g.scale(minConfidence) ?: return null
        g.distance(j[0], j[1]) / s
      }
      MetricKind.above -> {
        val s = g.scale(minConfidence) ?: return null
        (g.point(j[1]).y - g.point(j[0]).y) / s
      }
    }
  }
}

data class Condition(
  val metric: Metric,
  val min: Double?,
  val max: Double?,
  /** Added to the range while the owning rule is active, so it doesn't flicker at the edge. */
  val hysteresis: Double
) {
  /** true/false, or null when it can't be measured. */
  fun evaluate(g: BodyGeometry, minConfidence: Double, active: Boolean): Boolean? {
    val v = metric.measure(g, minConfidence) ?: return null
    val slack = if (active) hysteresis else 0.0
    if (min != null && v < min - slack) return false
    if (max != null && v > max + slack) return false
    return true
  }
}

/** All-of semantics: any false wins over unknown. */
fun evaluateAll(conditions: List<Condition>, g: BodyGeometry, minConfidence: Double, active: Boolean): Boolean? {
  var unknown = false
  for (c in conditions) {
    when (c.evaluate(g, minConfidence, active)) {
      false -> return false
      null -> unknown = true
      true -> {}
    }
  }
  return if (unknown) null else true
}
