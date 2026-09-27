package expo.modules.bodyvision

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.view.Choreographer
import android.view.View
import expo.modules.bodyvision.core.DrawList
import expo.modules.bodyvision.core.EventBatch
import expo.modules.bodyvision.core.SceneBuilder

/**
 * Draws the scene every vsync while running. The draw list is rebuilt in the Choreographer
 * callback and consumed in onDraw, both on the main thread. The RenderThread rasterizes.
 */
internal class OverlayView(
  context: Context,
  private val frame: (SceneBuilder, Double) -> EventBatch?,
  private val deliver: (EventBatch) -> Unit
) : View(context), Choreographer.FrameCallback {
  private val scene = SceneBuilder()
  private val density = resources.displayMetrics.density
  private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
  }
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private var running = false

  init {
    setWillNotDraw(false)
  }

  fun setRunning(value: Boolean) {
    if (value == running) return
    running = value
    val choreographer = Choreographer.getInstance()
    if (value) {
      choreographer.postFrameCallback(this)
    } else {
      choreographer.removeFrameCallback(this)
      scene.list.reset()
      invalidate()
      // Events queued while stopping (errors, bodyLost) still need to reach JS.
      frame(scene, nowSeconds())?.let(deliver)
      scene.list.reset()
    }
  }

  override fun doFrame(frameTimeNanos: Long) {
    if (!running) return
    Choreographer.getInstance().postFrameCallback(this)
    // Frame time is the vsync that started this frame. It reaches the screen about one vsync later.
    val refresh = display?.refreshRate?.takeIf { it > 0 } ?: 60f
    val batch = frame(scene, frameTimeNanos / 1e9 + 1.0 / refresh)
    invalidate()
    batch?.let(deliver)
  }

  override fun onDraw(canvas: Canvas) {
    // React Native parents don't clip children.
    canvas.clipRect(0, 0, width, height)
    val list: DrawList = scene.list
    val d = density
    for (i in 0 until list.count) {
      if (list.kinds[i] == DrawList.LINE) {
        stroke.color = list.colors[i]
        stroke.strokeWidth = (list.widths[i] * d).toFloat()
        canvas.drawLine((list.x1[i] * d).toFloat(), (list.y1[i] * d).toFloat(), (list.x2[i] * d).toFloat(), (list.y2[i] * d).toFloat(), stroke)
      } else {
        val paint = if (list.filled[i]) fill else stroke
        paint.color = list.colors[i]
        if (!list.filled[i]) paint.strokeWidth = (list.widths[i] * d).toFloat()
        canvas.drawCircle((list.x1[i] * d).toFloat(), (list.y1[i] * d).toFloat(), (list.x2[i] * d).toFloat(), paint)
      }
    }
  }
}
