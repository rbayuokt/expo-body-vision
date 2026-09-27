import Foundation

struct ConfigError: Error, Equatable {
  let path: String
  let message: String

  var description: String {
    "\(path): \(message)"
  }
}

struct EngineConfig: Equatable {
  var tracking = TrackingParams()
  var performance = PerformanceMode.auto
  var poses: [PoseRuleDefinition] = []
  var exercises: [ExerciseDefinition] = []
  var targets: [TargetDefinition] = []
  var readiness: ReadinessParams?
  /// Torso length from a saved calibration.
  var calibration: Double?
}

/**
 Parses the plain dictionaries JS sends (after `definePose`/`defineExercise` have built them) and
 re-validates everything, since native can't trust that the JS helpers were used.
 */
enum ConfigParser {
  static func engine(_ d: [String: Any]) throws -> EngineConfig {
    var c = EngineConfig()
    if let s = d["smoothing"] {
      c.tracking.smoothing = try smoothing(s, "smoothing")
    }
    if let p = d["prediction"] {
      if let enabled = p as? Bool {
        c.tracking.predictionEnabled = enabled
      } else {
        let p = try dict(p, "prediction")
        c.tracking.predictionEnabled = try bool(p["enabled"], "prediction.enabled") ?? true
        if let ms = try number(p["maxMs"], "prediction.maxMs", min: 0, max: 250) {
          c.tracking.maxPrediction = ms / 1000
        }
      }
    }
    if let t = d["tracking"] {
      let t = try dict(t, "tracking")
      c.tracking.minJointConfidence = try number(t["minJointConfidence"], "tracking.minJointConfidence", min: 0, max: 1) ?? c.tracking.minJointConfidence
      c.tracking.jointHold = try number(t["jointHoldMs"], "tracking.jointHoldMs", min: 0, max: 5000).map { $0 / 1000 } ?? c.tracking.jointHold
      c.tracking.lostAfter = try number(t["lostAfterMs"], "tracking.lostAfterMs", min: 0, max: 10000).map { $0 / 1000 } ?? c.tracking.lostAfter
    }
    if let p = try string(d["performance"], "performance") {
      guard let mode = PerformanceMode(rawValue: p) else { throw ConfigError(path: "performance", message: "unknown mode '\(p)'") }
      c.performance = mode
    }
    c.calibration = try number(d["calibration"], "calibration", min: 0.001, max: 10)
    if let r = d["readiness"], !(r is NSNull) {
      c.readiness = try readiness(r)
    }
    if let rules = d["rules"] {
      guard let rules = rules as? [Any] else { throw ConfigError(path: "rules", message: "expected an array") }
      var ids = Set<String>()
      for (i, raw) in rules.enumerated() {
        let path = "rules[\(i)]"
        let r = try dict(raw, path)
        let type = try string(r["type"], "\(path).type")
        let id = try requiredString(r["id"], "\(path).id")
        guard ids.insert("\(type ?? "")/\(id)").inserted else { throw ConfigError(path: "\(path).id", message: "duplicate id '\(id)'") }
        switch type {
        case "pose": c.poses.append(try pose(r, id, path))
        case "exercise": c.exercises.append(try exercise(r, id, path))
        case "target": c.targets.append(try target(r, id, path))
        default: throw ConfigError(path: "\(path).type", message: "expected 'pose', 'exercise' or 'target'")
        }
      }
    }
    return c
  }

  static func smoothing(_ v: Any, _ path: String) throws -> SmoothingParams {
    if let name = v as? String {
      guard let p = SmoothingParams.preset(name) else { throw ConfigError(path: path, message: "unknown preset '\(name)'") }
      return p
    }
    let d = try dict(v, path)
    let minCutoff = try number(d["minCutoff"], "\(path).minCutoff", min: 0.001, max: 1000) ?? 1.2
    let beta = try number(d["beta"], "\(path).beta", min: 0, max: 1000) ?? 15
    let dCutoff = try number(d["derivativeCutoff"], "\(path).derivativeCutoff", min: 0.001, max: 1000) ?? 1
    return SmoothingParams(minCutoff: minCutoff, beta: beta, derivativeCutoff: dCutoff)
  }

