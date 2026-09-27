import QuartzCore
import UIKit

/**
 Draws a `DrawList` with CAShapeLayers, one per run of commands sharing a style. Rasterizing
 happens in the render server on the GPU. This thread only builds paths. Layers and colors are
 pooled across frames.
 */
final class ShapeOverlay {
  let layer = CALayer()
  private var pool: [CAShapeLayer] = []
  private var colors: [UInt32: CGColor] = [:]

  init() {
    layer.masksToBounds = true
  }

  func draw(_ list: DrawList) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    defer { CATransaction.commit() }

    var used = 0
    var path: CGMutablePath?
    var current: (kind: DrawCommand.Kind, color: UInt32, width: Double, filled: Bool)?

    func flush() {
      guard let p = path, let style = current else { return }
      let shape = shapeLayer(at: used)
      used += 1
      shape.path = p
      shape.lineWidth = CGFloat(style.width)
      let color = cgColor(style.color)
      if style.filled {
        shape.fillColor = color
        shape.strokeColor = nil
      } else {
        shape.fillColor = nil
        shape.strokeColor = color
      }
      path = nil
    }

    for c in list.commands {
      let style = (kind: c.kind, color: c.color, width: c.width, filled: c.filled)
      if current == nil || current! != style {
        flush()
        current = style
        path = CGMutablePath()
      }
      switch c.kind {
      case .line:
        path?.move(to: CGPoint(x: c.x1, y: c.y1))
        path?.addLine(to: CGPoint(x: c.x2, y: c.y2))
      case .circle:
        path?.addEllipse(in: CGRect(x: c.x1 - c.x2, y: c.y1 - c.x2, width: c.x2 * 2, height: c.x2 * 2))
      }
    }
    flush()

    for i in used..<pool.count where !pool[i].isHidden {
      pool[i].isHidden = true
      pool[i].path = nil
    }
  }

  func clear() {
    draw(DrawList())
  }

  private func shapeLayer(at index: Int) -> CAShapeLayer {
    if index < pool.count {
      let shape = pool[index]
      shape.isHidden = false
      return shape
    }
    let shape = CAShapeLayer()
    shape.lineCap = .round
    shape.lineJoin = .round
    shape.contentsScale = UIScreen.main.scale
    pool.append(shape)
    layer.addSublayer(shape)
    return shape
  }

  private func cgColor(_ argb: UInt32) -> CGColor {
    if let c = colors[argb] { return c }
    // Trail and effect fades produce many alphas. Don't let the cache grow without bound.
    if colors.count > 512 { colors.removeAll() }
    let c = CGColor(
      srgbRed: CGFloat((argb >> 16) & 0xFF) / 255,
      green: CGFloat((argb >> 8) & 0xFF) / 255,
      blue: CGFloat(argb & 0xFF) / 255,
      alpha: CGFloat(argb >> 24) / 255
    )
    colors[argb] = c
    return c
  }
}
