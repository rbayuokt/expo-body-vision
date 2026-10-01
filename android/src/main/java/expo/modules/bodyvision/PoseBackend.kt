package expo.modules.bodyvision

import android.content.Context
import android.graphics.Bitmap
import androidx.camera.core.ImageProxy
import com.google.android.gms.tasks.Tasks
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.defaults.PoseDetectorOptions
import expo.modules.bodyvision.core.BodySample
import expo.modules.bodyvision.core.JOINT_COUNT
import expo.modules.bodyvision.core.Joint
import expo.modules.bodyvision.core.jointNamed
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Turns a frame into body joints. Implement this to use your own model or SDK, register it with
 * [BodyVisionBackends.register], and select it from JS with `backend="<name>"`.
 *
 * [detect] runs on one worker thread, one frame at a time. Camera frames that arrive meanwhile
 * are dropped, so it may block. Frames are never mirrored and may need rotating (see
 * [BodyVisionFrame.rotationDegrees]). Report coordinates in the frame as given and the library
 * rotates them, or set [BodyVisionPoseResult.upright] if your SDK already returns upright ones.
 */
interface BodyVisionPoseBackend {
  /** Shown in stats, e.g. "cpu", "gpu", "npu". */
  val delegateName: String
  fun detect(frame: BodyVisionFrame, timestampMs: Long, result: BodyVisionPoseResult)
  fun close()
}

/** One frame from the camera or from a video file. Only valid during [BodyVisionPoseBackend.detect]. */
class BodyVisionFrame internal constructor(
  val width: Int,
  val height: Int,
  /** Clockwise rotation that makes the frame upright. */
  val rotationDegrees: Int,
  /** The CameraX frame (RGBA_8888) when this came from the camera, null for video. */
  val imageProxy: ImageProxy?,
  private val decoded: Bitmap?,
  private val scratch: FrameBitmap?
) {
  private var copied: Bitmap? = null

  /** The pixels as an ARGB bitmap. Camera frames share one reused bitmap, so don't keep it. */
  fun bitmap(): Bitmap = decoded ?: copied ?: scratch!!.copy(imageProxy!!).also { copied = it }
}

class BodyVisionBackendOptions(
  val context: Context,
  /** The `model` prop: "lite", "full", a file path, or null when unset. */
  val model: String?,
  /** `accuracy` performance mode is on. */
  val preferAccuracy: Boolean,
  val preferGpu: Boolean
)

/**
 * Where a backend writes one frame's joints: normalized 0..1 coordinates in the image it was
 * given. Joints follow the BlazePose order in [JOINT_NAMES]. Leave the ones your model doesn't
 * have alone and they stay untracked.
 */
class BodyVisionPoseResult internal constructor(internal val sample: BodySample) {
  /** Coordinates are already in the upright image (e.g. ML Kit), so the library won't rotate them. */
  var upright = false

  /** Set when a body was found. Setting any joint sets it too. */
  var present: Boolean
    get() = sample.present
    set(value) {
      sample.present = value
    }

  fun setJoint(index: Int, x: Double, y: Double, z: Double = 0.0, confidence: Double) {
    if (index !in 0 until JOINT_COUNT) return
    sample.present = true
    sample.x[index] = x
    sample.y[index] = y
    sample.z[index] = z
    sample.confidence[index] = confidence
  }

  /** False for a name that isn't in [JOINT_NAMES]. */
  fun setJoint(name: String, x: Double, y: Double, z: Double = 0.0, confidence: Double): Boolean {
    val joint = jointNamed(name) ?: return false
    setJoint(joint.ordinal, x, y, z, confidence)
    return true
  }

  companion object {
    val JOINT_NAMES: List<String> = Joint.entries.map { it.name }
  }
}

object BodyVisionBackends {
  private val factories = mutableMapOf<String, (BodyVisionBackendOptions) -> BodyVisionPoseBackend>(
    "mediapipe" to MediaPipePoseBackend::make,
    "mlkit" to { MlKitPoseBackend() }
  )

  /** Registers or replaces a backend. Call it before a view selects it, e.g. in Application.onCreate. */
  @JvmStatic
  @Synchronized
  fun register(name: String, factory: (BodyVisionBackendOptions) -> BodyVisionPoseBackend) {
    factories[name] = factory
  }

  @JvmStatic
  val names: List<String>
    @Synchronized get() = factories.keys.sorted()

  @Synchronized
  internal fun factory(name: String) = factories[name]
}

/**
 * MediaPipe Pose Landmarker in VIDEO mode: synchronous, so the caller owns scheduling and
 * backpressure. Frames are copied into one reused bitmap. Rotation is passed to MediaPipe
 * instead of rotating pixels.
 */
internal class MediaPipePoseBackend private constructor(context: Context, model: ByteBuffer, name: String, gpu: Boolean) : BodyVisionPoseBackend {
  override val delegateName = if (gpu) "gpu" else "cpu"
  private val landmarker: PoseLandmarker
  private var lastTimestamp = -1L

  init {
    val options = PoseLandmarker.PoseLandmarkerOptions.builder()
      .setBaseOptions(BaseOptions.builder().setModelAssetBuffer(model).setDelegate(if (gpu) Delegate.GPU else Delegate.CPU).build())
      .setRunningMode(RunningMode.VIDEO)
      .setNumPoses(1)
      .setMinPoseDetectionConfidence(0.5f)
      .setMinPosePresenceConfidence(0.5f)
      .setMinTrackingConfidence(0.5f)
      .build()
    landmarker = try {
      PoseLandmarker.createFromOptions(context, options)
    } catch (error: Exception) {
      throw BodyVisionException(ErrorCodes.MODEL_LOAD_FAILED, "Could not load $name: ${error.message}", error)
    }
  }

