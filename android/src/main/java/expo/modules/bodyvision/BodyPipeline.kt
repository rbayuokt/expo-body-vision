package expo.modules.bodyvision

import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.os.PowerManager
import androidx.camera.core.ImageProxy
import expo.modules.bodyvision.core.BodyEngine
import expo.modules.bodyvision.core.BodySample
import expo.modules.bodyvision.core.EngineConfig
import expo.modules.bodyvision.core.EngineEvent
import expo.modules.bodyvision.core.EventBatch
import expo.modules.bodyvision.core.JOINT_COUNT
import expo.modules.bodyvision.core.PerformanceMode
import expo.modules.bodyvision.core.SceneBuilder
import expo.modules.bodyvision.core.SkeletonStyle
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * Threads: CameraX analysis and inference on one executor (inline, so KEEP_ONLY_LATEST drops
 * frames instead of queueing them), replay on its own thread, drawing and event delivery on the
 * main thread's Choreographer. `lock` guards the engine and stats and is only held for
 * bookkeeping. Inference and drawing happen outside it. JS is never on this path.
 */
internal class BodyPipeline(private val context: Context) {
  private val engine = BodyEngine()
  private val lock = ReentrantLock()
  private val stats = StatsWindow()
  private var telemetryStats = false
  private var telemetryLandmarks = false
  private var landmarksInterval = 0.1
  private var lastLandmarks = 0.0
  private var cameraReadyPending = true
  private var preferGpu = false
  private var backendName: String? = null
  private var modelSpec: String? = null
  private var activeBackend = "mediapipe"
  private var activeDelegate = "cpu"
  private val scratchX = DoubleArray(JOINT_COUNT)
  private val scratchY = DoubleArray(JOINT_COUNT)
  private val scratchC = DoubleArray(JOINT_COUNT)

  // Analysis thread.
  private var backend: BodyVisionPoseBackend? = null
  private var backendKey: String? = null
  private var failedKey: String? = null
  private var gpuFailed = false
  private val sample = BodySample()
  private val frameBitmap = FrameBitmap()
  private var lastInferenceStart = 0.0
  private var lastErrorAt = Double.NEGATIVE_INFINITY

