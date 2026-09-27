import Foundation
import QuartzCore

/**
 Plays recorded body frames in place of camera + inference, on the recording's timing. Used by
 tests and the example app. Only enabled when the app opts in through the config plugin.
 */
final class ReplaySource {
  static let rowLength = 2 + Joint.count * 3

  private let frames: [Double]
  private let aspect: Double
  private let loop: Bool
  private let queue = DispatchQueue(label: "expo.modules.bodyvision.replay", qos: .userInitiated)
  private var timer: DispatchSourceTimer?
  private let sample = BodySample()
  private let deliver: (BodySample) -> Void

  static var isEnabled: Bool {
    Bundle.main.object(forInfoDictionaryKey: "ExpoBodyVisionTestInput") as? Bool == true
  }

  init?(_ input: [String: Any], deliver: @escaping (BodySample) -> Void) {
    guard let frames = input["frames"] as? [Double], frames.count >= Self.rowLength, frames.count % Self.rowLength == 0,
      let aspect = input["aspect"] as? Double, aspect > 0 else {
      return nil
    }
    self.frames = frames
    self.aspect = aspect
    self.loop = input["loop"] as? Bool ?? true
    self.deliver = deliver
  }

  func start() {
    queue.async { [weak self] in
      guard let self = self, self.timer == nil else { return }
      let rows = self.frames.count / Self.rowLength
      let first = self.frames[0] / 1000
      let last = self.frames[(rows - 1) * Self.rowLength] / 1000
      let period = last - first + 1.0 / 30
      let startedAt = CACurrentMediaTime()
      var index = 0
      var lap = 0
      let timer = DispatchSource.makeTimerSource(queue: self.queue)
      timer.schedule(deadline: .now(), repeating: .milliseconds(4), leeway: .milliseconds(1))
      timer.setEventHandler { [weak self] in
        guard let self = self else { return }
        let now = CACurrentMediaTime()
        while true {
          if index == rows {
            guard self.loop else {
              self.stop()
              return
            }
            index = 0
            lap += 1
          }
          let base = index * Self.rowLength
          let t = startedAt + Double(lap) * period + self.frames[base] / 1000 - first
          guard t <= now else { break }
          self.fill(base, at: t)
          self.deliver(self.sample)
          index += 1
        }
      }
      self.timer = timer
      timer.resume()
    }
  }

  func stop() {
    queue.async { [weak self] in
      self?.timer?.cancel()
      self?.timer = nil
    }
  }

  private func fill(_ base: Int, at t: Double) {
    sample.clear(timestamp: t, aspect: aspect)
    sample.present = frames[base + 1] == 1
    guard sample.present else { return }
    for i in 0..<Joint.count {
      sample.x[i] = frames[base + 2 + i * 3]
      sample.y[i] = frames[base + 3 + i * 3]
      sample.confidence[i] = frames[base + 4 + i * 3]
    }
  }
}
