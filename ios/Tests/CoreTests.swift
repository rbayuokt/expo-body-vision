import Foundation
import XCTest

final class CoreTests: XCTestCase {
  func testOneEuroLagsLessOnFastMovementThanStablePreset() {
    func lag(_ preset: String) -> Double {
      var f = OneEuroFilter(params: SmoothingParams.preset(preset)!)
      var worst = 0.0
      for i in 0...30 {
        let t = Double(i) / 30
        let x = min(t * 3, 1)
        worst = max(worst, abs(f.filter(x, at: t) - x))
      }
      return worst
    }
    XCTAssertLessThan(lag("light"), lag("stable"))
    XCTAssertLessThan(lag("light"), 0.1)
    XCTAssertEqual(lag("none"), 0, accuracy: 0.01)
  }

  func testOneEuroDampsJitterAtRest() {
    var f = OneEuroFilter(params: SmoothingParams.preset("stable")!)
    var out: [Double] = []
    for i in 0..<60 {
      out.append(f.filter(0.5 + (i % 2 == 0 ? 0.01 : -0.01), at: Double(i) / 30))
    }
    let tail = out.suffix(20)
    XCTAssertLessThan(tail.max()! - tail.min()!, 0.01)
  }

  func testViewTransformCoverMirrorsAndCrops() {
    let t = ViewTransform(width: 300, height: 600, mirrored: true, cover: true, imageAspect: 3.0 / 4.0)
    // 3:4 image in a 1:2 view: height fits, width overflows by 150 px.
    let center = t.point(x: 0.5, y: 0.5)
    XCTAssertEqual(center.x, 150, accuracy: 1e-9)
    XCTAssertEqual(center.y, 300, accuracy: 1e-9)
    let leftEdge = t.point(x: 0, y: 0)
    XCTAssertEqual(leftEdge.x, 150 + 225, accuracy: 1e-9)
    let back = t.imagePoint(x: leftEdge.x, y: leftEdge.y)
    XCTAssertEqual(back.x, 0, accuracy: 1e-9)
    XCTAssertEqual(back.y, 0, accuracy: 1e-9)
  }

  func testViewTransformContainLetterboxes() {
    let t = ViewTransform(width: 400, height: 400, mirrored: false, cover: false, imageAspect: 16.0 / 9.0)
    let top = t.point(x: 0, y: 0)
    XCTAssertEqual(top.x, 0, accuracy: 1e-9)
    XCTAssertEqual(top.y, (400 - 225) / 2, accuracy: 1e-9)
  }

  func testEventQueueHoldsOneBatchUntilAcknowledged() {
    let q = EventQueue(capacity: 4, ackTimeout: 2)
    q.push(EngineEvent("repCompleted", 0))
    let first = q.takeBatch(now: 0)!
    for i in 0..<10 {
      q.push(EngineEvent("repCompleted", Double(i)))
      q.publish(EngineEvent("stats", Double(i), ["n": i]))
    }
    XCTAssertNil(q.takeBatch(now: 1), "no second batch while the first is unacknowledged")
    q.acknowledge(first.sequence)
    let second = q.takeBatch(now: 1)!
    XCTAssertEqual(second.events.filter { $0.type == "repCompleted" }.count, 4)
    XCTAssertEqual(second.dropped, 6)
    let stats = second.events.filter { $0.type == "stats" }
    XCTAssertEqual(stats.count, 1)
    XCTAssertEqual(stats[0].payload["n"] as? Int, 9)
  }

  func testEventQueueResumesAfterAckTimeout() {
    let q = EventQueue(capacity: 4, ackTimeout: 2)
    q.push(EngineEvent("a", 0))
    _ = q.takeBatch(now: 0)
    q.push(EngineEvent("b", 0))
    XCTAssertNil(q.takeBatch(now: 1.9))
    XCTAssertNotNil(q.takeBatch(now: 2.1))
  }

