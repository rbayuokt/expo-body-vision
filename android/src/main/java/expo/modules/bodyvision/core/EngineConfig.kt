package expo.modules.bodyvision.core

class ConfigError(val path: String, override val message: String) : Exception("$path: $message")

data class EngineConfig(
  val tracking: TrackingParams = TrackingParams(),
  val performance: PerformanceMode = PerformanceMode.auto,
  val poses: List<PoseRuleDefinition> = emptyList(),
  val exercises: List<ExerciseDefinition> = emptyList(),
  val targets: List<TargetDefinition> = emptyList(),
  val readiness: ReadinessParams? = null,
  /** Torso length from a saved calibration. */
  val calibration: Double? = null
)

/**
 * Parses the plain maps JS sends (after `definePose`/`defineExercise` have built them) and
 * re-validates everything, since native can't trust that the JS helpers were used.
 */
object ConfigParser {
  fun engine(d: Map<String, Any?>): EngineConfig {
    var tracking = TrackingParams()
    d["smoothing"]?.let { tracking = tracking.copy(smoothing = smoothing(it, "smoothing")) }
    d["prediction"]?.let { p ->
      tracking = if (p is Boolean) {
        tracking.copy(predictionEnabled = p)
      } else {
        val m = dict(p, "prediction")
        var next = tracking.copy(predictionEnabled = bool(m["enabled"], "prediction.enabled") ?: true)
        number(m["maxMs"], "prediction.maxMs", 0.0, 250.0)?.let { next = next.copy(maxPrediction = it / 1000) }
        next
      }
    }
    d["tracking"]?.let { raw ->
      val t = dict(raw, "tracking")
      tracking = tracking.copy(
        minJointConfidence = number(t["minJointConfidence"], "tracking.minJointConfidence", 0.0, 1.0) ?: tracking.minJointConfidence,
        jointHold = number(t["jointHoldMs"], "tracking.jointHoldMs", 0.0, 5000.0)?.let { it / 1000 } ?: tracking.jointHold,
        lostAfter = number(t["lostAfterMs"], "tracking.lostAfterMs", 0.0, 10000.0)?.let { it / 1000 } ?: tracking.lostAfter
      )
    }
    var performance = PerformanceMode.auto
    string(d["performance"], "performance")?.let { p ->
      performance = PerformanceMode.entries.firstOrNull { it.name == p }
        ?: throw ConfigError("performance", "unknown mode '$p'")
    }
    val readiness = d["readiness"]?.let { readiness(it) }
    val calibration = number(d["calibration"], "calibration", 0.001, 10.0)
    val poses = ArrayList<PoseRuleDefinition>()
    val exercises = ArrayList<ExerciseDefinition>()
    val targets = ArrayList<TargetDefinition>()
    d["rules"]?.let { raw ->
      val rules = raw as? List<*> ?: throw ConfigError("rules", "expected an array")
      val ids = HashSet<String>()
      for ((i, item) in rules.withIndex()) {
        val path = "rules[$i]"
        val r = dict(item, path)
        val type = string(r["type"], "$path.type")
        val id = requiredString(r["id"], "$path.id")
        if (!ids.add("${type ?: ""}/$id")) throw ConfigError("$path.id", "duplicate id '$id'")
        when (type) {
          "pose" -> poses.add(pose(r, id, path))
          "exercise" -> exercises.add(exercise(r, id, path))
          "target" -> targets.add(target(r, id, path))
          else -> throw ConfigError("$path.type", "expected 'pose', 'exercise' or 'target'")
        }
      }
    }
    return EngineConfig(tracking, performance, poses, exercises, targets, readiness, calibration)
  }

  fun readiness(v: Any): ReadinessParams {
    if (v == true) return ReadinessParams()
    val d = dict(v, "readiness")
    val framing = string(d["framing"], "readiness.framing")?.let { f ->
      Framing.entries.firstOrNull { it.name == f } ?: throw ConfigError("readiness.framing", "expected 'fullBody', 'upperBody' or 'floor'")
    } ?: Framing.fullBody
    val defaults = ReadinessParams()
    return ReadinessParams(
      framing = framing,
      minBodyHeight = number(d["minBodyHeight"], "readiness.minBodyHeight", 0.05, 1.0),
      centerTolerance = number(d["centerTolerance"], "readiness.centerTolerance", 0.0, 0.5) ?: defaults.centerTolerance,
      stillSpeed = number(d["stillSpeed"], "readiness.stillSpeed", 0.0, 100.0) ?: defaults.stillSpeed
    )
  }