  static func readiness(_ v: Any) throws -> ReadinessParams {
    var p = ReadinessParams()
    if v as? Bool == true { return p }
    let d = try dict(v, "readiness")
    if let f = try string(d["framing"], "readiness.framing") {
      guard let framing = Framing(rawValue: f) else { throw ConfigError(path: "readiness.framing", message: "expected 'fullBody', 'upperBody' or 'floor'") }
      p.framing = framing
    }
    p.minBodyHeight = try number(d["minBodyHeight"], "readiness.minBodyHeight", min: 0.05, max: 1)
    p.centerTolerance = try number(d["centerTolerance"], "readiness.centerTolerance", min: 0, max: 0.5) ?? p.centerTolerance
    p.stillSpeed = try number(d["stillSpeed"], "readiness.stillSpeed", min: 0, max: 100) ?? p.stillSpeed
    return p
  }

  static func pose(_ r: [String: Any], _ id: String, _ path: String) throws -> PoseRuleDefinition {
    guard let list = r["conditions"] as? [Any], !list.isEmpty else {
      throw ConfigError(path: "\(path).conditions", message: "needs at least one condition")
    }
    var def = PoseRuleDefinition(id: id, conditions: try list.enumerated().map { try condition($1, "\(path).conditions[\($0)]") })
    def.hold = try number(r["holdMs"], "\(path).holdMs", min: 0, max: 60000).map { $0 / 1000 } ?? def.hold
    def.exitGrace = try number(r["exitGraceMs"], "\(path).exitGraceMs", min: 0, max: 60000).map { $0 / 1000 } ?? def.exitGrace
    def.minConfidence = try number(r["minConfidence"], "\(path).minConfidence", min: 0, max: 1) ?? def.minConfidence
    return def
  }

  static func exercise(_ r: [String: Any], _ id: String, _ path: String) throws -> ExerciseDefinition {
    let m = try metric(r["metric"] as Any, "\(path).metric")
    let top = try requiredNumber(r["top"], "\(path).top")
    let bottom = try requiredNumber(r["bottom"], "\(path).bottom")
    guard top > bottom else { throw ConfigError(path: "\(path).top", message: "must be greater than bottom") }
    var def = ExerciseDefinition(id: id, metric: m, top: top, bottom: bottom)
    def.hysteresis = try number(r["hysteresis"], "\(path).hysteresis", min: 0, max: 1000) ?? def.hysteresis
    guard top - def.hysteresis > bottom + def.hysteresis else {
      throw ConfigError(path: "\(path).hysteresis", message: "top - hysteresis must stay above bottom + hysteresis")
    }
    def.minRep = try number(r["minRepMs"], "\(path).minRepMs", min: 0, max: 600000).map { $0 / 1000 } ?? def.minRep
    def.maxRep = try number(r["maxRepMs"], "\(path).maxRepMs", min: 0, max: 600000).map { $0 / 1000 } ?? def.maxRep
    def.lossGrace = try number(r["lossGraceMs"], "\(path).lossGraceMs", min: 0, max: 60000).map { $0 / 1000 } ?? def.lossGrace
    def.minConfidence = try number(r["minConfidence"], "\(path).minConfidence", min: 0, max: 1) ?? def.minConfidence
    switch r["mode"] {
    case nil, "cycle" as String: break
    case "peak" as String: def.peak = true
    default: throw ConfigError(path: "\(path).mode", message: "expected 'cycle' or 'peak'")
    }
    if let list = r["requires"] {
      guard let list = list as? [Any] else { throw ConfigError(path: "\(path).requires", message: "expected an array") }
      def.requires = try list.enumerated().map { try condition($1, "\(path).requires[\($0)]") }
    }
    return def
  }

