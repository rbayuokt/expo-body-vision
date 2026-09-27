package expo.modules.bodyvision.core

import kotlin.math.PI
import kotlin.math.abs

data class SmoothingParams(val minCutoff: Double, val beta: Double, val derivativeCutoff: Double = 1.0) {
  companion object {
    /**
     * Units are normalized image coordinates per second. Beta is large because body speeds in
     * those units are small: a fast punch is ~3/s, jitter ~0.05/s.
     */
    fun preset(name: String): SmoothingParams? = when (name) {
      "none" -> SmoothingParams(1000.0, 0.0)
      "light" -> SmoothingParams(2.5, 30.0)
      "balanced" -> SmoothingParams(1.2, 15.0)
      "stable" -> SmoothingParams(0.4, 4.0)
      else -> null
    }
  }
}

/** One Euro filter (Casiez et al. 2012). `velocity` is the filtered derivative, reused for prediction. */
class OneEuroFilter(var params: SmoothingParams) {
  var value = 0.0
    private set
  var velocity = 0.0
    private set
  var initialized = false
    private set
  private var lastTime = 0.0

  fun reset() {
    initialized = false
    velocity = 0.0
  }

  fun filter(x: Double, t: Double): Double {
    if (!initialized) {
      value = x
      velocity = 0.0
      lastTime = t
      initialized = true
      return x
    }
    val dt = t - lastTime
    if (dt <= 1e-6) return value
    lastTime = t
    val rawVelocity = (x - value) / dt
    velocity += alpha(params.derivativeCutoff, dt) * (rawVelocity - velocity)
    val cutoff = params.minCutoff + params.beta * abs(velocity)
    value += alpha(cutoff, dt) * (x - value)
    return value
  }

  private fun alpha(cutoff: Double, dt: Double): Double {
    val tau = 1 / (2 * PI * cutoff)
    return 1 / (1 + tau / dt)
  }
}
