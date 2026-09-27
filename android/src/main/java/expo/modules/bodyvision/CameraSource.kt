package expo.modules.bodyvision

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.util.Size
import android.view.Surface
import androidx.camera.core.AspectRatio
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.UseCase
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.util.concurrent.ExecutorService

/**
 * CameraX binding for one view. Analysis frames are RGBA, never mirrored, with rotation left in
 * metadata. STRATEGY_KEEP_ONLY_LATEST drops frames while the analyzer is busy, so nothing queues.
 * Preview and analysis share an aspect ratio so they cover the same field of view.
 */
internal class CameraSource(
  private val context: Context,
  private val previewView: PreviewView,
  private val analysisExecutor: ExecutorService,
  private val analyze: (ImageProxy) -> Unit,
  private val fail: (String, String) -> Unit
) {
  private var provider: ProcessCameraProvider? = null
  private var useCases: Array<UseCase> = emptyArray()
  private var analysis: ImageAnalysis? = null
  private var boundKey: String? = null
  private var generation = 0

  /** Main thread. `owner` null or `running` false unbinds. */
  fun update(owner: LifecycleOwner?, running: Boolean, front: Boolean) {
    val key = if (running && owner != null) "$front" else null
    if (key == boundKey) return
    unbind()
    if (key == null || owner == null) return
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      fail(ErrorCodes.CAMERA_PERMISSION_DENIED, "Camera permission is not granted. Call requestCameraPermissionsAsync() first.")
      return
    }
    boundKey = key
    val bindGeneration = ++generation
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      if (bindGeneration != generation) return@addListener
      try {
        val provider = future.get()
        val selector = if (front) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
        if (!provider.hasCamera(selector)) {
          boundKey = null
          fail(ErrorCodes.CAMERA_UNAVAILABLE, "This device has no ${if (front) "front" else "back"} camera.")
          return@addListener
        }
        val ratio = AspectRatioStrategy(AspectRatio.RATIO_16_9, AspectRatioStrategy.FALLBACK_RULE_AUTO)
        val preview = Preview.Builder()
          .setResolutionSelector(ResolutionSelector.Builder().setAspectRatioStrategy(ratio).build())
          .build()
        preview.setSurfaceProvider(previewView.surfaceProvider)
        // The pose model runs at 256 px. A small analysis size keeps the RGBA copy cheap.
        val analysis = ImageAnalysis.Builder()
          .setResolutionSelector(
            ResolutionSelector.Builder()
              .setAspectRatioStrategy(ratio)
              .setResolutionStrategy(ResolutionStrategy(Size(640, 360), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER))
              .build()
          )
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
          .setTargetRotation(displayRotation())
          .build()
        analysis.setAnalyzer(analysisExecutor, analyze)
        val bound = arrayOf<UseCase>(preview, analysis)
        provider.bindToLifecycle(owner, selector, *bound)
        this.provider = provider
        this.useCases = bound
        this.analysis = analysis
      } catch (error: Exception) {
        boundKey = null
        fail(ErrorCodes.CAMERA_UNAVAILABLE, "Could not start the camera: ${error.message}")
      }
    }, ContextCompat.getMainExecutor(context))
  }

  fun updateRotation() {
    analysis?.targetRotation = displayRotation()
  }

  fun unbind() {
    generation++
    boundKey = null
    analysis?.clearAnalyzer()
    if (useCases.isNotEmpty()) provider?.unbind(*useCases)
    useCases = emptyArray()
    analysis = null
  }

  private fun displayRotation() = previewView.display?.rotation ?: Surface.ROTATION_0
}
