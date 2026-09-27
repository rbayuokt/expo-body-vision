package expo.modules.bodyvision.core

data class ExerciseDefinition(
  val id: String,
  /** Large at the top of the movement, small at the bottom (e.g. elbow or knee angle). */
  val metric: Metric,
  val top: Double,
  val bottom: Double,
  val hysteresis: Double = 10.0,
  val minRep: Double = 0.4,
  val maxRep: Double = 8.0,
  val lossGrace: Double = 0.4,
  val minConfidence: Double = 0.5,
  /** Form requirements. Unmeasurable counts as met, so a joint out of frame doesn't void a rep. */
  val requires: List<Condition> = emptyList(),
  /** Count peaks instead of full cycles, see `updatePeaks`. */
  val peak: Boolean = false
)

@Suppress("EnumEntryName")
enum class ExercisePhase { ready, top, descending, bottom, ascending }

/**
 * ready -> top -> descending -> bottom -> ascending -> top (rep). Thresholds use hysteresis so
 * noise at a threshold can't flip phases, and brief tracking loss holds the phase for `lossGrace`.
 */
class ExerciseCounter(val definition: ExerciseDefinition) {
  var phase = ExercisePhase.ready
    private set
  var count = 0
    private set
  private var repStart = 0.0
  private var lostSince: Double? = null
  // Peak mode, per side: armed waits for a rise, `extreme` is the low while armed, the high after.
  private val armed = booleanArrayOf(true, true)
  private val extreme = doubleArrayOf(Double.POSITIVE_INFINITY, Double.POSITIVE_INFINITY)
  private var lastPeak = Double.NEGATIVE_INFINITY

  fun reset(keepCount: Boolean = false) {
    phase = ExercisePhase.ready
    lostSince = null
    armed.fill(true)
    extreme.fill(Double.POSITIVE_INFINITY)
    lastPeak = Double.NEGATIVE_INFINITY
    if (!keepCount) count = 0
  }

  private val midRep: Boolean
    get() = phase == ExercisePhase.descending || phase == ExercisePhase.bottom || phase == ExercisePhase.ascending

  fun update(g: BodyGeometry, t: Double, bodyId: Int, emit: (EngineEvent) -> Unit) {
    val d = definition
    if (d.peak) {
      updatePeaks(g, t, bodyId, emit)
      return
    }
    val value = d.metric.measure(g, d.minConfidence)
    if (value == null) {
      val since = lostSince ?: t
      lostSince = since
      if (phase != ExercisePhase.ready && t - since >= d.lossGrace) {
        abandon(t, "lost", emit)
      }
      return
    }
    lostSince = null

    if (evaluateAll(d.requires, g, d.minConfidence, midRep) == false) {
      if (phase != ExercisePhase.ready) abandon(t, "form", emit)
      return
    }
    if (midRep && t - repStart > d.maxRep) {
      abandon(t, "too-slow", emit)
      return
    }

    when (phase) {
      ExercisePhase.ready -> if (value >= d.top) move(ExercisePhase.top, t, emit)
      ExercisePhase.top -> if (value < d.top - d.hysteresis) {
        repStart = t
        move(ExercisePhase.descending, t, emit)
      }
      ExercisePhase.descending -> if (value <= d.bottom) {
        move(ExercisePhase.bottom, t, emit)
      } else if (value >= d.top) {
        reject(t, "incomplete", emit)
        move(ExercisePhase.top, t, emit)
      }
      ExercisePhase.bottom -> if (value > d.bottom + d.hysteresis) move(ExercisePhase.ascending, t, emit)
      ExercisePhase.ascending -> if (value >= d.top) {
        val duration = t - repStart
        if (duration < d.minRep) {
          reject(t, "too-fast", emit)
        } else {
          count += 1
          emit(EngineEvent("repCompleted", t, mapOf("exercise" to d.id, "bodyId" to bodyId, "count" to count, "durationMs" to duration * 1000)))
        }
        move(ExercisePhase.top, t, emit)
      } else if (value <= d.bottom) {
        move(ExercisePhase.bottom, t, emit)
      }
    }
  }

  /**
   * Counts each rise of at least `top - bottom` that reaches `top`, and re-arms after an equal
   * drop. For fast strikes like punches, where a full cycle is often not sampled. A mirrored metric
   * watches both sides at once. Peaks closer than `minRep` are one movement.
   */
  private fun updatePeaks(g: BodyGeometry, t: Double, bodyId: Int, emit: (EngineEvent) -> Unit) {
    val d = definition
    if (evaluateAll(d.requires, g, d.minConfidence, false) == false) {
      reset(keepCount = true)
      return
    }
    val rise = d.top - d.bottom
    for ((i, joints) in d.metric.sides.withIndex()) {
      val v = d.metric.measure(g, joints, d.minConfidence) ?: continue
      if (armed[i]) {
        extreme[i] = minOf(extreme[i], v)
        if (v < d.top || v - extreme[i] < rise) continue
        armed[i] = false
        extreme[i] = v
        if (t - lastPeak < d.minRep) continue
        val payload = mutableMapOf<String, Any?>(
          "exercise" to d.id,
          "bodyId" to bodyId,
          "count" to count + 1,
          "durationMs" to if (lastPeak.isFinite()) (t - lastPeak) * 1000 else 0.0,
          "joint" to joints.last().name
        )
        val name = joints[0].name
        if (name.startsWith("left")) payload["side"] = "left" else if (name.startsWith("right")) payload["side"] = "right"
        count += 1
        lastPeak = t
        emit(EngineEvent("repCompleted", t, payload))
      } else {
        extreme[i] = maxOf(extreme[i], v)
        if (extreme[i] - v >= rise) {
          armed[i] = true
          extreme[i] = v
        }
      }
    }
  }

  private fun abandon(t: Double, reason: String, emit: (EngineEvent) -> Unit) {
    if (midRep) reject(t, reason, emit)
    move(ExercisePhase.ready, t, emit)
  }

  private fun reject(t: Double, reason: String, emit: (EngineEvent) -> Unit) {
    emit(EngineEvent("repRejected", t, mapOf("exercise" to definition.id, "reason" to reason)))
  }

  private fun move(next: ExercisePhase, t: Double, emit: (EngineEvent) -> Unit) {
    if (next == phase) return
    phase = next
    emit(EngineEvent("exercisePhase", t, mapOf("exercise" to definition.id, "phase" to next.name)))
  }
}