  // Main thread.
  private var replay: ReplaySource? = null
  private val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
  private val thermalListener = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
    PowerManager.OnThermalStatusChangedListener { onThermal(it) }
  } else {
    null
  }

  init {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      powerManager.addThermalStatusListener(thermalListener!!)
      onThermal(powerManager.currentThermalStatus)
    }
  }

  val isReplaying: Boolean get() = replay != null

  /** Analysis thread. */
  fun closeBackend() {
    backend?.close()
    backend = null
    frameBitmap.recycle()
  }

  fun shutdown() {
    replay?.stop()
    replay = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      powerManager.removeThermalStatusListener(thermalListener!!)
    }
  }

  fun configure(config: EngineConfig, style: SkeletonStyle) {
    lock.withLock {
      val modeChanged = config.performance != engine.config.performance
      engine.configure(config)
      engine.style = style
      if (modeChanged) pushPerformance(nowSeconds())
    }
  }

  fun setDelegatePreference(gpu: Boolean) {
    lock.withLock { preferGpu = gpu }
  }

  /** `model` "pending" pauses inference while JS resolves a bundled model file. */
  fun setBackend(name: String?, model: String?) {
    lock.withLock {
      backendName = name
      modelSpec = model
    }
  }

  fun setTelemetry(stats: Boolean, landmarks: Boolean, intervalMs: Double) {
    lock.withLock {
      telemetryStats = stats
      telemetryLandmarks = landmarks
      landmarksInterval = maxOf(intervalMs, 16.0) / 1000
    }
  }

  fun setView(width: Double, height: Double, mirrored: Boolean, cover: Boolean) {
    lock.withLock {
      engine.view.width = width
      engine.view.height = height
      engine.view.mirrored = mirrored
      engine.view.cover = cover
    }
  }

  /** Main thread. Returns true when the camera should run. Any change voids current tracks. */
  fun setSource(active: Boolean, replayInput: Map<String, Any?>?): Boolean {
    replay?.stop()
    replay = null
    lock.withLock {
      engine.resetTracking(nowSeconds())
      cameraReadyPending = true
    }
    if (!active) return false
    if (replayInput == null) return true
    if (!ReplaySource.isEnabled(context)) {
      pushError(ErrorCodes.TEST_INPUT_DISABLED, "testInput needs the config plugin's enableTestInput option.")
      return false
    }
    val source = ReplaySource.create(replayInput) { processReplay(it) }
    if (source == null) {
      pushError(ErrorCodes.INVALID_CONFIG, "testInput must have frames in rows of ${ReplaySource.ROW} and a positive aspect.")
      return false
    }
    replay = source
    lock.withLock {
      engine.events.push(EngineEvent("cameraReady", nowSeconds(), mapOf("width" to 0, "height" to 0, "backend" to "replay", "delegate" to "none")))
    }
    source.start()
    return false
  }

  fun startCalibration(durationMs: Double) {
    lock.withLock { engine.startCalibration(durationMs / 1000, nowSeconds()) }
  }

  fun resetExercise(id: String?) {
    lock.withLock { engine.resetExercise(id) }
  }

  fun acknowledge(sequence: Int) {
    lock.withLock { engine.events.acknowledge(sequence) }
  }

  fun pushVideoEnded() {
    lock.withLock { engine.events.push(EngineEvent("videoEnded", nowSeconds(), emptyMap())) }
  }

  fun pushError(code: String, message: String) {
    lock.withLock { engine.events.push(EngineEvent("error", nowSeconds(), mapOf("code" to code, "message" to message))) }
  }

  // Analysis thread.
  fun analyze(image: ImageProxy) {
    try {
      val rotation = image.imageInfo.rotationDegrees
      runInference(image.width, image.height, rotation, BodyVisionFrame(image.width, image.height, rotation, image, null, frameBitmap))
    } finally {
      image.close()
    }
  }

  /** Analysis thread. An upright video frame. */
  fun analyze(bitmap: Bitmap) {
    runInference(bitmap.width, bitmap.height, 0, BodyVisionFrame(bitmap.width, bitmap.height, 0, null, bitmap, null))
  }

  private fun runInference(imageWidth: Int, imageHeight: Int, rotation: Int, frame: BodyVisionFrame) {
    val now = nowSeconds()
    val upright = rotation % 180 == 0
    val width = (if (upright) imageWidth else imageHeight).toDouble()
    val height = (if (upright) imageHeight else imageWidth).toDouble()
    var fps = 0.0
    var request = BackendRequest("mediapipe", null, false, false)
    var readyPending = false
    lock.withLock {
      stats.cameraFrames++
      fps = engine.governor.inferenceFps
      val accuracy = engine.config.performance == PerformanceMode.accuracy
      request = BackendRequest(backendName ?: defaultBackend(modelSpec, accuracy), modelSpec, accuracy, preferGpu && !gpuFailed)
      readyPending = cameraReadyPending
      cameraReadyPending = false
    }
    if (request.model == "pending") return
    // Small tolerance so a 30 fps camera isn't aliased down to 15 by frame-time jitter.
    if (now - lastInferenceStart < 1 / fps - 0.004) {
      lock.withLock { stats.droppedFrames++ }
      return
    }
    val backend = backend(request) ?: return
    if (readyPending) {
      lock.withLock {
        engine.events.push(EngineEvent("cameraReady", now, mapOf("width" to width, "height" to height, "backend" to request.name, "delegate" to backend.delegateName)))
      }
    }
    lastInferenceStart = now
    // Arrival time, not the sensor timestamp: CameraX doesn't guarantee its timebase.
    sample.clear(now, width / height)
    val result = BodyVisionPoseResult(sample)
    try {
      backend.detect(frame, (now * 1000).toLong(), result)
    } catch (error: Exception) {
      if (now - lastErrorAt > 5) {
        lastErrorAt = now
        pushError(ErrorCodes.INFERENCE_FAILED, error.message ?: "Inference failed.")
      }
      // A backend that keeps failing must still let the body time out instead of staying stale.
      sample.clear(now, width / height)
    }
    if (!result.upright) rotateToUpright(sample, rotation)
    val latencyMs = (nowSeconds() - now) * 1000
    lock.withLock {
      engine.process(sample)
      stats.inferences++
      stats.inferenceMsSum += latencyMs
      if (engine.governor.record(latencyMs, now)) pushPerformance(now)
      publishLandmarks(now)
    }
  }

  private data class BackendRequest(val name: String, val model: String?, val accuracy: Boolean, val gpu: Boolean)

  private fun backend(request: BackendRequest): BodyVisionPoseBackend? {
    val key = request.toString()
    backend?.let { if (backendKey == key) return it }
    if (failedKey == key) return null
    backend?.close()
    backend = null
    backendKey = null
    val factory = BodyVisionBackends.factory(request.name)
    if (factory == null) {
      failedKey = key
      pushError(ErrorCodes.MODEL_LOAD_FAILED, "No pose backend is registered as '${request.name}'. Registered: ${BodyVisionBackends.names.joinToString()}.")
      return null
    }
    fun create(gpu: Boolean) = factory(BodyVisionBackendOptions(context, request.model, request.accuracy, gpu))
    val created = try {
      create(request.gpu)
    } catch (error: Exception) {
      if (!request.gpu) {
        failedKey = key
        pushError(ErrorCodes.MODEL_LOAD_FAILED, error.message ?: "Could not load the pose model.")
        return null
      }
      gpuFailed = true
      pushError(ErrorCodes.GPU_UNAVAILABLE, "GPU delegate failed, using CPU: ${error.message}")
      try {
        create(false)
      } catch (cpuError: Exception) {
        failedKey = key
        pushError(ErrorCodes.MODEL_LOAD_FAILED, cpuError.message ?: "Could not load the pose model.")
        return null
      }
    }
    backend = created
    backendKey = key
    failedKey = null
    lock.withLock {
      activeBackend = request.name
      activeDelegate = created.delegateName
    }
    return created
  }


  private fun processReplay(sample: BodySample) {
    lock.withLock {
      engine.process(sample)
      stats.cameraFrames++
      stats.inferences++
      publishLandmarks(sample.timestamp)
    }
  }

  /** Main thread. Builds this frame's draw list and returns an event batch to deliver, if any. */
  fun renderFrame(builder: SceneBuilder, displayTime: Double): EventBatch? = lock.withLock {
    engine.buildScene(builder, displayTime)
    val now = nowSeconds()
    stats.render(now, if (engine.tracker.visible) displayTime - engine.tracker.lastSampleTime else null)
    if (telemetryStats) {
      stats.snapshot(now)?.let { snapshot ->
        val g = engine.governor
        snapshot["targetInferenceFps"] = g.inferenceFps
        snapshot["backend"] = if (replay != null) "replay" else activeBackend
        snapshot["delegate"] = if (replay != null) "none" else activeDelegate
        snapshot["performanceMode"] = engine.config.performance.name
        snapshot["thermalLevel"] = g.thermalLevel
        snapshot["bodyVisible"] = engine.tracker.visible
        engine.events.publish(EngineEvent("stats", now, snapshot))
      }
    }
    engine.events.takeBatch(now)
  }

  // Under the lock.
  private fun pushPerformance(t: Double) {
    val g = engine.governor
    engine.events.push(
      EngineEvent(
        "performanceChanged", t,
        mapOf("mode" to g.mode.name, "inferenceFps" to g.inferenceFps, "reducedEffects" to g.reducedEffects, "thermalLevel" to g.thermalLevel)
      )
    )
  }

  private fun publishLandmarks(t: Double) {
    if (!telemetryLandmarks || !engine.tracker.visible || t - lastLandmarks < landmarksInterval) return
    lastLandmarks = t
    val points = engine.landmarkPoints(t, scratchX, scratchY, scratchC)
    engine.events.publish(EngineEvent("landmarks", t, mapOf("bodyId" to engine.tracker.bodyId, "points" to points.toList())))
  }

  private fun onThermal(status: Int) {
    val level = when (status) {
      PowerManager.THERMAL_STATUS_NONE -> 0
      PowerManager.THERMAL_STATUS_LIGHT -> 1
      PowerManager.THERMAL_STATUS_MODERATE -> 2
      else -> 3
    }
    val now = nowSeconds()
    lock.withLock {
      if (engine.governor.setThermal(level, now)) pushPerformance(now)
    }
  }
}

