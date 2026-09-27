package expo.modules.bodyvision.core

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sqrt

data class Point(val x: Double, val y: Double)

/**
 * Measurements on the tracker's filtered joints. Points are in image-height units (x scaled by
 * the aspect ratio) so angles are true angles whatever the camera resolution.
 */
class BodyGeometry(
  val tracker: BodyTracker,
  /** Calibrated torso length. The live one is used when null. */
  val calibratedScale: Double? = null
) {
  fun confidence(j: Joint): Double = tracker.confidence(j.ordinal)

  fun point(j: Joint): Point = Point(tracker.x(j.ordinal) * tracker.aspect, tracker.y(j.ordinal))

  /** Interior angle at `b`, 0..180 degrees. */
  fun angle(a: Joint, b: Joint, c: Joint): Double {
    val pa = point(a)
    val pb = point(b)
    val pc = point(c)
    val v1x = pa.x - pb.x
    val v1y = pa.y - pb.y
    val v2x = pc.x - pb.x
    val v2y = pc.y - pb.y
    val cross = v1x * v2y - v1y * v2x
    val dot = v1x * v2x + v1y * v2y
    return abs(atan2(cross, dot)) * 180 / PI
  }

  /** Angle between the segment and the horizontal, 0..90 degrees. */
  fun inclination(a: Joint, b: Joint): Double {
    val pa = point(a)
    val pb = point(b)
    val d = abs(atan2(pb.y - pa.y, pb.x - pa.x)) * 180 / PI
    return min(d, 180 - d)
  }

  fun distance(a: Joint, b: Joint): Double {
    val pa = point(a)
    val pb = point(b)
    return sqrt((pa.x - pb.x) * (pa.x - pb.x) + (pa.y - pb.y) * (pa.y - pb.y))
  }

  /** Mid-shoulder to mid-hip, or null when the torso isn't tracked well enough. */
  fun torsoLength(minConfidence: Double): Double? {
    val ok = { j: Joint -> confidence(j) >= minConfidence }
    val leftSide = ok(Joint.leftShoulder) && ok(Joint.leftHip)
    val rightSide = ok(Joint.rightShoulder) && ok(Joint.rightHip)
    // Side views often hide one side completely. One side is enough.
    return when {
      leftSide && rightSide -> {
        val s = midpoint(Joint.leftShoulder, Joint.rightShoulder)
        val h = midpoint(Joint.leftHip, Joint.rightHip)
        hypot(s.x - h.x, s.y - h.y)
      }
      leftSide -> distance(Joint.leftShoulder, Joint.leftHip)
      rightSide -> distance(Joint.rightShoulder, Joint.rightHip)
      else -> null
    }
  }

  fun scale(minConfidence: Double): Double? {
    calibratedScale?.let { return it }
    val torso = torsoLength(minConfidence) ?: return null
    return if (torso > 1e-3) torso else null
  }

  fun midpoint(a: Joint, b: Joint): Point {
    val pa = point(a)
    val pb = point(b)
    return Point((pa.x + pb.x) / 2, (pa.y + pb.y) / 2)
  }
}
