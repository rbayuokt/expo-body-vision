import Foundation
import XCTest

/// Parsed fixtures/*.csv (see scripts/generate-fixtures.js).
struct Fixture {
  let name: String
  let aspect: Double
  let configs: [[String: Any]]
  let expect: [String: String]
  let samples: [BodySample]

  static var directory: URL {
    if let dir = ProcessInfo.processInfo.environment["BODY_VISION_FIXTURES"] {
      return URL(fileURLWithPath: dir)
    }
    return URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../fixtures").standardized
  }

  static func all() throws -> [Fixture] {
    let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == "csv" }
      .sorted { $0.lastPathComponent < $1.lastPathComponent }
    return try files.map { try load($0) }
  }

  static func load(_ url: URL) throws -> Fixture {
    let text = try String(contentsOf: url, encoding: .utf8)
    var aspect = 1.0
    var configs: [[String: Any]] = []
    var expect: [String: String] = [:]
    var samples: [BodySample] = []
    for line in text.split(separator: "\n") {
      if line.hasPrefix("# aspect: ") {
        aspect = Double(line.dropFirst(10))!
      } else if line.hasPrefix("# config: ") {
        let json = try JSONSerialization.jsonObject(with: Data(line.dropFirst(10).utf8))
        configs.append(json as! [String: Any])
      } else if line.hasPrefix("# expect: ") {
        let kv = line.dropFirst(10).split(separator: "=", maxSplits: 1)
        expect[String(kv[0])] = String(kv[1])
      } else if !line.hasPrefix("#") {
        let v = line.split(separator: ",").map { Double($0)! }
        let s = BodySample()
        s.clear(timestamp: v[0] / 1000, aspect: aspect)
        s.present = v[1] == 1
        if s.present {
          for i in 0..<Joint.count {
            s.x[i] = v[2 + i * 3]
            s.y[i] = v[3 + i * 3]
            s.confidence[i] = v[4 + i * 3]
          }
        }
        samples.append(s)
      }
    }
    return Fixture(name: url.deletingPathExtension().lastPathComponent, aspect: aspect, configs: configs, expect: expect, samples: samples)
  }
}

struct FixtureRun {
  let events: [EngineEvent]
  let trace: String
}

func runFixture(_ fixture: Fixture, prediction: ((BodyEngine, Double) -> Void)? = nil) throws -> FixtureRun {
  let engine = BodyEngine()
  let rules = fixture.configs.filter { !["view", "readiness"].contains($0["type"] as? String) }
  var config: [String: Any] = ["rules": rules]
  if let r = fixture.configs.first(where: { $0["type"] as? String == "readiness" }) {
    config["readiness"] = r
  }
  engine.configure(try ConfigParser.engine(config))
  if let v = fixture.configs.first(where: { $0["type"] as? String == "view" }) {
    engine.view = ViewTransform(
      width: v["width"] as! Double,
      height: v["height"] as! Double,
      mirrored: v["mirrored"] as! Bool,
      cover: v["resizeMode"] as? String != "contain",
      imageAspect: fixture.aspect
    )
  }
  var events: [EngineEvent] = []
  for (i, s) in fixture.samples.enumerated() {
    engine.process(s)
    if let batch = engine.events.takeBatch(now: s.timestamp) {
      events += batch.events
      engine.events.acknowledge(batch.sequence)
    }
    if let prediction = prediction, i + 1 < fixture.samples.count {
      let next = fixture.samples[i + 1].timestamp
      for k in 1...4 {
        prediction(engine, s.timestamp + (next - s.timestamp) * Double(k) / 4)
      }
    }
  }
  return FixtureRun(events: events, trace: trace(events))
}

