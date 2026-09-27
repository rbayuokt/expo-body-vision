package expo.modules.bodyvision.core

import kotlin.math.max
import kotlin.math.min

@Suppress("EnumEntryName")
enum class PerformanceMode { auto, performance, balanced, accuracy }

/**
 * Picks the inference rate. Fixed modes hold their rate. `auto` backs off when inference can't
 * keep up or the device is hot, and climbs back slowly once there is headroom. Preview, tracking
 * and rendering keep running at display rate either way.
 */
class PerformanceGovernor(val mode: PerformanceMode) {
  var inferenceFps: Double
    private set
  /** 0 nominal .. 3 critical, mapped from the platform's thermal state. */
  var thermalLevel = 0
    private set
  var reducedEffects = false
    private set

  private val low: Double
  private val high: Double
  private var windowStart: Double? = null
  private var latencySum = 0.0
  private var latencyCount = 0
  private var lastChange = Double.NEGATIVE_INFINITY

  init {
    val (lo, hi, start) = when (mode) {
      PerformanceMode.performance -> Triple(15.0, 15.0, 15.0)
      PerformanceMode.balanced -> Triple(24.0, 24.0, 24.0)
      PerformanceMode.accuracy -> Triple(30.0, 30.0, 30.0)
      PerformanceMode.auto -> Triple(10.0, 30.0, 24.0)
    }
    low = lo
    high = hi
    inferenceFps = start
  }

  /** True when the rate or effect level changed. */
  fun setThermal(level: Int, t: Double): Boolean {
    if (level == thermalLevel) return false
    thermalLevel = level
    if (mode != PerformanceMode.auto) return false
    if (level >= 2) {
      return apply(min(inferenceFps, if (level >= 3) low else 15.0), t)
    }
    return apply(inferenceFps, t)
  }

  /** Feed every completed inference. Returns true when the rate or effect level changed. */
  fun record(latencyMs: Double, t: Double): Boolean {
    if (mode != PerformanceMode.auto) return false
    val start = windowStart ?: t
    windowStart = start
    latencySum += latencyMs
    latencyCount += 1
    if (t - start < 1) return false

    val average = latencySum / latencyCount
    windowStart = t
    latencySum = 0.0
    latencyCount = 0
    val budget = 1000 / inferenceFps
    if (average > budget * 0.85) {
      return apply(max(low, Math.round(inferenceFps * 0.8).toDouble()), t)
    }
    if (average < budget * 0.5 && thermalLevel < 2 && t - lastChange >= 3) {
      return apply(min(high, inferenceFps + 3), t)
    }
    return false
  }

  private fun apply(fps: Double, t: Double): Boolean {
    val reduced = thermalLevel >= 2 || fps <= low + 2
    if (fps == inferenceFps && reduced == reducedEffects) return false
    if (fps != inferenceFps) lastChange = t
    inferenceFps = fps
    reducedEffects = reduced && mode == PerformanceMode.auto
    return true
  }
}