  fun smoothing(v: Any, path: String): SmoothingParams {
    if (v is String) return SmoothingParams.preset(v) ?: throw ConfigError(path, "unknown preset '$v'")
    val d = dict(v, path)
    return SmoothingParams(
      number(d["minCutoff"], "$path.minCutoff", 0.001, 1000.0) ?: 1.2,
      number(d["beta"], "$path.beta", 0.0, 1000.0) ?: 15.0,
      number(d["derivativeCutoff"], "$path.derivativeCutoff", 0.001, 1000.0) ?: 1.0
    )
  }

  fun pose(r: Map<String, Any?>, id: String, path: String): PoseRuleDefinition {
    val list = r["conditions"] as? List<*>
    if (list == null || list.isEmpty()) throw ConfigError("$path.conditions", "needs at least one condition")
    val conditions = list.mapIndexed { i, c -> condition(c, "$path.conditions[$i]") }
    val defaults = PoseRuleDefinition(id, conditions)
    return defaults.copy(
      hold = number(r["holdMs"], "$path.holdMs", 0.0, 60000.0)?.let { it / 1000 } ?: defaults.hold,
      exitGrace = number(r["exitGraceMs"], "$path.exitGraceMs", 0.0, 60000.0)?.let { it / 1000 } ?: defaults.exitGrace,
      minConfidence = number(r["minConfidence"], "$path.minConfidence", 0.0, 1.0) ?: defaults.minConfidence
    )
  }

  fun exercise(r: Map<String, Any?>, id: String, path: String): ExerciseDefinition {
    val m = metric(r["metric"], "$path.metric")
    val top = requiredNumber(r["top"], "$path.top")
    val bottom = requiredNumber(r["bottom"], "$path.bottom")
    if (top <= bottom) throw ConfigError("$path.top", "must be greater than bottom")
    val defaults = ExerciseDefinition(id, m, top, bottom)
    val hysteresis = number(r["hysteresis"], "$path.hysteresis", 0.0, 1000.0) ?: defaults.hysteresis
    if (top - hysteresis <= bottom + hysteresis) {
      throw ConfigError("$path.hysteresis", "top - hysteresis must stay above bottom + hysteresis")
    }
    val minRep = number(r["minRepMs"], "$path.minRepMs", 0.0, 600000.0)?.let { it / 1000 } ?: defaults.minRep
    val maxRep = number(r["maxRepMs"], "$path.maxRepMs", 0.0, 600000.0)?.let { it / 1000 } ?: defaults.maxRep
    val lossGrace = number(r["lossGraceMs"], "$path.lossGraceMs", 0.0, 60000.0)?.let { it / 1000 } ?: defaults.lossGrace
    val minConfidence = number(r["minConfidence"], "$path.minConfidence", 0.0, 1.0) ?: defaults.minConfidence
    val peak = when (r["mode"]) {
      null, "cycle" -> false
      "peak" -> true
      else -> throw ConfigError("$path.mode", "expected 'cycle' or 'peak'")
    }
    var requires = defaults.requires
    r["requires"]?.let { raw ->
      val list = raw as? List<*> ?: throw ConfigError("$path.requires", "expected an array")
      requires = list.mapIndexed { i, c -> condition(c, "$path.requires[$i]") }
    }
    return defaults.copy(
      hysteresis = hysteresis,
      minRep = minRep,
      maxRep = maxRep,
      lossGrace = lossGrace,
      minConfidence = minConfidence,
      requires = requires,
      peak = peak
    )
  }