  static func target(_ r: [String: Any], _ id: String, _ path: String) throws -> TargetDefinition {
    var t = TargetDefinition(
      id: id,
      x: try requiredNumber(r["x"], "\(path).x"),
      y: try requiredNumber(r["y"], "\(path).y"),
      radius: try number(r["radius"], "\(path).radius", min: 0.001, max: 10) ?? 0.08
    )
    if let list = r["colliders"] {
      guard let names = list as? [Any], !names.isEmpty else { throw ConfigError(path: "\(path).colliders", message: "needs at least one joint") }
      t.colliders = try names.enumerated().map { try joint($1, "\(path).colliders[\($0)]") }
    }
    t.colliderRadius = try number(r["colliderRadius"], "\(path).colliderRadius", min: 0, max: 10) ?? t.colliderRadius
    t.minSpeed = try number(r["minSpeed"], "\(path).minSpeed", min: 0, max: 1000) ?? t.minSpeed
    t.cooldown = try number(r["cooldownMs"], "\(path).cooldownMs", min: 0, max: 600000).map { $0 / 1000 } ?? t.cooldown
    t.minConfidence = try number(r["minConfidence"], "\(path).minConfidence", min: 0, max: 1) ?? t.minConfidence
    if let m = try string(r["mode"], "\(path).mode") {
      guard let mode = TargetMode(rawValue: m) else { throw ConfigError(path: "\(path).mode", message: "expected 'hit' or 'zone'") }
      t.mode = mode
    }
    if let s = r["style"] {
      let s = try dict(s, "\(path).style")
      t.style.color = try color(s["color"], "\(path).style.color") ?? t.style.color
      t.style.hitColor = try color(s["hitColor"], "\(path).style.hitColor") ?? t.style.hitColor
      t.style.lineWidth = try number(s["lineWidth"], "\(path).style.lineWidth", min: 0, max: 100) ?? t.style.lineWidth
      t.style.filled = try bool(s["filled"], "\(path).style.filled") ?? t.style.filled
      t.style.visible = try bool(s["visible"], "\(path).style.visible") ?? t.style.visible
      t.style.particles = Int(try number(s["particles"], "\(path).style.particles", min: 0, max: 64) ?? Double(t.style.particles))
      t.style.effectDuration = try number(s["effectDurationMs"], "\(path).style.effectDurationMs", min: 1, max: 10000).map { $0 / 1000 } ?? t.style.effectDuration
    }
    return t
  }

  static func condition(_ v: Any, _ path: String) throws -> Condition {
    let d = try dict(v, path)
    let m = try metric(d, path)
    let lo = try number(d["min"], "\(path).min")
    let hi = try number(d["max"], "\(path).max")
    guard lo != nil || hi != nil else { throw ConfigError(path: path, message: "needs min or max") }
    if let lo = lo, let hi = hi, lo > hi { throw ConfigError(path: "\(path).min", message: "is greater than max") }
    let h = try number(d["hysteresis"], "\(path).hysteresis", min: 0, max: 1000) ?? (m.kind.isAngular ? 8 : 0.1)
    return Condition(metric: m, min: lo, max: hi, hysteresis: h)
  }

  static func metric(_ v: Any, _ path: String) throws -> Metric {
    let d = try dict(v, path)
    let kindName = try requiredString(d["kind"], "\(path).kind")
    guard let kind = MetricKind(rawValue: kindName) else {
      throw ConfigError(path: "\(path).kind", message: "unknown metric '\(kindName)'")
    }
    guard let names = d["joints"] as? [Any], names.count == kind.jointCount else {
      throw ConfigError(path: "\(path).joints", message: "'\(kindName)' needs \(kind.jointCount) joints")
    }
    let joints = try names.enumerated().map { try joint($1, "\(path).joints[\($0)]") }
    return Metric(kind: kind, joints: joints, mirror: try bool(d["mirror"], "\(path).mirror") ?? false)
  }

