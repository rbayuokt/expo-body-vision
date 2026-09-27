package expo.modules.bodyvision.core

import kotlin.math.max
import kotlin.math.min

/**
 * Maps normalized upright camera-image coordinates to view points. The camera image is
 * never mirrored in analysis. `mirrored` flips it here so overlays match a mirrored front preview.
 */
data class ViewTransform(
  var width: Double = 0.0,
  var height: Double = 0.0,
  var mirrored: Boolean = false,
  var cover: Boolean = true,
  var imageAspect: Double = 1.0
) {
  val isValid: Boolean get() = width > 0 && height > 0 && imageAspect > 0

  val shortSide: Double get() = min(width, height)

  private fun displayedScale(): Double {
    val fitWidth = width / imageAspect
    return if (cover) max(fitWidth, height) else min(fitWidth, height)
  }

  /** Size of the whole camera image on screen, including any part cropped away. */
  val displayedWidth: Double get() = displayedScale() * imageAspect
  val displayedHeight: Double get() = displayedScale()

  fun pointX(x: Double): Double {
    val s = displayedScale()
    val w = s * imageAspect
    val nx = if (mirrored) 1 - x else x
    return nx * w + (width - w) / 2
  }

  fun pointY(y: Double): Double {
    val s = displayedScale()
    return y * s + (height - s) / 2
  }

  fun point(x: Double, y: Double): Point = Point(pointX(x), pointY(y))

  /** Inverse of `point`. */
  fun imagePoint(x: Double, y: Double): Point {
    val s = displayedScale()
    val w = s * imageAspect
    val nx = (x - (width - w) / 2) / w
    return Point(if (mirrored) 1 - nx else nx, (y - (height - s) / 2) / s)
  }
}
