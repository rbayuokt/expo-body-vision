package expo.modules.bodyvision

import android.content.Context
import android.graphics.Bitmap
import android.graphics.SurfaceTexture
import android.media.MediaMetadataRetriever
import android.media.MediaPlayer
import android.net.Uri
import android.view.Gravity
import android.view.Surface
import android.view.TextureView
import android.widget.FrameLayout
import java.util.concurrent.ExecutorService
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Plays a video file in place of the camera. The TextureView is sized to the video's upright
 * aspect (cover or contain), so what it shows and what `getBitmap` grabs are both undistorted.
 * A grab happens on the main thread only when the analysis thread is free. Playback never waits.
 */
internal class VideoPlayerSource(
  private val context: Context,
  private val analysisExecutor: ExecutorService,
  private val analyze: (Bitmap) -> Unit,
  private val ended: () -> Unit,
  private val fail: (String, String) -> Unit
) : TextureView.SurfaceTextureListener {
  val view = TextureView(context).apply { visibility = TextureView.GONE }
  private var player: MediaPlayer? = null
  private var surface: Surface? = null
  private var uri: String? = null
  private var loop = false
  private var playing = false
  private var cover = true
  private var videoWidth = 0
  private var videoHeight = 0
  // Only the analysis thread reads a grabbed bitmap while busy is set.
  private val busy = AtomicBoolean(false)
  private var grab: Bitmap? = null

  init {
    view.surfaceTextureListener = this
  }

  /** Main thread. */
  fun load(uri: String, loop: Boolean) {
    this.loop = loop
    player?.isLooping = loop
    if (uri == this.uri) return
    stop()
    this.uri = uri
    view.visibility = TextureView.VISIBLE
    try {
      MediaMetadataRetriever().apply {
        setDataSource(context, Uri.parse(uri))
        val w = extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
        val h = extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
        val rotation = extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
        videoWidth = if (rotation % 180 == 0) w else h
        videoHeight = if (rotation % 180 == 0) h else w
        release()
      }
    } catch (error: Exception) {
      fail(ErrorCodes.VIDEO_READ_FAILED, "Could not open the video: ${error.message}")
      return
    }
    layout()
    startPlayer()
  }

  /** Main thread. */
  fun setPlaying(playing: Boolean) {
    this.playing = playing
    val p = player ?: return
    if (playing && !p.isPlaying) p.start() else if (!playing && p.isPlaying) p.pause()
  }

  fun setCover(cover: Boolean) {
    if (cover == this.cover) return
    this.cover = cover
    layout()
  }

  /** Main thread. Sizes the TextureView inside its parent. Call after the parent lays out. */
  fun layout() {
    val parent = view.parent as? FrameLayout ?: return
    if (videoWidth == 0 || videoHeight == 0 || parent.width == 0) return
    val scaleW = parent.width.toFloat() / videoWidth
    val scaleH = parent.height.toFloat() / videoHeight
    val scale = if (cover) max(scaleW, scaleH) else min(scaleW, scaleH)
    val params = FrameLayout.LayoutParams((videoWidth * scale).roundToInt(), (videoHeight * scale).roundToInt(), Gravity.CENTER)
    val current = view.layoutParams as? FrameLayout.LayoutParams
    if (current?.width != params.width || current.height != params.height) view.layoutParams = params
  }

  fun stop() {
    player?.release()
    player = null
    uri = null
    videoWidth = 0
    videoHeight = 0
    view.visibility = TextureView.GONE
  }

  /** Analysis thread, once the model is closed. */
  fun release() {
    grab?.recycle()
    grab = null
  }

  private fun startPlayer() {
    val uri = uri ?: return
    val surface = surface ?: return
    player = MediaPlayer().apply {
      try {
        setDataSource(context, Uri.parse(uri))
      } catch (error: Exception) {
        release()
        player = null
        fail(ErrorCodes.VIDEO_READ_FAILED, "Could not open the video: ${error.message}")
        return
      }
      setSurface(surface)
      setVolume(0f, 0f)
      isLooping = loop
      setOnPreparedListener { if (playing) it.start() }
      setOnCompletionListener { if (!loop) ended() }
      setOnErrorListener { _, what, extra ->
        fail(ErrorCodes.VIDEO_READ_FAILED, "Video playback failed ($what, $extra).")
        true
      }
      prepareAsync()
    }
  }

  override fun onSurfaceTextureAvailable(texture: SurfaceTexture, width: Int, height: Int) {
    surface = Surface(texture)
    if (player == null) startPlayer()
  }

  override fun onSurfaceTextureSizeChanged(texture: SurfaceTexture, width: Int, height: Int) {}

  override fun onSurfaceTextureDestroyed(texture: SurfaceTexture): Boolean {
    player?.release()
    player = null
    surface?.release()
    surface = null
    return true
  }

  override fun onSurfaceTextureUpdated(texture: SurfaceTexture) {
    if (videoWidth == 0 || !busy.compareAndSet(false, true)) return
    // The model runs at 256 px, so grab small to keep the main-thread copy cheap.
    val scale = min(1f, 480f / max(videoWidth, videoHeight))
    val w = (videoWidth * scale).roundToInt()
    val h = (videoHeight * scale).roundToInt()
    val bitmap = grab?.takeIf { it.width == w && it.height == h } ?: Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also {
      grab?.recycle()
      grab = it
    }
    view.getBitmap(bitmap)
    analysisExecutor.execute {
      try {
        analyze(bitmap)
      } finally {
        busy.set(false)
      }
    }
  }
}
