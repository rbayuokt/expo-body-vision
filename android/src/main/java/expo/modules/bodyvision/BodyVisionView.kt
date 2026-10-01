package expo.modules.bodyvision

import android.content.Context
import android.content.res.Configuration
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import expo.modules.bodyvision.core.ConfigError
import expo.modules.bodyvision.core.ConfigParser
import expo.modules.bodyvision.core.EventBatch
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.Executors

class BodyVisionView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  // React Native never lays out native children on its own, and PreviewView needs a real layout.
  override val shouldUseAndroidLayout = true

  private val onEvents by EventDispatcher()

  var facing = "front"
  var active = true
  var torch = false
  var resizeMode = "cover"
  var config: Map<String, Any?> = emptyMap()
  var skeleton: Map<String, Any?> = emptyMap()
  var telemetry: Map<String, Any?> = emptyMap()
  var testInput: Map<String, Any?>? = null
  var testInputChanged = false
  var video: Map<String, Any?>? = null

  private val analysisExecutor = Executors.newSingleThreadExecutor { Thread(it, "bodyvision-analysis") }
  private val pipeline = BodyPipeline(context)
  // SurfaceView-backed: composited by the system, fewer copies and less latency than TextureView.
  private val previewView = PreviewView(context).apply {
    implementationMode = PreviewView.ImplementationMode.PERFORMANCE
    scaleType = PreviewView.ScaleType.FILL_CENTER
    layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
  }
  private val overlay = OverlayView(context, pipeline::renderFrame, ::deliver).apply {
    layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
  }
  private val camera = CameraSource(context, previewView, analysisExecutor, pipeline::analyze, pipeline::pushError, pipeline::setTorchAvailable)
  private val player = VideoPlayerSource(context, analysisExecutor, pipeline::analyze, pipeline::pushVideoEnded, pipeline::pushError)

  private var attached = false
  private var destroyed = false
  private var sourceKey: String? = null
  private var cameraWanted = false
  private var appliedConfig: Map<String, Any?>? = null
  private var appliedSkeleton: Map<String, Any?>? = null

  init {
    // ExpoView lays children out in a row. The overlay has to stack on the preview.
    addView(
      FrameLayout(context).apply {
        addView(previewView)
        addView(player.view)
        addView(this@BodyVisionView.overlay)
      },
      LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    )
  }

  fun commit() {
    if (destroyed) return
    val cover = resizeMode != "contain"
    previewView.scaleType = if (cover) PreviewView.ScaleType.FILL_CENTER else PreviewView.ScaleType.FIT_CENTER
    player.setCover(cover)
    if (config != appliedConfig || skeleton != appliedSkeleton) {
      appliedConfig = config
      appliedSkeleton = skeleton
      try {
        pipeline.configure(ConfigParser.engine(config), ConfigParser.skeleton(skeleton))
      } catch (error: ConfigError) {
        pipeline.pushError(if (error.path.startsWith("rules")) ErrorCodes.INVALID_RULE else ErrorCodes.INVALID_CONFIG, "${error.path}: ${error.message}")
      }
    }
    pipeline.setDelegatePreference(config["delegate"] == "gpu")
    pipeline.setBackend(config["backend"] as? String, config["model"] as? String)
    pipeline.setTelemetry(
      telemetry["stats"] as? Boolean ?: false,
      telemetry["landmarks"] as? Boolean ?: false,
      (telemetry["landmarksIntervalMs"] as? Number)?.toDouble() ?: 100.0
    )
    val videoUri = video?.get("uri") as? String
    val key = "$active|$facing|$videoUri|${video?.get("loop")}"
    if (key != sourceKey || testInputChanged) {
      sourceKey = key
      testInputChanged = false
      cameraWanted = pipeline.setSource(active, testInput) && videoUri == null
      // "pending": JS is still copying a bundled file out.
      if (videoUri == null || videoUri == "pending") player.stop() else player.load(videoUri, video?.get("loop") == true)
    }
    updateViewTransform()
    updateRunning()
    camera.setTorch(torch)
  }

  fun acknowledge(sequence: Int) = pipeline.acknowledge(sequence)

  fun startCalibration(durationMs: Double) = pipeline.startCalibration(durationMs)

  fun resetExercise(id: String?) = pipeline.resetExercise(id)

  fun destroy() {
    if (destroyed) return
    destroyed = true
    overlay.setRunning(false)
    camera.unbind()
    player.stop()
    pipeline.shutdown()
    analysisExecutor.execute {
      pipeline.closeBackend()
      player.release()
    }
    // Queued behind any in-flight inference, so the model is closed off the main thread after it.
    analysisExecutor.shutdown()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    attached = true
    updateRunning()
  }

  override fun onDetachedFromWindow() {
    attached = false
    updateRunning()
    super.onDetachedFromWindow()
  }

  // Coming back from the permission dialog: bind now if the camera was just granted.
  override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
    super.onWindowFocusChanged(hasWindowFocus)
    if (hasWindowFocus) updateRunning()
  }

  override fun onConfigurationChanged(newConfig: Configuration?) {
    super.onConfigurationChanged(newConfig)
    camera.updateRotation()
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    updateViewTransform()
    // Resizing from inside a layout pass would be ignored until the next one.
    post { player.layout() }
  }

  private fun updateViewTransform() {
    val density = resources.displayMetrics.density
    pipeline.setView(width / density.toDouble(), height / density.toDouble(), facing == "front" && video == null, resizeMode != "contain")
  }

  private fun updateRunning() {
    if (destroyed) return
    val running = attached && active
    overlay.setRunning(running)
    player.setPlaying(running)
    val owner = appContext.currentActivity as? LifecycleOwner
    // Also runs on window focus, which retries a bind that failed before permission was granted.
    camera.update(owner, running && cameraWanted, facing == "front")
  }

  private fun deliver(batch: EventBatch) {
    onEvents(
      mapOf(
        "sequence" to batch.sequence,
        "dropped" to batch.dropped,
        "events" to batch.events.map { it.dictionary }
      )
    )
  }
}
