package expo.modules.bodyvision.core

class EngineEvent(val type: String, val time: Double, val payload: Map<String, Any?> = emptyMap()) {
  val dictionary: Map<String, Any?>
    get() = LinkedHashMap(payload).apply {
      put("type", type)
      put("timestamp", time * 1000)
    }
}

class EventBatch(val sequence: Int, val events: List<EngineEvent>, val dropped: Int)

/**
 * Native to JS delivery with backpressure. At most one batch is in flight until JS acknowledges
 * it, so a busy JS thread can't build up a queue on the bridge. State events (reps, poses, hits)
 * wait in a bounded buffer and drop oldest-first with a count. Telemetry keeps only the latest
 * value per type.
 */
class EventQueue(
  val capacity: Int = 128,
  /** A batch unacknowledged this long is assumed lost (JS reloaded) and delivery resumes. */
  val ackTimeout: Double = 2.0
) {
  private val pending = ArrayDeque<EngineEvent>(capacity)
  // LinkedHashMap keeps first-seen order when a type is overwritten.
  private val telemetry = LinkedHashMap<String, EngineEvent>()
  private var dropped = 0
  private var sequence = 0
  private var inFlight: Int? = null
  private var inFlightSince = 0.0

  fun push(event: EngineEvent) {
    if (pending.size >= capacity) {
      pending.removeFirst()
      dropped += 1
    }
    pending.addLast(event)
  }

  fun publish(event: EngineEvent) {
    telemetry[event.type] = event
  }

  val isEmpty: Boolean get() = pending.isEmpty() && telemetry.isEmpty()

  fun takeBatch(now: Double): EventBatch? {
    if (inFlight != null) {
      if (now - inFlightSince < ackTimeout) return null
      inFlight = null
    }
    if (isEmpty) return null
    val events = ArrayList<EngineEvent>(pending.size + telemetry.size)
    events.addAll(pending)
    events.addAll(telemetry.values)
    pending.clear()
    telemetry.clear()
    sequence += 1
    inFlight = sequence
    inFlightSince = now
    val batch = EventBatch(sequence, events, dropped)
    dropped = 0
    return batch
  }

  fun acknowledge(sequence: Int) {
    if (inFlight == sequence) inFlight = null
  }

  fun clear() {
    pending.clear()
    telemetry.clear()
    inFlight = null
    dropped = 0
  }
}
