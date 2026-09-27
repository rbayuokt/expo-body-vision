package expo.modules.bodyvision.core

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.hypot

@Suppress("EnumEntryName")
enum class Framing {
  fullBody,
  upperBody,
  /** Side-on on the floor (push-ups, planks). Wants a landscape view. */
  floor
}

data class ReadinessParams(
  val framing: Framing = Framing.fullBody,
  /**
   * Nose to ankles (full body) or nose to hips (upper body) as a fraction of view height.
   * Shoulder to ankle as a fraction of view width for `floor`.
   */
  val minBodyHeight: Double? = null,
  /** Joints closer than this to a view edge count as out of frame. */
  val edgeMargin: Double = 0.02,
  /** Allowed distance of the body's center from the view's center, as a fraction of its width. */
  val centerTolerance: Double = 0.18,
  val minConfidence: Double = 0.5,
  /** Mean confidence below this reads as poor lighting or occlusion. */
  val lowVisibility: Double = 0.65,
  /** Joint speed in view short-sides per second that still counts as standing still. */
  val stillSpeed: Double = 0.25,
  /** A new state must hold this long before it's reported. */
  val settle: Double = 0.3
) {
  val resolvedMinBodyHeight: Double get() = minBodyHeight ?: if (framing == Framing.fullBody) 0.45 else 0.3
}

@Suppress("EnumEntryName")
enum class ReadinessIssue { rotateToLandscape, noBody, getIntoPosition, tooClose, feetHidden, headHidden, handsHidden, tooFar, moveLeft, moveRight, lowVisibility, moving }

/**
 * Whether the user is positioned for tracking, judged in view space so the preview's crop and
 * mirroring count. `moveLeft`/`moveRight` are screen directions. Reports only settled changes.
 */
class ReadinessMonitor(val params: ReadinessParams) {
  var issue: ReadinessIssue? = null
    private set
  private var reported = false
  private var candidate: ReadinessIssue? = null
  private var hasCandidate = false
  private var candidateSince = 0.0

  val status: String get() = when (issue) {
    null -> "ready"
    ReadinessIssue.noBody -> "noBody"
    else -> "adjusting"
  }

  fun update(tracker: BodyTracker, view: ViewTransform, t: Double): EngineEvent? {
    val next = when {
      !view.isValid -> ReadinessIssue.noBody
      params.framing == Framing.floor && view.height > view.width -> ReadinessIssue.rotateToLandscape
      params.framing == Framing.floor -> evaluateFloor(tracker, view)
      else -> evaluate(tracker, view)
    }
    if (!hasCandidate || next != candidate) {
      hasCandidate = true
      candidate = next
      candidateSince = t
    }
    if (t - candidateSince < params.settle || (reported && candidate == issue)) return null
    reported = true
    issue = candidate
    return EngineEvent("readiness", t, mapOf("status" to status, "issue" to issue?.name, "mirrored" to view.mirrored))
  }

  fun reset() {
    issue = null
    reported = false
    hasCandidate = false
  }

  private fun px(tracker: BodyTracker, view: ViewTransform, j: Joint) = view.pointX(tracker.x(j.ordinal)) / view.width

  private fun py(tracker: BodyTracker, view: ViewTransform, j: Joint) = view.pointY(tracker.y(j.ordinal)) / view.height

  private fun inFrame(tracker: BodyTracker, view: ViewTransform, j: Joint): Boolean {
    if (tracker.confidence(j.ordinal) < params.minConfidence) return false
    val x = px(tracker, view, j)
    val y = py(tracker, view, j)
    val m = params.edgeMargin
    return x >= m && x <= 1 - m && y >= m && y <= 1 - m
  }

  /** Lighting, then stillness, over `joints`. */
  private fun settledIssue(tracker: BodyTracker, view: ViewTransform, joints: List<Joint>): ReadinessIssue? {
    val meanConfidence = joints.sumOf { tracker.confidence(it.ordinal) } / joints.size
    if (meanConfidence < params.lowVisibility) return ReadinessIssue.lowVisibility
    val w = view.displayedWidth
    val h = view.displayedHeight
    for (j in joints) {
      val speed = hypot(tracker.velocityX(j.ordinal) * w, tracker.velocityY(j.ordinal) * h) / view.shortSide
      if (speed > params.stillSpeed) return ReadinessIssue.moving
    }
    return null
  }

