package expo.modules.bodyvision.core

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Primitives in view points for one frame, stored in parallel arrays so a frame allocates
 * nothing once the capacity has grown. Circles keep the radius in `x2`.
 */
class DrawList {
  var count = 0
    private set
  var kinds = IntArray(256)
    private set
  var x1 = DoubleArray(256)
    private set
  var y1 = DoubleArray(256)
    private set
  var x2 = DoubleArray(256)
    private set
  var y2 = DoubleArray(256)
    private set
  /** ARGB. */
  var colors = IntArray(256)
    private set
  var widths = DoubleArray(256)
    private set
  var filled = BooleanArray(256)
    private set

  fun reset() {
    count = 0
  }

  fun line(x1: Double, y1: Double, x2: Double, y2: Double, color: Int, width: Double) {
    add(LINE, x1, y1, x2, y2, color, width, false)
  }

  fun circle(x: Double, y: Double, radius: Double, color: Int, filled: Boolean, width: Double = 0.0) {
    add(CIRCLE, x, y, radius, 0.0, color, width, filled)
  }

  private fun add(kind: Int, ax: Double, ay: Double, bx: Double, by: Double, color: Int, width: Double, fill: Boolean) {
    if (count == kinds.size) grow()
    val i = count++
    kinds[i] = kind
    x1[i] = ax
    y1[i] = ay
    x2[i] = bx
    y2[i] = by
    colors[i] = color
    widths[i] = width
    filled[i] = fill
  }

  private fun grow() {
    val n = kinds.size * 2
    kinds = kinds.copyOf(n)
    x1 = x1.copyOf(n)
    y1 = y1.copyOf(n)
    x2 = x2.copyOf(n)
    y2 = y2.copyOf(n)
    colors = colors.copyOf(n)
    widths = widths.copyOf(n)
    filled = filled.copyOf(n)
  }

  companion object {
    const val LINE = 0
    const val CIRCLE = 1
  }
}

data class BoneStyle(val visible: Boolean = true, val color: Int? = null, val width: Double? = null)

data class JointStyle(val visible: Boolean = true, val color: Int? = null, val radius: Double? = null)

data class TrailStyle(
  val joint: Joint,
  val length: Double = 0.35,
  val color: Int = 0xFF00E0A4.toInt(),
  val width: Double = 6.0
)

data class SkeletonStyle(
  val visible: Boolean = true,
  val boneColor: Int = 0xE6FFFFFF.toInt(),
  val boneWidth: Double = 4.0,
  val jointColor: Int = 0xFF00E0A4.toInt(),
  val jointRadius: Double = 5.0,
  val minConfidence: Double = 0.5,
  /** Fades bones and joints with confidence instead of cutting them at `minConfidence`. */
  val fadeWithConfidence: Boolean = true,
  val bones: List<BoneStyle> = Skeleton.bones.map { BoneStyle() },
  val joints: List<JointStyle> = Joint.entries.map { if (it in Skeleton.drawnJoints) JointStyle() else JointStyle(visible = false) },
  val trails: List<TrailStyle> = emptyList()
)

object Easing {
  fun outCubic(p: Double): Double {
    val q = 1 - clamp(p, 0.0, 1.0)
    return 1 - q * q * q
  }
}

fun withAlpha(color: Int, factor: Double): Int {
  val a = (color ushr 24).toDouble() * clamp(factor, 0.0, 1.0)
  return (Math.round(a).toInt() shl 24) or (color and 0x00FFFFFF)
}

/**
 * Builds the frame's draw list from predicted joints at display time. Owns the trail history,
 * so one builder belongs to one render loop.
 */
class SceneBuilder {
  val list = DrawList()
  private val px = DoubleArray(JOINT_COUNT)
  private val py = DoubleArray(JOINT_COUNT)
  private val pc = DoubleArray(JOINT_COUNT)
  private var trails: List<TrailHistory> = emptyList()

