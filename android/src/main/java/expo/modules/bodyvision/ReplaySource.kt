package expo.modules.bodyvision

import android.content.Context
import android.content.pm.PackageManager
import expo.modules.bodyvision.core.BodySample
import expo.modules.bodyvision.core.JOINT_COUNT
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Plays recorded body frames in place of camera + inference, on the recording's timing. Used by
 * tests and the example app. Only enabled when the app opts in through the config plugin.
 */
internal class ReplaySource private constructor(
  private val frames: DoubleArray,
  private val aspect: Double,
  private val loop: Boolean,
  private val deliver: (BodySample) -> Unit
) {
  private val executor = Executors.newSingleThreadScheduledExecutor { Thread(it, "bodyvision-replay") }
  private var task: ScheduledFuture<*>? = null
  private val sample = BodySample()

  fun start() {
    val rows = frames.size / ROW
    val first = frames[0] / 1000
    val last = frames[(rows - 1) * ROW] / 1000
    val period = last - first + 1.0 / 30
    val startedAt = nowSeconds()
    var index = 0
    var lap = 0
    task = executor.scheduleWithFixedDelay({
      val now = nowSeconds()
      while (true) {
        if (index == rows) {
          if (!loop) {
            task?.cancel(false)
            return@scheduleWithFixedDelay
          }
          index = 0
          lap++
        }
        val base = index * ROW
        val t = startedAt + lap * period + frames[base] / 1000 - first
        if (t > now) break
        fill(base, t)
        deliver(sample)
        index++
      }
    }, 0, 4, TimeUnit.MILLISECONDS)
  }

  fun stop() {
    task?.cancel(false)
    executor.shutdown()
  }

  private fun fill(base: Int, t: Double) {
    sample.clear(t, aspect)
    sample.present = frames[base + 1] == 1.0
    if (!sample.present) return
    for (i in 0 until JOINT_COUNT) {
      sample.x[i] = frames[base + 2 + i * 3]
      sample.y[i] = frames[base + 3 + i * 3]
      sample.confidence[i] = frames[base + 4 + i * 3]
    }
  }

  companion object {
    const val ROW = 2 + JOINT_COUNT * 3

    fun isEnabled(context: Context): Boolean = try {
      val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
      // aapt stores android:value="true" as a Boolean.
      info.metaData?.get("ExpoBodyVisionTestInput")?.toString() == "true"
    } catch (_: Exception) {
      false
    }

    fun create(input: Map<String, Any?>, deliver: (BodySample) -> Unit): ReplaySource? {
      val frames = (input["frames"] as? List<*>)?.map { (it as? Number)?.toDouble() ?: return null }?.toDoubleArray() ?: return null
      val aspect = (input["aspect"] as? Number)?.toDouble() ?: return null
      if (frames.size < ROW || frames.size % ROW != 0 || aspect <= 0) return null
      return ReplaySource(frames, aspect, input["loop"] as? Boolean ?: true, deliver)
    }
  }
}

/** Monotonic seconds, the same clock as Choreographer frame times. */
internal fun nowSeconds(): Double = System.nanoTime() / 1e9