  static func skeleton(_ d: [String: Any]) throws -> SkeletonStyle {
    var s = SkeletonStyle()
    s.visible = try bool(d["visible"], "skeleton.visible") ?? s.visible
    s.boneColor = try color(d["boneColor"], "skeleton.boneColor") ?? s.boneColor
    s.boneWidth = try number(d["boneWidth"], "skeleton.boneWidth", min: 0, max: 100) ?? s.boneWidth
    s.jointColor = try color(d["jointColor"], "skeleton.jointColor") ?? s.jointColor
    s.jointRadius = try number(d["jointRadius"], "skeleton.jointRadius", min: 0, max: 100) ?? s.jointRadius
    s.minConfidence = try number(d["minConfidence"], "skeleton.minConfidence", min: 0, max: 1) ?? s.minConfidence
    s.fadeWithConfidence = try bool(d["fadeWithConfidence"], "skeleton.fadeWithConfidence") ?? s.fadeWithConfidence
    if let showJoints = try bool(d["showJoints"], "skeleton.showJoints"), !showJoints {
      s.joints = s.joints.map { var j = $0; j.visible = false; return j }
    }
    if let bones = d["bones"] {
      let bones = try dict(bones, "skeleton.bones")
      for (name, raw) in bones {
        let path = "skeleton.bones.\(name)"
        guard let i = Skeleton.bones.firstIndex(where: { $0.name == name }) else { throw ConfigError(path: path, message: "unknown bone") }
        let b = try dict(raw, path)
        s.bones[i].visible = try bool(b["visible"], "\(path).visible") ?? true
        s.bones[i].color = try color(b["color"], "\(path).color")
        s.bones[i].width = try number(b["width"], "\(path).width", min: 0, max: 100)
      }
    }
    if let joints = d["joints"] {
      let joints = try dict(joints, "skeleton.joints")
      for (name, raw) in joints {
        let path = "skeleton.joints.\(name)"
        let j = try joint(name, path)
        let o = try dict(raw, path)
        s.joints[j.rawValue].visible = try bool(o["visible"], "\(path).visible") ?? true
        s.joints[j.rawValue].color = try color(o["color"], "\(path).color")
        s.joints[j.rawValue].radius = try number(o["radius"], "\(path).radius", min: 0, max: 100)
      }
    }
    if let trails = d["trails"] {
      guard let trails = trails as? [Any] else { throw ConfigError(path: "skeleton.trails", message: "expected an array") }
      s.trails = try trails.enumerated().map { i, raw in
        let path = "skeleton.trails[\(i)]"
        let o = try dict(raw, path)
        var t = TrailStyle(joint: try joint(o["joint"] as Any, "\(path).joint"))
        t.length = try number(o["lengthMs"], "\(path).lengthMs", min: 1, max: 5000).map { $0 / 1000 } ?? t.length
        t.color = try color(o["color"], "\(path).color") ?? t.color
        t.width = try number(o["width"], "\(path).width", min: 0, max: 100) ?? t.width
        return t
      }
    }
    return s
  }

  // MARK: - Primitives

  static func joint(_ v: Any, _ path: String) throws -> Joint {
    guard let name = v as? String, let j = Joint.named(name) else {
      throw ConfigError(path: path, message: "unknown joint '\(v)'")
    }
    return j
  }

  static func dict(_ v: Any, _ path: String) throws -> [String: Any] {
    guard let d = v as? [String: Any] else { throw ConfigError(path: path, message: "expected an object") }
    return d
  }

  static func string(_ v: Any?, _ path: String) throws -> String? {
    guard let v = v, !(v is NSNull) else { return nil }
    guard let s = v as? String else { throw ConfigError(path: path, message: "expected a string") }
    return s
  }

  static func requiredString(_ v: Any?, _ path: String) throws -> String {
    guard let s = try string(v, path), !s.isEmpty else { throw ConfigError(path: path, message: "is required") }
    return s
  }

  static func bool(_ v: Any?, _ path: String) throws -> Bool? {
    guard let v = v, !(v is NSNull) else { return nil }
    guard let b = v as? Bool else { throw ConfigError(path: path, message: "expected a boolean") }
    return b
  }

  static func number(_ v: Any?, _ path: String, min lo: Double = -.greatestFiniteMagnitude, max hi: Double = .greatestFiniteMagnitude) throws -> Double? {
    guard let v = v, !(v is NSNull) else { return nil }
    let n: Double
    if let d = v as? Double {
      n = d
    } else if let i = v as? Int {
      n = Double(i)
    } else {
      throw ConfigError(path: path, message: "expected a number")
    }
    guard n.isFinite else { throw ConfigError(path: path, message: "must be finite") }
    guard n >= lo && n <= hi else { throw ConfigError(path: path, message: "must be between \(lo) and \(hi)") }
    return n
  }

  static func requiredNumber(_ v: Any?, _ path: String) throws -> Double {
    guard let n = try number(v, path) else { throw ConfigError(path: path, message: "is required") }
    return n
  }

  /// RN's processColor gives unsigned ARGB on iOS and a signed Int32 on Android.
  static func color(_ v: Any?, _ path: String) throws -> UInt32? {
    guard let n = try number(v, path) else { return nil }
    return UInt32(truncatingIfNeeded: Int64(n))
  }
}