/** Per-second counters for the `stats` event. */
internal class StatsWindow {
  var cameraFrames = 0
  var droppedFrames = 0
  var inferences = 0
  var inferenceMsSum = 0.0
  private var start = Double.NaN
  private var renderFrames = 0
  private var lastRender = Double.NaN
  private val intervals = DoubleArray(240)
  private var intervalCount = 0
  private var latencySum = 0.0
  private var latencyCount = 0

  fun render(t: Double, latency: Double?) {
    if (start.isNaN()) start = t
    renderFrames++
    if (!lastRender.isNaN() && intervalCount < intervals.size) intervals[intervalCount++] = t - lastRender
    lastRender = t
    if (latency != null && latency >= 0 && latency < 1) {
      latencySum += latency
      latencyCount++
    }
  }

  fun snapshot(t: Double): MutableMap<String, Any?>? {
    if (start.isNaN() || t - start < 1) return null
    val span = t - start
    intervals.sort(0, intervalCount)
    val p95 = if (intervalCount == 0) 0.0 else intervals[minOf(intervalCount - 1, (intervalCount * 0.95).toInt())]
    val out = mutableMapOf<String, Any?>(
      "cameraFps" to cameraFrames / span,
      "inferenceFps" to inferences / span,
      "inferenceMs" to if (inferences > 0) inferenceMsSum / inferences else 0.0,
      "renderFps" to renderFrames / span,
      "frameIntervalP95Ms" to p95 * 1000,
      "droppedFrames" to droppedFrames,
      "latencyMs" to if (latencyCount > 0) latencySum / latencyCount * 1000 else 0.0
    )
    cameraFrames = 0
    droppedFrames = 0
    inferences = 0
    inferenceMsSum = 0.0
    renderFrames = 0
    intervalCount = 0
    latencySum = 0.0
    latencyCount = 0
    start = t
    lastRender = t
    return out
  }
}