  private fun evaluate(tracker: BodyTracker, view: ViewTransform): ReadinessIssue? {
    if (!tracker.visible) return ReadinessIssue.noBody
    val p = params
    fun px(j: Joint) = px(tracker, view, j)
    fun py(j: Joint) = py(tracker, view, j)
    fun allIn(joints: List<Joint>) = joints.all { inFrame(tracker, view, it) }

    if (!allIn(TORSO)) return ReadinessIssue.tooClose
    val hipY = (py(Joint.leftHip) + py(Joint.rightHip)) / 2
    val headHidden = !allIn(HEAD)
    val feetHidden = p.framing == Framing.fullBody && !(allIn(FEET) && allIn(LEGS))
    if (headHidden && feetHidden) return ReadinessIssue.tooClose
    if (feetHidden) {
      // Head to hips alone filling most of the frame means too close, not a camera aimed too high.
      return if (hipY - py(Joint.nose) > 0.45) ReadinessIssue.tooClose else ReadinessIssue.feetHidden
    }
    if (headHidden) return ReadinessIssue.headHidden
    if (!allIn(HANDS)) return ReadinessIssue.handsHidden

    val bottom = if (p.framing == Framing.fullBody) (py(Joint.leftAnkle) + py(Joint.rightAnkle)) / 2 else hipY
    if (bottom - py(Joint.nose) < p.resolvedMinBodyHeight) return ReadinessIssue.tooFar

    val centerX = (px(Joint.leftShoulder) + px(Joint.rightShoulder) + px(Joint.leftHip) + px(Joint.rightHip)) / 4
    if (centerX < 0.5 - p.centerTolerance) return ReadinessIssue.moveRight
    if (centerX > 0.5 + p.centerTolerance) return ReadinessIssue.moveLeft

    return settledIssue(tracker, view, HEAD + TORSO + HANDS + if (p.framing == Framing.fullBody) FEET else emptyList())
  }

  /** Side-on on the floor: the far side is often hidden, so the better tracked side decides. */
  private fun evaluateFloor(tracker: BodyTracker, view: ViewTransform): ReadinessIssue? {
    if (!tracker.visible) return ReadinessIssue.noBody
    val left = listOf(Joint.leftShoulder, Joint.leftHip, Joint.leftKnee, Joint.leftAnkle, Joint.leftWrist)
    val right = left.map { it.mirrored }
    val minConf = { side: List<Joint> -> side.minOf { tracker.confidence(it.ordinal) } }
    // Ties go to the left side, like Swift's max(by:) which keeps the first maximum.
    val side = if (minConf(left) >= minConf(right)) left else right
    if (!side.all { inFrame(tracker, view, it) }) return ReadinessIssue.tooClose
    val shoulderX = px(tracker, view, side[0])
    val shoulderY = py(tracker, view, side[0])
    val hipX = px(tracker, view, side[1])
    val ankleX = px(tracker, view, side[3])
    val ankleY = py(tracker, view, side[3])
    // Angle of shoulder to ankle from horizontal, in view points.
    val dx = abs(ankleX - shoulderX) * view.width
    val dy = abs(ankleY - shoulderY) * view.height
    if (atan2(dy, dx) * 180 / PI > 40) return ReadinessIssue.getIntoPosition
    if (abs(ankleX - shoulderX) < params.resolvedMinBodyHeight) return ReadinessIssue.tooFar
    val centerX = (shoulderX + hipX + ankleX) / 3
    if (centerX < 0.5 - params.centerTolerance) return ReadinessIssue.moveRight
    if (centerX > 0.5 + params.centerTolerance) return ReadinessIssue.moveLeft
    return settledIssue(tracker, view, side)
  }

  private companion object {
    val HEAD = listOf(Joint.nose)
    val TORSO = listOf(Joint.leftShoulder, Joint.rightShoulder, Joint.leftHip, Joint.rightHip)
    val HANDS = listOf(Joint.leftWrist, Joint.rightWrist)
    val FEET = listOf(Joint.leftAnkle, Joint.rightAnkle)
    val LEGS = listOf(Joint.leftKnee, Joint.rightKnee)
  }
}
