package expo.modules.bodyvision.core

import kotlin.math.hypot

@Suppress("EnumEntryName")
enum class TargetMode {
  /** One event when a collider arrives, with a cooldown. */
  hit,
  /** Enter and exit events while any collider overlaps. */
  zone
}

data class TargetStyle(
  val color: Int = 0xCCFFFFFF.toInt(),
  val hitColor: Int = 0xFFFFD60A.toInt(),
  val lineWidth: Double = 3.0,
  val filled: Boolean = false,
  val visible: Boolean = true,
  val particles: Int = 12,
  val effectDuration: Double = 0.45
)

data class TargetDefinition(
  val id: String,
  /** Center as a fraction of the view's width and height. */
  val x: Double,
  val y: Double,
  /** Fractions of the view's shorter side. */
  val radius: Double,
  val colliders: List<Joint> = listOf(Joint.leftWrist, Joint.rightWrist),
  val colliderRadius: Double = 0.03,
  /** Collider speed in view short-sides per second. */
  val minSpeed: Double = 0.0,
  val cooldown: Double = 0.5,
  val mode: TargetMode = TargetMode.hit,
  val minConfidence: Double = 0.5,
  val style: TargetStyle = TargetStyle()
)

/**
 * Hit testing in view space. Each collider is tested as a swept circle between consecutive
 * samples, so a fast hand that skips over a target between inference frames still hits it.
 */
class InteractionEngine {
  var targets: List<TargetDefinition> = emptyList()
    private set
  private var inside: Array<BooleanArray> = emptyArray()
  private var lastHit = DoubleArray(0)
  /** Latest hit time per target for the renderer's effect. */
  var hitTimes = DoubleArray(0)
    private set
  private val prevX = DoubleArray(JOINT_COUNT)
  private val prevY = DoubleArray(JOINT_COUNT)
  private val prevSet = BooleanArray(JOINT_COUNT)
  private val curX = DoubleArray(JOINT_COUNT)
  private val curY = DoubleArray(JOINT_COUNT)
  private val curSet = BooleanArray(JOINT_COUNT)
  private var previousTime = 0.0

  fun configure(targets: List<TargetDefinition>) {
    val old = HashMap<String, Int>()
    this.targets.forEachIndexed { i, t -> old.putIfAbsent(t.id, i) }
    val oldInside = inside
    val oldHit = lastHit
    val oldTimes = hitTimes
    this.targets = targets
    inside = Array(targets.size) { i ->
      val t = targets[i]
      val prev = old[t.id]?.let { oldInside[it] }
      if (prev != null && prev.size == t.colliders.size) prev else BooleanArray(t.colliders.size)
    }
    lastHit = DoubleArray(targets.size) { i -> old[targets[i].id]?.let { oldHit[it] } ?: Double.NEGATIVE_INFINITY }
    hitTimes = DoubleArray(targets.size) { i -> old[targets[i].id]?.let { oldTimes[it] } ?: Double.NEGATIVE_INFINITY }
  }

  fun reset() {
    prevSet.fill(false)
    for (a in inside) a.fill(false)
  }

  fun update(tracker: BodyTracker, view: ViewTransform, t: Double, bodyId: Int, emit: (EngineEvent) -> Unit) {
    if (!view.isValid || targets.isEmpty()) return
    val dt = t - previousTime
    val unit = view.shortSide
    curSet.fill(false)

    for ((ti, target) in targets.withIndex()) {
      val cx = target.x * view.width
      val cy = target.y * view.height
      for ((ci, joint) in target.colliders.withIndex()) {
        val j = joint.ordinal
        if (tracker.confidence(j) < target.minConfidence) {
          if (inside[ti][ci]) leave(ti, ci, joint, t, emit)
          continue
        }
        if (!curSet[j]) {
          curX[j] = view.pointX(tracker.x(j))
          curY[j] = view.pointY(tracker.y(j))
          curSet[j] = true
        }
        val px = curX[j]
        val py = curY[j]
        val reach = (target.radius + target.colliderRadius) * unit
        val fromX = if (prevSet[j]) prevX[j] else px
        val fromY = if (prevSet[j]) prevY[j] else py
        val crossed = segmentDistance(cx, cy, fromX, fromY, px, py) <= reach
        val overlapping = hypot(px - cx, py - cy) <= reach

        if (crossed && !inside[ti][ci]) {
          val speed = if (dt > 0) hypot(px - fromX, py - fromY) / dt / unit else 0.0
          when (target.mode) {
            TargetMode.hit -> if (speed >= target.minSpeed && t - lastHit[ti] >= target.cooldown) {
              lastHit[ti] = t
              hitTimes[ti] = t
              emit(EngineEvent("targetHit", t, mapOf("target" to target.id, "joint" to joint.name, "bodyId" to bodyId, "speed" to speed, "x" to cx, "y" to cy)))
            }
            TargetMode.zone -> if (overlapping && !inside[ti].contains(true)) {
              hitTimes[ti] = t
              emit(EngineEvent("zoneEntered", t, mapOf("target" to target.id, "joint" to joint.name, "bodyId" to bodyId)))
            }
          }
        }
        if (overlapping) {
          inside[ti][ci] = true
        } else if (inside[ti][ci]) {
          leave(ti, ci, joint, t, emit)
        }
      }
    }
    curX.copyInto(prevX)
    curY.copyInto(prevY)
    curSet.copyInto(prevSet)
    previousTime = t
  }

  private fun leave(ti: Int, ci: Int, joint: Joint, t: Double, emit: (EngineEvent) -> Unit) {
    inside[ti][ci] = false
    val target = targets[ti]
    if (target.mode == TargetMode.zone && !inside[ti].contains(true)) {
      emit(EngineEvent("zoneExited", t, mapOf("target" to target.id, "joint" to joint.name)))
    }
  }
}

/** Distance from (cx, cy) to the segment a-b. */
fun segmentDistance(cx: Double, cy: Double, ax: Double, ay: Double, bx: Double, by: Double): Double {
  val dx = bx - ax
  val dy = by - ay
  val len2 = dx * dx + dy * dy
  val k = if (len2 > 0) clamp(((cx - ax) * dx + (cy - ay) * dy) / len2, 0.0, 1.0) else 0.0
  return hypot(ax + k * dx - cx, ay + k * dy - cy)
}