  fun target(r: Map<String, Any?>, id: String, path: String): TargetDefinition {
    var t = TargetDefinition(
      id = id,
      x = requiredNumber(r["x"], "$path.x"),
      y = requiredNumber(r["y"], "$path.y"),
      radius = number(r["radius"], "$path.radius", 0.001, 10.0) ?: 0.08
    )
    r["colliders"]?.let { raw ->
      val names = raw as? List<*>
      if (names == null || names.isEmpty()) throw ConfigError("$path.colliders", "needs at least one joint")
      t = t.copy(colliders = names.mapIndexed { i, n -> joint(n, "$path.colliders[$i]") })
    }
    t = t.copy(
      colliderRadius = number(r["colliderRadius"], "$path.colliderRadius", 0.0, 10.0) ?: t.colliderRadius,
      minSpeed = number(r["minSpeed"], "$path.minSpeed", 0.0, 1000.0) ?: t.minSpeed,
      cooldown = number(r["cooldownMs"], "$path.cooldownMs", 0.0, 600000.0)?.let { it / 1000 } ?: t.cooldown,
      minConfidence = number(r["minConfidence"], "$path.minConfidence", 0.0, 1.0) ?: t.minConfidence
    )
    string(r["mode"], "$path.mode")?.let { m ->
      val mode = TargetMode.entries.firstOrNull { it.name == m } ?: throw ConfigError("$path.mode", "expected 'hit' or 'zone'")
      t = t.copy(mode = mode)
    }
    r["style"]?.let { raw ->
      val s = dict(raw, "$path.style")
      val d = t.style
      t = t.copy(
        style = TargetStyle(
          color = color(s["color"], "$path.style.color") ?: d.color,
          hitColor = color(s["hitColor"], "$path.style.hitColor") ?: d.hitColor,
          lineWidth = number(s["lineWidth"], "$path.style.lineWidth", 0.0, 100.0) ?: d.lineWidth,
          filled = bool(s["filled"], "$path.style.filled") ?: d.filled,
          visible = bool(s["visible"], "$path.style.visible") ?: d.visible,
          particles = (number(s["particles"], "$path.style.particles", 0.0, 64.0) ?: d.particles.toDouble()).toInt(),
          effectDuration = number(s["effectDurationMs"], "$path.style.effectDurationMs", 1.0, 10000.0)?.let { it / 1000 } ?: d.effectDuration
        )
      )
    }
    return t
  }

  fun condition(v: Any?, path: String): Condition {
    val d = dict(v, path)
    val m = metric(d, path)
    val lo = number(d["min"], "$path.min")
    val hi = number(d["max"], "$path.max")
    if (lo == null && hi == null) throw ConfigError(path, "needs min or max")
    if (lo != null && hi != null && lo > hi) throw ConfigError("$path.min", "is greater than max")
    val h = number(d["hysteresis"], "$path.hysteresis", 0.0, 1000.0) ?: if (m.kind.isAngular) 8.0 else 0.1
    return Condition(m, lo, hi, h)
  }

  fun metric(v: Any?, path: String): Metric {
    val d = dict(v, path)
    val kindName = requiredString(d["kind"], "$path.kind")
    val kind = MetricKind.entries.firstOrNull { it.name == kindName }
      ?: throw ConfigError("$path.kind", "unknown metric '$kindName'")
    val names = d["joints"] as? List<*>
    if (names == null || names.size != kind.jointCount) {
      throw ConfigError("$path.joints", "'$kindName' needs ${kind.jointCount} joints")
    }
    val joints = names.mapIndexed { i, n -> joint(n, "$path.joints[$i]") }
    return Metric(kind, joints, bool(d["mirror"], "$path.mirror") ?: false)
  }