/// Event trace compared across Swift and Kotlin: type, subject and time in whole ms.
func trace(_ events: [EngineEvent]) -> String {
  events.map { e in
    let subject = e.payload["exercise"] ?? e.payload["pose"] ?? e.payload["target"] ?? e.payload["bodyId"] ?? ""
    var extra = ""
    if let phase = e.payload["phase"] { extra = " \(phase)" }
    if let reason = e.payload["reason"] { extra = " \(reason)" }
    if let count = e.payload["count"] { extra = " \(count)" }
    if let side = e.payload["side"] { extra += " \(side)" }
    if e.type == "readiness" { extra = " \(e.payload["issue"] as? String ?? "ready")" }
    return "\(Int((e.time * 1000).rounded())) \(e.type) \(subject)\(extra)"
  }.joined(separator: "\n") + "\n"
}

final class FixtureTests: XCTestCase {
  func testFixturesMeetExpectations() throws {
    let fixtures = try Fixture.all()
    XCTAssertGreaterThanOrEqual(fixtures.count, 9)
    for f in fixtures {
      let r = try runFixture(f)
      for (key, value) in f.expect {
        let parts = key.split(separator: ".").map(String.init)
        switch parts[0] {
        case "phases":
          let phases = r.events.filter { $0.type == "exercisePhase" }.map { $0.payload["phase"] as! String }
          let expected = value.split(separator: ",").map(String.init)
          XCTAssertEqual(Array(phases.prefix(expected.count)), expected, "\(f.name) phases")
        case "readinessSeq", "readinessLast":
          let seen = r.events.filter { $0.type == "readiness" }.map { $0.payload["issue"] as? String ?? "ready" }
          if parts[0] == "readinessLast" {
            XCTAssertEqual(seen.last, value, "\(f.name) \(r.trace)")
          } else {
            var rest = value.split(separator: ",").map(String.init)[...]
            for s in seen where s == rest.first { rest = rest.dropFirst() }
            XCTAssert(rest.isEmpty, "\(f.name): expected \(value) in order, saw \(seen)")
          }
        case "bodyLost", "bodyDetected":
          XCTAssertEqual(r.events.filter { $0.type == parts[0] }.count, Int(value), "\(f.name) \(key)")
        default:
          let (type, field): (String, String) = [
            "reps": ("repCompleted", "exercise"),
            "rejected": ("repRejected", "exercise"),
            "entered": ("poseEntered", "pose"),
            "exited": ("poseExited", "pose"),
            "hits": ("targetHit", "target")
          ][parts[0]]!
          let n = r.events.filter { $0.type == type && $0.payload[field] as? String == parts[1] }.count
          XCTAssertEqual(n, Int(value), "\(f.name) \(key)\n\(r.trace)")
        }
      }
    }
  }

  /// Golden traces are shared with the Kotlin suite. Both must produce them byte for byte.
  func testTracesMatchGolden() throws {
    let dir = Fixture.directory.appendingPathComponent("golden")
    let update = ProcessInfo.processInfo.environment["UPDATE_GOLDEN"] == "1"
    if update { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }
    for f in try Fixture.all() {
      let url = dir.appendingPathComponent("\(f.name).txt")
      let trace = try runFixture(f).trace
      if update {
        try trace.write(to: url, atomically: true, encoding: .utf8)
      } else {
        XCTAssertEqual(trace, try String(contentsOf: url, encoding: .utf8), f.name)
      }
    }
  }

  func testPredictionStaysFiniteAndBounded() throws {
    var x = [Double](repeating: 0, count: Joint.count)
    var y = x, c = x
    for f in try Fixture.all() {
      _ = try runFixture(f) { engine, t in
        engine.tracker.predict(at: t, x: &x, y: &y, confidence: &c)
        for i in 0..<Joint.count where c[i] > 0 {
          XCTAssert(x[i].isFinite && y[i].isFinite, "\(f.name) non-finite joint \(i)")
          XCTAssert(x[i] >= -0.25 && x[i] <= 1.25 && y[i] >= -0.25 && y[i] <= 1.25, "\(f.name) joint \(i) out of bounds")
        }
      }
    }
  }
}
