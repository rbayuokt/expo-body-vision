package expo.modules.bodyvision.core

import kotlin.math.abs

import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

data class TrackingParams(
  val smoothing: SmoothingParams = SmoothingParams.preset("balanced")!!,
  val minJointConfidence: Double = 0.3,
  /** A joint missing for longer than this is hidden and its filter restarts on return. */
  val jointHold: Double = 0.25,
  val lostAfter: Double = 0.5,
  val predictionEnabled: Boolean = true,
  val maxPrediction: Double = 0.1,
  /** Normalized units per second. Faster filter velocities are treated as noise when predicting. */
  val maxPredictionSpeed: Double = 4.0
)

enum class TrackerTransition { NONE, DETECTED, LOST }

/**
 * Single-body tracker. Filters every joint, keeps velocity for prediction and decides when the
 * body is detected or lost. Ids increase per detection, so a re-entry is a new body.
 */
class BodyTracker(params: TrackingParams = TrackingParams()) {
  var params = params
    private set
  var bodyId = 0
    private set
  var visible = false
    private set
  var aspect = 1.0
    private set
  var lastSampleTime = 0.0
    private set

  private val fx = Array(JOINT_COUNT) { OneEuroFilter(params.smoothing) }
  private val fy = Array(JOINT_COUNT) { OneEuroFilter(params.smoothing) }
  private val lastSeen = DoubleArray(JOINT_COUNT) { Double.NEGATIVE_INFINITY }
  private val jointConfidence = DoubleArray(JOINT_COUNT)
  private var lastPresent = Double.NEGATIVE_INFINITY

  fun configure(params: TrackingParams) {
    if (params.smoothing != this.params.smoothing) {
      for (i in 0 until JOINT_COUNT) {
        fx[i].params = params.smoothing
        fy[i].params = params.smoothing
      }
    }
    this.params = params
  }

  fun reset() {
    visible = false
    lastPresent = Double.NEGATIVE_INFINITY
    for (i in 0 until JOINT_COUNT) {
      fx[i].reset()
      fy[i].reset()
      lastSeen[i] = Double.NEGATIVE_INFINITY
      jointConfidence[i] = 0.0
    }
  }

  private fun reseat() {
    for (i in 0 until JOINT_COUNT) {
      fx[i].reset()
      fy[i].reset()
      lastSeen[i] = Double.NEGATIVE_INFINITY
    }
  }

  fun update(sample: BodySample): TrackerTransition {
    val t = sample.timestamp
    lastSampleTime = t
    val nextAspect = if (sample.aspect > 0) sample.aspect else 1.0
    if (visible && abs(nextAspect - aspect) > 0.05) {
      // The device rotated: old positions are in the other frame. Restart the filters so joints
      // don't streak across the screen. The body keeps its id.
      reseat()
    }
    aspect = nextAspect
    var validJoints = 0
    if (sample.present) {
      for (i in 0 until JOINT_COUNT) {
        if (!accept(sample, i)) continue
        if (t - lastSeen[i] > params.jointHold) {
          fx[i].reset()
          fy[i].reset()
        }
        fx[i].filter(sample.x[i], t)
        fy[i].filter(sample.y[i], t)
        lastSeen[i] = t
        jointConfidence[i] = sample.confidence[i]
        validJoints += 1
      }
    }

    if (validJoints >= 4) {
      lastPresent = t
      if (!visible) {
        visible = true
        bodyId += 1
        return TrackerTransition.DETECTED
      }
    } else if (visible && t - lastPresent > params.lostAfter) {
      reset()
      return TrackerTransition.LOST
    }
    return TrackerTransition.NONE
  }

  /** Confidence of the filtered joint at the last sample, 0 when it is stale. */
  fun confidence(joint: Int): Double {
    if (!visible || lastSampleTime - lastSeen[joint] > params.jointHold) return 0.0
    return jointConfidence[joint]
  }

  fun x(joint: Int) = fx[joint].value
  fun y(joint: Int) = fy[joint].value
  fun velocityX(joint: Int) = fx[joint].velocity
  fun velocityY(joint: Int) = fy[joint].velocity

  /**
   * Writes joint positions extrapolated to `time` (normally the display time). Extrapolation is
   * capped at `maxPrediction` past the last sample and fades out with joint confidence, so a
   * dropped or wrong joint can't fling the skeleton off screen.
   */
  fun predict(time: Double, outX: DoubleArray, outY: DoubleArray, outC: DoubleArray) {
    val horizon = if (params.predictionEnabled) min(max(time - lastSampleTime, 0.0), params.maxPrediction) else 0.0
    for (i in 0 until JOINT_COUNT) {
      val age = time - lastSeen[i]
      if (!visible || age > params.jointHold + params.maxPrediction) {
        outC[i] = 0.0
        continue
      }
      val c = jointConfidence[i]
      var vx = fx[i].velocity
      var vy = fy[i].velocity
      val speed = sqrt(vx * vx + vy * vy)
      if (speed > params.maxPredictionSpeed) {
        vx *= params.maxPredictionSpeed / speed
        vy *= params.maxPredictionSpeed / speed
      }
      val gain = horizon * min(c, 1.0)
      outX[i] = clamp(fx[i].value + vx * gain, -0.25, 1.25)
      outY[i] = clamp(fy[i].value + vy * gain, -0.25, 1.25)
      outC[i] = if (age <= params.jointHold) c else c * max(0.0, 1 - (age - params.jointHold) / params.maxPrediction)
    }
  }

  private fun accept(sample: BodySample, i: Int): Boolean {
    val x = sample.x[i]
    val y = sample.y[i]
    val c = sample.confidence[i]
    return x.isFinite() && y.isFinite() && c.isFinite() && c >= params.minJointConfidence &&
      x > -0.5 && x < 1.5 && y > -0.5 && y < 1.5
  }
}

fun clamp(v: Double, lo: Double, hi: Double): Double = min(max(v, lo), hi)
