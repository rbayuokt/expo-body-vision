import Foundation

struct EngineEvent {
  let type: String
  let time: Double
  var payload: [String: Any]

  init(_ type: String, _ time: Double, _ payload: [String: Any] = [:]) {
    self.type = type
    self.time = time
    self.payload = payload
  }

  var dictionary: [String: Any] {
    var d = payload
    d["type"] = type
    d["timestamp"] = time * 1000
    return d
  }
}

struct EventBatch {
  let sequence: Int
  let events: [EngineEvent]
  let dropped: Int
}

/**
 Native to JS delivery with backpressure. At most one batch is in flight until JS acknowledges
 it, so a busy JS thread can't build up a queue on the bridge. State events (reps, poses, hits)
 wait in a bounded buffer and drop oldest-first with a count. Telemetry keeps only the latest
 value per type.
 */
final class EventQueue {
  let capacity: Int
  /// A batch unacknowledged this long is assumed lost (JS reloaded) and delivery resumes.
  let ackTimeout: Double

  private var pending: [EngineEvent] = []
  private var telemetry: [String: EngineEvent] = [:]
  private var telemetryOrder: [String] = []
  private var dropped = 0
  private var sequence = 0
  private var inFlight: Int?
  private var inFlightSince: Double = 0

  init(capacity: Int = 128, ackTimeout: Double = 2) {
    self.capacity = capacity
    self.ackTimeout = ackTimeout
    pending.reserveCapacity(capacity)
  }

  func push(_ event: EngineEvent) {
    if pending.count >= capacity {
      pending.removeFirst()
      dropped += 1
    }
    pending.append(event)
  }

  func publish(_ event: EngineEvent) {
    if telemetry.updateValue(event, forKey: event.type) == nil {
      telemetryOrder.append(event.type)
    }
  }

  var isEmpty: Bool {
    pending.isEmpty && telemetry.isEmpty
  }

  func takeBatch(now: Double) -> EventBatch? {
    if inFlight != nil {
      guard now - inFlightSince >= ackTimeout else { return nil }
      inFlight = nil
    }
    guard !isEmpty else { return nil }
    var events = pending
    for type in telemetryOrder {
      if let e = telemetry[type] { events.append(e) }
    }
    pending.removeAll(keepingCapacity: true)
    telemetry.removeAll(keepingCapacity: true)
    telemetryOrder.removeAll(keepingCapacity: true)
    sequence += 1
    inFlight = sequence
    inFlightSince = now
    let batch = EventBatch(sequence: sequence, events: events, dropped: dropped)
    dropped = 0
    return batch
  }

  func acknowledge(_ sequence: Int) {
    if inFlight == sequence { inFlight = nil }
  }

  func clear() {
    pending.removeAll(keepingCapacity: true)
    telemetry.removeAll(keepingCapacity: true)
    telemetryOrder.removeAll(keepingCapacity: true)
    inFlight = nil
    dropped = 0
  }
}