  func testConfigRejectsInvalidRules() {
    let cases: [([String: Any], String)] = [
      (["type": "pose", "id": "p", "conditions": [["kind": "angle", "joints": ["leftShoulder", "leftElbow"], "min": 1]]], "rules[0].conditions[0].joints"),
      (["type": "pose", "id": "p", "conditions": [["kind": "angle", "joints": ["leftShoulder", "leftElbow", "leftFoot"], "min": 1]]], "rules[0].conditions[0].joints[2]"),
      (["type": "pose", "id": "p", "conditions": [["kind": "inclination", "joints": ["leftShoulder", "leftElbow"]]]], "rules[0].conditions[0]"),
      (["type": "exercise", "id": "e", "metric": ["kind": "angle", "joints": ["leftHip", "leftKnee", "leftAnkle"]], "top": 100, "bottom": 120], "rules[0].top"),
      (["type": "target", "id": "t", "x": 0.5, "y": 0.5, "radius": -1], "rules[0].radius"),
      (["type": "wobble", "id": "w"], "rules[0].type")
    ]
    for (rule, path) in cases {
      XCTAssertThrowsError(try ConfigParser.engine(["rules": [rule]])) { error in
        XCTAssertEqual((error as? ConfigError)?.path, path)
      }
    }
    XCTAssertThrowsError(try ConfigParser.engine(["rules": [
      ["type": "target", "id": "t", "x": 0.5, "y": 0.5],
      ["type": "target", "id": "t", "x": 0.2, "y": 0.5]
    ]]))
  }

  func testReconfigureKeepsCountsOfUnchangedExercises() throws {
    let presets = try JSONSerialization.jsonObject(with: Data(contentsOf: Fixture.directory.appendingPathComponent("presets.json"))) as! [String: Any]
    let engine = BodyEngine()
    engine.configure(try ConfigParser.engine(["rules": [presets["pushup"]!]]))
    let counter = engine.exercises[0]
    engine.configure(try ConfigParser.engine(["rules": [presets["pushup"]!, presets["tpose"]!], "smoothing": "light"]))
    XCTAssert(engine.exercises[0] === counter)
  }

  func testGovernorBacksOffAndRecovers() {
    let g = PerformanceGovernor(mode: .auto)
    XCTAssertEqual(g.inferenceFps, 24)
    var t = 0.0
    while t < 3 {
      g.record(latencyMs: 60, at: t)
      t += 1.0 / 24
    }
    XCTAssertLessThan(g.inferenceFps, 24)
    let reduced = g.inferenceFps
    while t < 12 {
      g.record(latencyMs: 5, at: t)
      t += 1.0 / 24
    }
    XCTAssertGreaterThan(g.inferenceFps, reduced)
    g.setThermal(3, at: t)
    XCTAssertEqual(g.inferenceFps, 10)
    XCTAssertTrue(g.reducedEffects)
  }

  func testFixedModesIgnoreLatency() {
    let g = PerformanceGovernor(mode: .accuracy)
    for i in 0..<100 {
      g.record(latencyMs: 200, at: Double(i) / 10)
    }
    XCTAssertEqual(g.inferenceFps, 30)
  }

  func testTrackerLosesBodyAndIssuesNewId() {
    let tracker = BodyTracker()
    let s = BodySample()
    s.clear(timestamp: 0, aspect: 1)
    s.present = true
    for i in 0..<Joint.count {
      s.x[i] = 0.5
      s.y[i] = 0.5
      s.confidence[i] = 0.9
    }
    XCTAssertEqual(tracker.update(s), .detected)
    let absent = BodySample()
    absent.clear(timestamp: 0.3, aspect: 1)
    XCTAssertEqual(tracker.update(absent), .none)
    absent.clear(timestamp: 0.6, aspect: 1)
    XCTAssertEqual(tracker.update(absent), .lost)
    s.timestamp = 0.7
    XCTAssertEqual(tracker.update(s), .detected)
    XCTAssertEqual(tracker.bodyId, 2)
  }

  func testSweptHitCatchesTargetSkippedBetweenSamples() {
    XCTAssertEqual(segmentDistance((50, 50), (0, 50), (100, 50)), 0, accuracy: 1e-9)
    XCTAssertEqual(segmentDistance((50, 60), (0, 50), (100, 50)), 10, accuracy: 1e-9)
    XCTAssertEqual(segmentDistance((150, 50), (0, 50), (100, 50)), 50, accuracy: 1e-9)
  }

