import AVFoundation
import ExpoModulesCore
import QuartzCore
import UIKit

final class BodyVisionView: ExpoView {
  let onEvents = EventDispatcher()

  var facing = "front"
  var active = true
  var resizeMode = "cover"
  var config: [String: Any] = [:]
  var skeleton: [String: Any] = [:]
  var telemetry: [String: Any] = [:]
  var testInput: [String: Any]?
  var testInputChanged = false
  var video: [String: Any]?

  private let pipeline = BodyPipeline()
  private let previewLayer: AVCaptureVideoPreviewLayer
  private let playerLayer: AVPlayerLayer
  private let overlay = ShapeOverlay()
  private let scene = SceneBuilder()
  private var displayLink: CADisplayLink?
  private var sourceKey: String?
  private var configKey: NSDictionary?
  private var skeletonKey: NSDictionary?

  required init(appContext: AppContext? = nil) {
    previewLayer = AVCaptureVideoPreviewLayer(session: pipeline.camera.session)
    playerLayer = AVPlayerLayer(player: pipeline.video.player)
    super.init(appContext: appContext)
    clipsToBounds = true
    previewLayer.videoGravity = .resizeAspectFill
    playerLayer.isHidden = true
    layer.addSublayer(previewLayer)
    layer.addSublayer(playerLayer)
    layer.addSublayer(overlay.layer)
    pipeline.camera.previewLayer = previewLayer
  }

  deinit {
    displayLink?.invalidate()
    pipeline.shutdown()
  }

  func applyProps() {
    let cover = resizeMode != "contain"
    previewLayer.videoGravity = cover ? .resizeAspectFill : .resizeAspect
    playerLayer.videoGravity = previewLayer.videoGravity
    playerLayer.isHidden = video == nil

    let configDict = config as NSDictionary
    let skeletonDict = skeleton as NSDictionary
    if configDict != configKey || skeletonDict != skeletonKey {
      configKey = configDict
      skeletonKey = skeletonDict
      do {
        pipeline.configure(try ConfigParser.engine(config), style: try ConfigParser.skeleton(skeleton))
      } catch let error as ConfigError {
        let code: BodyVisionErrorCode = error.path.hasPrefix("rules") ? .invalidRule : .invalidConfig
        pipeline.pushError(code, error.description)
      } catch {
        pipeline.pushError(.invalidConfig, error.localizedDescription)
      }
    }
    pipeline.setBackend(config["backend"] as? String ?? "mediapipe", model: config["model"] as? String)
    pipeline.setTelemetry(
      stats: telemetry["stats"] as? Bool ?? false,
      landmarks: telemetry["landmarks"] as? Bool ?? false,
      intervalMs: telemetry["landmarksIntervalMs"] as? Double ?? 100
    )

    let key = "\(active)|\(facing)|\(video?["uri"] ?? "")|\(video?["loop"] ?? "")"
    if key != sourceKey || testInputChanged {
      sourceKey = key
      testInputChanged = false
      pipeline.setSource(active: active, front: facing == "front", replayInput: testInput, videoInput: video)
    }
    updateViewTransform()
    updateDisplayLink()
  }

  func acknowledge(_ sequence: Int) {
    pipeline.acknowledge(sequence)
  }

  func startCalibration(durationMs: Double) {
    pipeline.startCalibration(durationMs: durationMs)
  }

  func resetExercise(_ id: String?) {
    pipeline.resetExercise(id)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    previewLayer.frame = bounds
    playerLayer.frame = bounds
    overlay.layer.frame = bounds
    CATransaction.commit()
    updateViewTransform()
    // Rotation always relayouts, so this is where the interface orientation is picked up.
    if let orientation = window?.windowScene?.interfaceOrientation, orientation != .unknown {
      pipeline.camera.update(orientation: orientation)
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    pipeline.camera.update(visible: window != nil)
    if video != nil { pipeline.video.setPlaying(window != nil && active) }
    updateDisplayLink()
  }

  private func updateViewTransform() {
    pipeline.setView(
      width: Double(bounds.width),
      height: Double(bounds.height),
      mirrored: facing == "front" && video == nil,
      cover: resizeMode != "contain"
    )
  }

  private func updateDisplayLink() {
    let running = window != nil && active
    if running, displayLink == nil {
      let link = CADisplayLink(target: DisplayLinkTarget(self), selector: #selector(DisplayLinkTarget.tick(_:)))
      let maxFps = Float(window?.screen.maximumFramesPerSecond ?? 60)
      link.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: maxFps, preferred: maxFps)
      link.add(to: .main, forMode: .common)
      displayLink = link
    } else if !running, let link = displayLink {
      link.invalidate()
      displayLink = nil
      overlay.clear()
      // Events queued while stopped (errors, bodyLost) still need to reach JS.
      deliver(pipeline.renderFrame(into: scene, displayTime: CACurrentMediaTime()))
    }
  }

  fileprivate func tick(_ link: CADisplayLink) {
    let batch = pipeline.renderFrame(into: scene, displayTime: link.targetTimestamp)
    overlay.draw(scene.list)
    deliver(batch)
  }

  private func deliver(_ batch: EventBatch?) {
    guard let batch = batch else { return }
    onEvents([
      "sequence": batch.sequence,
      "dropped": batch.dropped,
      "events": batch.events.map(\.dictionary)
    ])
  }
}

/// CADisplayLink retains its target. This keeps the view collectable.
private final class DisplayLinkTarget {
  weak var view: BodyVisionView?

  init(_ view: BodyVisionView) {
    self.view = view
  }

  @objc func tick(_ link: CADisplayLink) {
    guard let view = view else {
      link.invalidate()
      return
    }
    view.tick(link)
  }
}