  override fun detect(frame: BodyVisionFrame, timestampMs: Long, result: BodyVisionPoseResult) {
    // VIDEO mode rejects non-increasing timestamps, which a camera rebind can produce.
    val ts = maxOf(timestampMs, lastTimestamp + 1)
    lastTimestamp = ts
    val options = ImageProcessingOptions.builder().setRotationDegrees(frame.rotationDegrees).build()
    val detection = landmarker.detectForVideo(BitmapImageBuilder(frame.bitmap()).build(), options, ts)
    val landmarks = detection.landmarks().firstOrNull() ?: return
    if (landmarks.size < JOINT_COUNT) return
    // MediaPipe rotates for inference but reports landmarks in the unrotated buffer's frame,
    // which is what the result contract asks for.
    for (i in 0 until JOINT_COUNT) {
      val l = landmarks[i]
      val confidence = l.visibility().orElse(null) ?: l.presence().orElse(1f)
      result.setJoint(i, l.x().toDouble(), l.y().toDouble(), l.z().toDouble(), confidence.toDouble())
    }
  }

  override fun close() {
    landmarker.close()
  }

  companion object {
    fun make(options: BodyVisionBackendOptions): BodyVisionPoseBackend {
      val model = options.model ?: if (options.preferAccuracy) "full" else "lite"
      val buffer = try {
        // A direct buffer works whether or not the app build compressed a bundled asset.
        val bytes = when (model) {
          "lite", "full" -> options.context.assets.open("pose_landmarker_$model.task").use { it.readBytes() }
          else -> File(model.removePrefix("file://")).readBytes()
        }
        ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).put(bytes).apply { rewind() }
      } catch (error: Exception) {
        throw BodyVisionException(ErrorCodes.MODEL_LOAD_FAILED, "Pose model '$model' was not found.", error)
      }
      return MediaPipePoseBackend(options.context, buffer, model.substringAfterLast('/'), options.preferGpu)
    }
  }
}

/** One ARGB bitmap reused across frames, so copying a camera frame doesn't allocate. */
internal class FrameBitmap {
  private var bitmap: Bitmap? = null
  private var rowBuffer: ByteBuffer? = null

  fun copy(image: ImageProxy): Bitmap {
    val w = image.width
    val h = image.height
    val target = bitmap?.takeIf { it.width == w && it.height == h }
      ?: Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { bitmap = it }
    val plane = image.planes[0]
    val source = plane.buffer
    source.rewind()
    val packed = w * 4
    if (plane.rowStride == packed) {
      target.copyPixelsFromBuffer(source)
    } else {
      // Row padding: repack into a reused buffer first.
      val rows = rowBuffer?.takeIf { it.capacity() == packed * h } ?: ByteBuffer.allocateDirect(packed * h).also { rowBuffer = it }
      rows.clear()
      for (row in 0 until h) {
        source.limit(row * plane.rowStride + packed)
        source.position(row * plane.rowStride)
        rows.put(source)
      }
      source.clear()
      rows.rewind()
      target.copyPixelsFromBuffer(rows)
    }
    return target
  }

  fun recycle() {
    bitmap?.recycle()
    bitmap = null
  }
}

/**
 * ML Kit Pose in stream mode: BlazePose too, same 33 joints and order. The Android default,
 * measured faster than MediaPipe Lite on a CPH2217. Reports upright
 * coordinates, so the pipeline doesn't rotate them.
 */
internal class MlKitPoseBackend : BodyVisionPoseBackend {
  override val delegateName = "cpu"
  private val detector = PoseDetection.getClient(
    PoseDetectorOptions.Builder().setDetectorMode(PoseDetectorOptions.STREAM_MODE).build()
  )
  override fun detect(frame: BodyVisionFrame, timestampMs: Long, result: BodyVisionPoseResult) {
    val rotation = frame.rotationDegrees
    // fromMediaImage only takes YUV. Frames reach backends as RGBA.
    val input = InputImage.fromBitmap(frame.bitmap(), rotation)
    // detect runs on the analysis thread, so waiting here is the intended backpressure.
    val pose = Tasks.await(detector.process(input))
    val swap = rotation % 180 != 0
    val width = (if (swap) frame.height else frame.width).toDouble()
    val height = (if (swap) frame.width else frame.height).toDouble()
    result.upright = true
    for (landmark in pose.allPoseLandmarks) {
      val p = landmark.position3D
      result.setJoint(landmark.landmarkType, p.x / width, p.y / height, p.z.toDouble() / width, landmark.inFrameLikelihood.toDouble())
    }
  }

  override fun close() {
    detector.close()
  }
}

/**
 * Backends report coordinates in the unrotated frame. The engine wants the upright image.
 * MediaPipe does this too (measured on a CPH2217 front camera, rotation 270).
 */
internal fun rotateToUpright(sample: BodySample, rotation: Int) {
  if (rotation % 360 == 0) return
  for (i in 0 until JOINT_COUNT) {
    val x = sample.x[i]
    val y = sample.y[i]
    when (rotation) {
      90 -> {
        sample.x[i] = 1 - y
        sample.y[i] = x
      }
      180 -> {
        sample.x[i] = 1 - x
        sample.y[i] = 1 - y
      }
      270 -> {
        sample.x[i] = y
        sample.y[i] = 1 - x
      }
    }
  }
}

/**
 * ML Kit unless the request needs MediaPipe: a model file, `full`, or `accuracy` mode. ML Kit
 * measured faster on the phones tried so far. Accuracy hasn't been compared.
 */
internal fun defaultBackend(model: String?, accuracy: Boolean): String =
  if (accuracy || (model != null && model != "lite" && model != "pending")) "mediapipe" else "mlkit"