  fun skeleton(d: Map<String, Any?>): SkeletonStyle {
    var s = SkeletonStyle()
    s = s.copy(
      visible = bool(d["visible"], "skeleton.visible") ?: s.visible,
      boneColor = color(d["boneColor"], "skeleton.boneColor") ?: s.boneColor,
      boneWidth = number(d["boneWidth"], "skeleton.boneWidth", 0.0, 100.0) ?: s.boneWidth,
      jointColor = color(d["jointColor"], "skeleton.jointColor") ?: s.jointColor,
      jointRadius = number(d["jointRadius"], "skeleton.jointRadius", 0.0, 100.0) ?: s.jointRadius,
      minConfidence = number(d["minConfidence"], "skeleton.minConfidence", 0.0, 1.0) ?: s.minConfidence,
      fadeWithConfidence = bool(d["fadeWithConfidence"], "skeleton.fadeWithConfidence") ?: s.fadeWithConfidence
    )
    if (bool(d["showJoints"], "skeleton.showJoints") == false) {
      s = s.copy(joints = s.joints.map { it.copy(visible = false) })
    }
    d["bones"]?.let { raw ->
      val bones = s.bones.toMutableList()
      for ((name, value) in dict(raw, "skeleton.bones")) {
        val path = "skeleton.bones.$name"
        val i = Skeleton.bones.indexOfFirst { it.name == name }
        if (i < 0) throw ConfigError(path, "unknown bone")
        val b = dict(value, path)
        bones[i] = BoneStyle(
          visible = bool(b["visible"], "$path.visible") ?: true,
          color = color(b["color"], "$path.color"),
          width = number(b["width"], "$path.width", 0.0, 100.0)
        )
      }
      s = s.copy(bones = bones)
    }
    d["joints"]?.let { raw ->
      val joints = s.joints.toMutableList()
      for ((name, value) in dict(raw, "skeleton.joints")) {
        val path = "skeleton.joints.$name"
        val j = joint(name, path)
        val o = dict(value, path)
        joints[j.ordinal] = JointStyle(
          visible = bool(o["visible"], "$path.visible") ?: true,
          color = color(o["color"], "$path.color"),
          radius = number(o["radius"], "$path.radius", 0.0, 100.0)
        )
      }
      s = s.copy(joints = joints)
    }
    d["trails"]?.let { raw ->
      val trails = raw as? List<*> ?: throw ConfigError("skeleton.trails", "expected an array")
      s = s.copy(trails = trails.mapIndexed { i, item ->
        val path = "skeleton.trails[$i]"
        val o = dict(item, path)
        val t = TrailStyle(joint(o["joint"], "$path.joint"))
        t.copy(
          length = number(o["lengthMs"], "$path.lengthMs", 1.0, 5000.0)?.let { it / 1000 } ?: t.length,
          color = color(o["color"], "$path.color") ?: t.color,
          width = number(o["width"], "$path.width", 0.0, 100.0) ?: t.width
        )
      })
    }
    return s
  }

  fun joint(v: Any?, path: String): Joint =
    (v as? String)?.let { jointNamed(it) } ?: throw ConfigError(path, "unknown joint '$v'")

  @Suppress("UNCHECKED_CAST")
  fun dict(v: Any?, path: String): Map<String, Any?> =
    v as? Map<String, Any?> ?: throw ConfigError(path, "expected an object")

  fun string(v: Any?, path: String): String? {
    if (v == null) return null
    return v as? String ?: throw ConfigError(path, "expected a string")
  }

  fun requiredString(v: Any?, path: String): String {
    val s = string(v, path)
    if (s.isNullOrEmpty()) throw ConfigError(path, "is required")
    return s
  }

  fun bool(v: Any?, path: String): Boolean? {
    if (v == null) return null
    return v as? Boolean ?: throw ConfigError(path, "expected a boolean")
  }

  fun number(v: Any?, path: String, lo: Double = -Double.MAX_VALUE, hi: Double = Double.MAX_VALUE): Double? {
    if (v == null) return null
    val n = (v as? Number)?.toDouble() ?: throw ConfigError(path, "expected a number")
    if (!n.isFinite()) throw ConfigError(path, "must be finite")
    if (n < lo || n > hi) throw ConfigError(path, "must be between $lo and $hi")
    return n
  }

  fun requiredNumber(v: Any?, path: String): Double =
    number(v, path) ?: throw ConfigError(path, "is required")

  /** RN's processColor gives a signed Int32 on Android and unsigned ARGB on iOS. Both wrap to the same Int. */
  fun color(v: Any?, path: String): Int? = number(v, path)?.toLong()?.toInt()
}