  fun build(
    tracker: BodyTracker,
    style: SkeletonStyle,
    view: ViewTransform,
    targets: List<TargetDefinition>,
    hitTimes: DoubleArray,
    reducedEffects: Boolean,
    time: Double
  ) {
    list.reset()
    if (!view.isValid) return
    drawTargets(targets, hitTimes, view, reducedEffects, time)
    if (!style.visible) return

    tracker.predict(time, px, py, pc)
    for (i in 0 until JOINT_COUNT) {
      if (pc[i] <= 0) continue
      val x = px[i]
      px[i] = view.pointX(x)
      py[i] = view.pointY(py[i])
    }
    drawTrails(style, time)
    for ((i, bone) in Skeleton.bones.withIndex()) {
      val s = style.bones[i]
      if (!s.visible) continue
      val a = bone.from.ordinal
      val b = bone.to.ordinal
      val alpha = visibility(min(pc[a], pc[b]), style) ?: continue
      list.line(px[a], py[a], px[b], py[b], withAlpha(s.color ?: style.boneColor, alpha), s.width ?: style.boneWidth)
    }
    for (i in 0 until JOINT_COUNT) {
      val s = style.joints[i]
      if (!s.visible) continue
      val alpha = visibility(pc[i], style) ?: continue
      list.circle(px[i], py[i], s.radius ?: style.jointRadius, withAlpha(s.color ?: style.jointColor, alpha), true)
    }
  }

  private fun visibility(confidence: Double, style: SkeletonStyle): Double? {
    if (confidence < style.minConfidence) return null
    if (!style.fadeWithConfidence) return 1.0
    return 0.35 + 0.65 * clamp((confidence - style.minConfidence) / max(1 - style.minConfidence, 1e-3), 0.0, 1.0)
  }

  private fun drawTrails(style: SkeletonStyle, time: Double) {
    if (trails.size != style.trails.size || trails.indices.any { trails[it].style != style.trails[it] }) {
      trails = style.trails.map { TrailHistory(it) }
    }
    for (trail in trails) {
      val j = trail.style.joint.ordinal
      if (pc[j] >= style.minConfidence) trail.add(px[j], py[j], time)
      trail.draw(list, time)
    }
  }

  private fun drawTargets(targets: List<TargetDefinition>, hitTimes: DoubleArray, view: ViewTransform, reducedEffects: Boolean, time: Double) {
    for ((i, target) in targets.withIndex()) {
      val s = target.style
      if (!s.visible) continue
      val cx = target.x * view.width
      val cy = target.y * view.height
      val r = target.radius * view.shortSide
      val p = if (i < hitTimes.size) (time - hitTimes[i]) / s.effectDuration else 1.0
      if (!(p >= 0 && p < 1)) {
        list.circle(cx, cy, r, s.color, s.filled, s.lineWidth)
        continue
      }
      val e = Easing.outCubic(p)
      list.circle(cx, cy, r * (1 + 0.35 * e), withAlpha(s.hitColor, 1 - p * 0.6), s.filled, s.lineWidth * (1 + e))
      val count = if (reducedEffects) s.particles / 2 else s.particles
      for (k in 0 until count) {
        val angle = k.toDouble() / count.toDouble() * 2 * PI + i.toDouble() * 0.7
        val d = r * (1 + 1.2 * e)
        list.circle(cx + cos(angle) * d, cy + sin(angle) * d, max(0.5, 4 * (1 - p)), withAlpha(s.hitColor, 1 - p), true)
      }
    }
  }
}

private class TrailHistory(val style: TrailStyle) {
  private val xs = DoubleArray(64)
  private val ys = DoubleArray(64)
  private val ts = DoubleArray(64)
  private var head = 0
  private var count = 0

  fun add(x: Double, y: Double, t: Double) {
    head = (head + 1) % xs.size
    xs[head] = x
    ys[head] = y
    ts[head] = t
    count = min(count + 1, xs.size)
  }

  fun draw(list: DrawList, time: Double) {
    if (count <= 1) return
    var i = head
    for (n in 1 until count) {
      val prev = (i - 1 + xs.size) % xs.size
      val age = time - ts[i]
      if (age >= style.length) break
      val fade = 1 - age / style.length
      list.line(xs[prev], ys[prev], xs[i], ys[i], withAlpha(style.color, fade), style.width * max(fade, 0.2))
      i = prev
    }
  }
}
