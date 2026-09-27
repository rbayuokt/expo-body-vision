package expo.modules.bodyvision

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaExtractor
import android.media.MediaCodec
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import java.io.File
import java.nio.ByteBuffer
import expo.modules.bodyvision.core.BodyEngine
import expo.modules.bodyvision.core.BodySample
import expo.modules.bodyvision.core.ConfigError
import expo.modules.bodyvision.core.ConfigParser
import expo.modules.bodyvision.core.PerformanceMode
import expo.modules.bodyvision.core.ViewTransform

/**
 * Runs a video file through a pose backend and the engine as fast as the phone allows, with the
 * same rules and events as the live camera. Targets are hit-tested against the whole frame.
 */
internal class VideoAnalyzer(
  private val context: Context,
  private val uri: String,
  private val config: Map<String, Any?>,
  private val options: Map<String, Any?>
) {
  fun run(): Map<String, Any?> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
      throw BodyVisionException(ErrorCodes.VIDEO_READ_FAILED, "Video analysis needs Android 9 or newer.")
    }
    val engineConfig = try {
      ConfigParser.engine(config)
    } catch (error: ConfigError) {
      throw BodyVisionException(if (error.path.startsWith("rules")) ErrorCodes.INVALID_RULE else ErrorCodes.INVALID_CONFIG, "${error.path}: ${error.message}")
    }
    var retriever = open(uri)
    var remuxed: File? = null
    try {
      // Fragmented MP4s (common from social apps) have no frame index, so the retriever can't
      // count or seek them. A plain copy of the video track (no re-encoding) fixes that.
      if (retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT) == null) {
        retriever.release()
        remuxed = remux()
        retriever = open(remuxed.path)
      }
      fun meta(key: Int) = retriever.extractMetadata(key)?.toDoubleOrNull()
      val frameCount = meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT)?.toInt()
        ?: throw BodyVisionException(ErrorCodes.VIDEO_READ_FAILED, "The file has no video track.")
      val durationMs = meta(MediaMetadataRetriever.METADATA_KEY_DURATION) ?: 0.0
      val rotation = meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toInt() ?: 0
      val rawWidth = meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toInt() ?: 0
      val sourceFps = if (durationMs > 0) frameCount / (durationMs / 1000) else 30.0
      val targetFps = (options["fps"] as? Number)?.toDouble() ?: 30.0
      val step = maxOf(1, Math.round(sourceFps / targetFps).toInt())
      val wantLandmarks = options["landmarks"] == true

      val model = config["model"] as? String
      val accuracy = engineConfig.performance == PerformanceMode.accuracy
      val name = config["backend"] as? String ?: defaultBackend(model, accuracy)
      val factory = BodyVisionBackends.factory(name)
        ?: throw BodyVisionException(ErrorCodes.MODEL_LOAD_FAILED, "No pose backend is registered as '$name'.")
      val backend = factory(BodyVisionBackendOptions(context, model, accuracy, false))

      val engine = BodyEngine()
      engine.configure(engineConfig)
      val sample = BodySample()
      val events = ArrayList<Map<String, Any?>>()
      val landmarks = ArrayList<Map<String, Any?>>()
      var analyzed = 0
      var inferenceMs = 0.0
      var width = 0
      var height = 0
      val params = MediaMetadataRetriever.BitmapParams().apply { preferredConfig = Bitmap.Config.ARGB_8888 }
      fun analyze(bitmap: Bitmap, t: Double) {
        // Some decoders apply the rotation metadata and some don't. For 90 and 270 the swapped
        // size tells. A 180 can't be told apart, so it's assumed to be applied.
        val frameRotation = if (rotation % 180 != 0 && bitmap.width == rawWidth) rotation else 0
        val upright = frameRotation % 180 == 0
        width = if (upright) bitmap.width else bitmap.height
        height = if (upright) bitmap.height else bitmap.width
        if (!engine.view.isValid) engine.view = ViewTransform(width.toDouble(), height.toDouble(), false, true, width.toDouble() / height)
        sample.clear(t / 1000, width.toDouble() / height)
        val result = BodyVisionPoseResult(sample)
        val start = SystemClock.elapsedRealtimeNanos()
        try {
          backend.detect(BodyVisionFrame(bitmap.width, bitmap.height, frameRotation, null, bitmap, null), t.toLong(), result)
        } catch (_: Exception) {
          sample.clear(t / 1000, width.toDouble() / height)
        }
        inferenceMs += (SystemClock.elapsedRealtimeNanos() - start) / 1e6
        if (!result.upright) rotateToUpright(sample, frameRotation)
        if (wantLandmarks) {
          val points = ArrayList<Double>(99)
          for (j in 0 until sample.x.size) {
            points.add(sample.x[j])
            points.add(sample.y[j])
            points.add(if (sample.present) sample.confidence[j] else 0.0)
          }
          landmarks.add(mapOf("timestamp" to t, "points" to points))
        }
        engine.process(sample)
        engine.events.takeBatch(t / 1000)?.let { b ->
          events.addAll(b.events.map { it.dictionary })
          engine.events.acknowledge(b.sequence)
        }
        analyzed++
      }

      try {
        // Small batches decode sequentially without holding many full-size frames at once.
        var index = 0
        while (index < frameCount) {
          val count = minOf(4, frameCount - index)
          val batch = retriever.getFramesAtIndex(index, count, params)
          for ((offset, bitmap) in batch.withIndex()) {
            val i = index + offset
            if (i % step == 0) analyze(bitmap, i * 1000.0 / sourceFps)
            bitmap.recycle()
          }
          index += count
        }
      } finally {
        backend.close()
      }
      val out = mutableMapOf<String, Any?>(
        "durationMs" to durationMs,
        "width" to width,
        "height" to height,
        "framesAnalyzed" to analyzed,
        "sourceFps" to sourceFps,
        "backend" to name,
        "delegate" to backend.delegateName,
        "averageInferenceMs" to if (analyzed > 0) inferenceMs / analyzed else 0.0,
        "events" to events
      )
      if (wantLandmarks) out["landmarks"] = landmarks
      return out
    } finally {
      retriever.release()
      remuxed?.delete()
    }
  }

  private fun open(source: String) = MediaMetadataRetriever().apply {
    try {
      if (source.startsWith("content://")) setDataSource(context, Uri.parse(source)) else setDataSource(source.removePrefix("file://"))
    } catch (error: Exception) {
      release()
      throw BodyVisionException(ErrorCodes.VIDEO_READ_FAILED, "Could not open the video: ${error.message}", error)
    }
  }

  /** Copies the first video track into a regular MP4 in the cache. */
  private fun remux(): File {
    val extractor = MediaExtractor()
    val out = File.createTempFile("bodyvision-", ".mp4", context.cacheDir)
    try {
      if (uri.startsWith("content://")) extractor.setDataSource(context, Uri.parse(uri), null) else extractor.setDataSource(uri.removePrefix("file://"))
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true
      } ?: throw BodyVisionException(ErrorCodes.VIDEO_READ_FAILED, "The file has no video track.")
      val format = extractor.getTrackFormat(track)
      extractor.selectTrack(track)
      val muxer = MediaMuxer(out.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      try {
        if (format.containsKey(MediaFormat.KEY_ROTATION)) muxer.setOrientationHint(format.getInteger(MediaFormat.KEY_ROTATION))
        val dst = muxer.addTrack(format)
        muxer.start()
        val size = if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE) else 0
        val buffer = ByteBuffer.allocate(maxOf(size, 4 shl 20))
        val info = MediaCodec.BufferInfo()
        while (true) {
          val read = extractor.readSampleData(buffer, 0)
          if (read < 0) break
          val key = extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0
          info.set(0, read, extractor.sampleTime, if (key) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0)
          muxer.writeSampleData(dst, buffer, info)
          extractor.advance()
        }
        muxer.stop()
      } finally {
        muxer.release()
      }
      return out
    } catch (error: Exception) {
      out.delete()
      throw error as? BodyVisionException ?: BodyVisionException(ErrorCodes.VIDEO_READ_FAILED, "Could not read the video: ${error.message}", error)
    } finally {
      extractor.release()
    }
  }
}
