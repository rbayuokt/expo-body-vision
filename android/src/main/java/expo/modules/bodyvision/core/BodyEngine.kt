package expo.modules.bodyvision.core

/**
 * Tracking, rules, exercises, interaction and calibration for one view, driven by inference
 * samples. Not thread-safe. The owner serializes access with one lock and keeps inference and
 * drawing outside it.
 */
class BodyEngine {
  val tracker = BodyTracker()
  val events = EventQueue()
  val interaction = InteractionEngine()
  var config = EngineConfig()
    private set
  var governor = PerformanceGovernor(PerformanceMode.auto)
    private set
  var poses: List<PoseRule> = emptyList()
    private set
  var exercises: List<ExerciseCounter> = emptyList()
    private set
  var style = SkeletonStyle()
  var view = ViewTransform()
  var calibratedScale: Double? = null
    private set
  private var calibrator: Calibrator? = null
  var readiness: ReadinessMonitor? = null
    private set
  private val emit: (EngineEvent) -> Unit = { events.push(it) }

  val geometry: BodyGeometry get() = BodyGeometry(tracker, calibratedScale)

  fun configure(next: EngineConfig) {
    tracker.configure(next.tracking)
    if (next.performance != config.performance) {
      governor = PerformanceGovernor(next.performance)
    }
    // Unchanged definitions keep their state, so a style tweak doesn't reset a rep count.
    poses = next.poses.map { def -> poses.firstOrNull { it.definition == def } ?: PoseRule(def) }
    exercises = next.exercises.map { def -> exercises.firstOrNull { it.definition == def } ?: ExerciseCounter(def) }
    interaction.configure(next.targets)
    if (next.calibration != config.calibration) {
      calibratedScale = next.calibration
    }
    if (next.readiness != readiness?.params) {
      readiness = next.readiness?.let { ReadinessMonitor(it) }
    }
    config = next
  }

  fun process(sample: BodySample) {
    val t = sample.timestamp
    view.imageAspect = sample.aspect
    when (tracker.update(sample)) {
      TrackerTransition.DETECTED -> emit(EngineEvent("bodyDetected", t, mapOf("bodyId" to tracker.bodyId)))
      TrackerTransition.LOST -> {
        emit(EngineEvent("bodyLost", t, mapOf("bodyId" to tracker.bodyId)))
        interaction.reset()
      }
      TrackerTransition.NONE -> {}
    }
    val g = geometry
    val id = tracker.bodyId
    for (p in poses) p.update(g, t, id, emit)
    for (e in exercises) e.update(g, t, id) { emit(placed(it)) }
    interaction.update(tracker, view, t, id, emit)
    readiness?.update(tracker, view, t)?.let(emit)

    val c = calibrator ?: return
    when (val outcome = c.update(g, t)) {
      is Calibrator.Outcome.Pending -> {}
      is Calibrator.Outcome.Completed -> {
        calibrator = null
        calibratedScale = outcome.measurements["torsoLength"]
        emit(EngineEvent("calibrationCompleted", t, mapOf("measurements" to outcome.measurements)))
      }
      is Calibrator.Outcome.Failed -> {
        calibrator = null
        emit(EngineEvent("calibrationFailed", t, mapOf("reason" to outcome.reason)))
      }
    }
  }

  /** Peak reps name the joint that moved. This adds where it is on screen, for effects. */
  private fun placed(event: EngineEvent): EngineEvent {
    val joint = (event.payload["joint"] as? String)?.let(::jointNamed)
    if (!view.isValid || joint == null) return event
    val i = joint.ordinal
    return EngineEvent(event.type, event.time, event.payload + mapOf("x" to view.pointX(tracker.x(i)), "y" to view.pointY(tracker.y(i))))
  }

  fun startCalibration(duration: Double, t: Double) {
    calibrator = Calibrator(duration, t)
  }

  fun clearCalibration() {
    calibrator = null
    calibratedScale = null
  }

  fun resetExercise(id: String?) {
    for (e in exercises) {
      if (id == null || e.definition.id == id) e.reset()
    }
  }

  /** Camera stopped, switched or the source changed: tracks and in-progress reps are void. */
  fun resetTracking(t: Double) {
    if (tracker.visible) {
      events.push(EngineEvent("bodyLost", t, mapOf("bodyId" to tracker.bodyId)))
    }
    tracker.reset()
    interaction.reset()
    for (p in poses) p.reset()
    for (e in exercises) e.reset(keepCount = true)
    readiness?.reset()
  }

  fun buildScene(builder: SceneBuilder, time: Double) {
    builder.build(tracker, style, view, interaction.targets, interaction.hitTimes, governor.reducedEffects, time)
  }

  /** View-space points for the opt-in `landmarks` event: x, y, confidence per joint. */
  fun landmarkPoints(time: Double, scratchX: DoubleArray, scratchY: DoubleArray, scratchC: DoubleArray): DoubleArray {
    tracker.predict(time, scratchX, scratchY, scratchC)
    val out = DoubleArray(JOINT_COUNT * 3)
    for (i in 0 until JOINT_COUNT) {
      out[i * 3] = if (view.isValid) view.pointX(scratchX[i]) else scratchX[i]
      out[i * 3 + 1] = if (view.isValid) view.pointY(scratchY[i]) else scratchY[i]
      out[i * 3 + 2] = scratchC[i]
    }
    return out
  }
}
