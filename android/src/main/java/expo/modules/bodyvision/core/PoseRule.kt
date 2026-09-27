package expo.modules.bodyvision.core

data class PoseRuleDefinition(
  val id: String,
  val conditions: List<Condition>,
  val hold: Double = 0.3,
  val exitGrace: Double = 0.15,
  val minConfidence: Double = 0.5
)

/** idle -> pending (conditions hold) -> active after `hold`. Exits once failing for `exitGrace`. */
class PoseRule(val definition: PoseRuleDefinition) {
  var active = false
    private set
  private var pendingSince: Double? = null
  private var activeSince = 0.0
  private var failingSince: Double? = null

  fun reset() {
    active = false
    pendingSince = null
    failingSince = null
  }

  fun update(g: BodyGeometry, t: Double, bodyId: Int, emit: (EngineEvent) -> Unit) {
    val passing = evaluateAll(definition.conditions, g, definition.minConfidence, active) == true
    if (active) {
      if (passing) {
        failingSince = null
        return
      }
      val since = failingSince ?: t
      failingSince = since
      if (t - since >= definition.exitGrace) {
        active = false
        failingSince = null
        pendingSince = null
        emit(EngineEvent("poseExited", t, mapOf("pose" to definition.id, "bodyId" to bodyId, "durationMs" to (since - activeSince) * 1000)))
      }
      return
    }
    if (!passing) {
      pendingSince = null
      return
    }
    val since = pendingSince ?: t
    pendingSince = since
    if (t - since >= definition.hold) {
      active = true
      activeSince = since
      emit(EngineEvent("poseEntered", t, mapOf("pose" to definition.id, "bodyId" to bodyId)))
    }
  }
}