  func testSceneDrawsSkeletonInViewSpace() throws {
    let f = try Fixture.load(Fixture.directory.appendingPathComponent("tpose-hold.csv"))
    let engine = BodyEngine()
    engine.view = ViewTransform(width: 360, height: 640, mirrored: true, cover: true, imageAspect: f.aspect)
    for s in f.samples.prefix(30) { engine.process(s) }
    let builder = SceneBuilder()
    engine.buildScene(builder, at: f.samples[29].timestamp + 0.016)
    let lines = builder.list.commands.filter { $0.kind == .line }
    XCTAssertEqual(lines.count, Skeleton.bones.count)
    for c in builder.list.commands {
      XCTAssert(c.x1 >= 0 && c.x1 <= 360 && c.y1 >= 0 && c.y1 <= 640)
    }
    // Mirrored front preview: the person's left shoulder is on the viewer's left.
    let left = engine.view.point(x: engine.tracker.x(Joint.leftShoulder.rawValue), y: 0)
    let right = engine.view.point(x: engine.tracker.x(Joint.rightShoulder.rawValue), y: 0)
    XCTAssertLessThan(left.x, right.x)
  }

  func testCalibrationCompletesOnWalkInFixture() throws {
    let f = try Fixture.load(Fixture.directory.appendingPathComponent("setup-walk-in.csv"))
    let engine = BodyEngine()
    var outcome: EngineEvent?
    var started = false
    for s in f.samples {
      if !started && s.timestamp >= 5.5 {
        started = true
        engine.startCalibration(duration: 2, at: s.timestamp)
      }
      engine.process(s)
      if let batch = engine.events.takeBatch(now: s.timestamp) {
        engine.events.acknowledge(batch.sequence)
        outcome = outcome ?? batch.events.first { $0.type.hasPrefix("calibration") }
      }
    }
    XCTAssertEqual(outcome?.type, "calibrationCompleted", "\(outcome?.payload ?? [:])")
    let torso = (outcome?.payload["measurements"] as? [String: Double])?["torsoLength"] ?? 0
    // frontPose torso is 0.24 image heights at scale 0.7.
    XCTAssertEqual(torso, 0.24 * 0.7, accuracy: 0.01)
  }

  func testRotationReseatsJointsWithoutLosingTheBody() {
    let tracker = BodyTracker()
    let s = BodySample()
    s.clear(timestamp: 0, aspect: 9.0 / 16)
    s.present = true
    for i in 0..<Joint.count {
      s.x[i] = 0.2
      s.y[i] = 0.3
      s.confidence[i] = 0.9
    }
    XCTAssertEqual(tracker.update(s), .detected)
    s.timestamp = 0.033
    s.aspect = 16.0 / 9
    for i in 0..<Joint.count {
      s.x[i] = 0.7
      s.y[i] = 0.8
    }
    XCTAssertEqual(tracker.update(s), .none)
    XCTAssertEqual(tracker.bodyId, 1)
    // Seated at the new position with no velocity from the jump.
    XCTAssertEqual(tracker.x(0), 0.7, accuracy: 1e-9)
    XCTAssertEqual(tracker.velocityX(0), 0, accuracy: 1e-9)
  }

  func testFloorFramingAsksForLandscape() throws {
    let f = try Fixture.load(Fixture.directory.appendingPathComponent("setup-floor.csv"))
    let engine = BodyEngine()
    engine.configure(try ConfigParser.engine(["readiness": ["framing": "floor"]]))
    engine.view = ViewTransform(width: 390, height: 844, mirrored: false, cover: true, imageAspect: f.aspect)
    var issues: [String] = []
    for s in f.samples {
      engine.process(s)
      if let b = engine.events.takeBatch(now: s.timestamp) {
        engine.events.acknowledge(b.sequence)
        issues += b.events.filter { $0.type == "readiness" }.map { $0.payload["issue"] as? String ?? "ready" }
      }
    }
    XCTAssertEqual(issues, ["rotateToLandscape"])
  }

  func testSavedCalibrationSetsBodyScale() throws {
    let engine = BodyEngine()
    engine.configure(try ConfigParser.engine(["calibration": 0.2]))
    XCTAssertEqual(engine.calibratedScale, 0.2)
    engine.configure(try ConfigParser.engine(["calibration": 0.2, "smoothing": "light"]))
    XCTAssertEqual(engine.calibratedScale, 0.2)
    engine.configure(try ConfigParser.engine([:]))
    XCTAssertNil(engine.calibratedScale)
    XCTAssertThrowsError(try ConfigParser.engine(["calibration": -1]))
  }
}
