import Foundation

/**
 Maps normalized upright camera-image coordinates to view points. The camera image is
 never mirrored in analysis. `mirrored` flips it here so overlays match a mirrored front preview.
 */
struct ViewTransform: Equatable {
  var width: Double = 0
  var height: Double = 0
  var mirrored = false
  var cover = true
  var imageAspect: Double = 1

  var isValid: Bool {
    width > 0 && height > 0 && imageAspect > 0
  }

  var shortSide: Double {
    min(width, height)
  }

  private var displayed: (w: Double, h: Double, ox: Double, oy: Double) {
    let fitWidth = width / imageAspect
    let s = cover ? max(fitWidth, height) : min(fitWidth, height)
    let w = s * imageAspect
    return (w, s, (width - w) / 2, (height - s) / 2)
  }

  /// Size of the whole camera image on screen, including any part cropped away.
  var displayedSize: (width: Double, height: Double) {
    let d = displayed
    return (d.w, d.h)
  }

  func point(x: Double, y: Double) -> (x: Double, y: Double) {
    let d = displayed
    let nx = mirrored ? 1 - x : x
    return (nx * d.w + d.ox, y * d.h + d.oy)
  }

  /// Inverse of `point`.
  func imagePoint(x: Double, y: Double) -> (x: Double, y: Double) {
    let d = displayed
    let nx = (x - d.ox) / d.w
    return (mirrored ? 1 - nx : nx, (y - d.oy) / d.h)
  }
}
