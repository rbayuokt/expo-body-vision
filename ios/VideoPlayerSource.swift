import AVFoundation
import QuartzCore

/**
 Plays a video file in place of the camera. Frames are pulled upright (the item's video
 composition applies the track transform) as BGRA on the camera's video queue, so inference
 runs on the same path and thread as live frames. Playback never waits for inference.
 */
final class VideoPlayerSource {
  let player = AVPlayer()
  private let queue: DispatchQueue
  private let deliver: (CMSampleBuffer) -> Void
  private let ended: () -> Void
  private var output: AVPlayerItemVideoOutput?
  private var timer: DispatchSourceTimer?
  private var endObserver: NSObjectProtocol?
  private var loop = false
  private(set) var uri: String?

  init(queue: DispatchQueue, deliver: @escaping (CMSampleBuffer) -> Void, ended: @escaping () -> Void) {
    self.queue = queue
    self.deliver = deliver
    self.ended = ended
    player.isMuted = true
    player.actionAtItemEnd = .pause
  }

  /// Main thread. Returns false when the URI isn't usable.
  func load(_ uri: String, loop: Bool) -> Bool {
    self.loop = loop
    guard uri != self.uri else { return true }
    stop()
    self.uri = uri
    guard let url = uri.contains("://") ? URL(string: uri) : URL(fileURLWithPath: uri) else { return false }
    let asset = AVURLAsset(url: url)
    let item = AVPlayerItem(asset: asset)
    item.videoComposition = AVMutableVideoComposition(propertiesOf: asset)
    let output = AVPlayerItemVideoOutput(pixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
    item.add(output)
    self.output = output
    player.replaceCurrentItem(with: item)
    endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
      guard let self = self else { return }
      if self.loop {
        self.player.seek(to: .zero)
        self.player.play()
      } else {
        self.ended()
      }
    }
    return true
  }

  /// Main thread.
  func setPlaying(_ playing: Bool) {
    if playing {
      player.play()
      startPulling()
    } else {
      player.pause()
      timer?.cancel()
      timer = nil
    }
  }

  func stop() {
    setPlaying(false)
    if let observer = endObserver { NotificationCenter.default.removeObserver(observer) }
    endObserver = nil
    player.replaceCurrentItem(with: nil)
    output = nil
    uri = nil
  }

  private func startPulling() {
    guard timer == nil, let output = output else { return }
    let timer = DispatchSource.makeTimerSource(queue: queue)
    // Inference runs inline on this queue, so ticks that land while it's busy are coalesced.
    timer.schedule(deadline: .now(), repeating: .milliseconds(8), leeway: .milliseconds(2))
    timer.setEventHandler { [weak self] in
      let now = CACurrentMediaTime()
      let itemTime = output.itemTime(forHostTime: now)
      guard output.hasNewPixelBuffer(forItemTime: itemTime),
        let pixels = output.copyPixelBuffer(forItemTime: itemTime, itemTimeForDisplay: nil),
        let buffer = Self.sampleBuffer(pixels, at: now) else { return }
      self?.deliver(buffer)
    }
    self.timer = timer
    timer.resume()
  }

  /// Stamped with host time, like camera frames, so tracking and prediction line up with the display.
  private static func sampleBuffer(_ pixels: CVPixelBuffer, at hostTime: Double) -> CMSampleBuffer? {
    var format: CMVideoFormatDescription?
    guard CMVideoFormatDescriptionCreateForImageBuffer(allocator: nil, imageBuffer: pixels, formatDescriptionOut: &format) == noErr,
      let format = format else { return nil }
    var timing = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: CMTime(seconds: hostTime, preferredTimescale: 1_000_000), decodeTimeStamp: .invalid)
    var buffer: CMSampleBuffer?
    CMSampleBufferCreateReadyWithImageBuffer(allocator: nil, imageBuffer: pixels, formatDescription: format, sampleTiming: &timing, sampleBufferOut: &buffer)
    return buffer
  }
}
