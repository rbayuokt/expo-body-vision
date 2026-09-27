package expo.modules.bodyvision.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class CoreTest {
  @Test
  fun oneEuroLagsLessOnFastMovementThanStablePreset() {
    fun lag(preset: String): Double {
      val f = OneEuroFilter(SmoothingParams.preset(preset)!!)
      var worst = 0.0
      for (i in 0..30) {
        val t = i / 30.0
        val x = min(t * 3, 1.0)
        worst = max(worst, abs(f.filter(x, t) - x))
      }
      return worst
    }
    assertTrue(lag("light") < lag("stable"))
    assertTrue(lag("light") < 0.1)
    assertEquals(0.0, lag("none"), 0.01)
  }

  @Test
  fun oneEuroDampsJitterAtRest() {
    val f = OneEuroFilter(SmoothingParams.preset("stable")!!)
    val out = (0 until 60).map { f.filter(0.5 + if (it % 2 == 0) 0.01 else -0.01, it / 30.0) }
    val tail = out.takeLast(20)
    assertTrue(tail.max() - tail.min() < 0.01)
  }

  @Test
  fun viewTransformCoverMirrorsAndCrops() {
    val t = ViewTransform(300.0, 600.0, mirrored = true, cover = true, imageAspect = 3.0 / 4.0)
    // 3:4 image in a 1:2 view: height fits, width overflows by 150 px.
    val center = t.point(0.5, 0.5)
    assertEquals(150.0, center.x, 1e-9)
    assertEquals(300.0, center.y, 1e-9)
    val leftEdge = t.point(0.0, 0.0)
    assertEquals(150.0 + 225, leftEdge.x, 1e-9)
    val back = t.imagePoint(leftEdge.x, leftEdge.y)
    assertEquals(0.0, back.x, 1e-9)
    assertEquals(0.0, back.y, 1e-9)
  }

  @Test
  fun viewTransformContainLetterboxes() {
    val t = ViewTransform(400.0, 400.0, mirrored = false, cover = false, imageAspect = 16.0 / 9.0)
    val top = t.point(0.0, 0.0)
    assertEquals(0.0, top.x, 1e-9)
    assertEquals((400.0 - 225) / 2, top.y, 1e-9)
  }

  @Test
  fun eventQueueHoldsOneBatchUntilAcknowledged() {
    val q = EventQueue(capacity = 4, ackTimeout = 2.0)
    q.push(EngineEvent("repCompleted", 0.0))
    val first = q.takeBatch(0.0)!!
    for (i in 0 until 10) {
      q.push(EngineEvent("repCompleted", i.toDouble()))
      q.publish(EngineEvent("stats", i.toDouble(), mapOf("n" to i)))
    }
    assertNull("no second batch while the first is unacknowledged", q.takeBatch(1.0))
    q.acknowledge(first.sequence)
    val second = q.takeBatch(1.0)!!
    assertEquals(4, second.events.count { it.type == "repCompleted" })
    assertEquals(6, second.dropped)
    val stats = second.events.filter { it.type == "stats" }
    assertEquals(1, stats.size)
    assertEquals(9, stats[0].payload["n"])
  }

  @Test
  fun eventQueueResumesAfterAckTimeout() {
    val q = EventQueue(capacity = 4, ackTimeout = 2.0)
    q.push(EngineEvent("a", 0.0))
    q.takeBatch(0.0)
    q.push(EngineEvent("b", 0.0))
    assertNull(q.takeBatch(1.9))
    assertNotNull(q.takeBatch(2.1))
  }

  @Test
  fun configRejectsInvalidRules() {
    val cases = listOf(
      mapOf("type" to "pose", "id" to "p", "conditions" to listOf(mapOf("kind" to "angle", "joints" to listOf("leftShoulder", "leftElbow"), "min" to 1.0))) to "rules[0].conditions[0].joints",
      mapOf("type" to "pose", "id" to "p", "conditions" to listOf(mapOf("kind" to "angle", "joints" to listOf("leftShoulder", "leftElbow", "leftFoot"), "min" to 1.0))) to "rules[0].conditions[0].joints[2]",
      mapOf("type" to "pose", "id" to "p", "conditions" to listOf(mapOf("kind" to "inclination", "joints" to listOf("leftShoulder", "leftElbow")))) to "rules[0].conditions[0]",
      mapOf("type" to "exercise", "id" to "e", "metric" to mapOf("kind" to "angle", "joints" to listOf("leftHip", "leftKnee", "leftAnkle")), "top" to 100.0, "bottom" to 120.0) to "rules[0].top",
      mapOf("type" to "target", "id" to "t", "x" to 0.5, "y" to 0.5, "radius" to -1.0) to "rules[0].radius",
      mapOf("type" to "wobble", "id" to "w") to "rules[0].type"
    )
    for ((rule, path) in cases) {
      try {
        ConfigParser.engine(mapOf("rules" to listOf(rule)))
        fail("expected $path")
      } catch (e: ConfigError) {
        assertEquals(path, e.path)
      }
    }
    try {
      ConfigParser.engine(mapOf("rules" to listOf(
        mapOf("type" to "target", "id" to "t", "x" to 0.5, "y" to 0.5),
        mapOf("type" to "target", "id" to "t", "x" to 0.2, "y" to 0.5)
      )))
      fail("expected duplicate id")
    } catch (_: ConfigError) {
    }
  }

  @Test
  fun reconfigureKeepsCountsOfUnchangedExercises() {
    val presets = Fixture.toMap(JSONObject(File(Fixture.directory, "presets.json").readText()))
    val engine = BodyEngine()
    engine.configure(ConfigParser.engine(mapOf("rules" to listOf(presets["pushup"]))))
    val counter = engine.exercises[0]
    engine.configure(ConfigParser.engine(mapOf("rules" to listOf(presets["pushup"], presets["tpose"]), "smoothing" to "light")))
    assertSame(counter, engine.exercises[0])
  }

  @Test
  fun governorBacksOffAndRecovers() {
    val g = PerformanceGovernor(PerformanceMode.auto)
    assertEquals(24.0, g.inferenceFps, 0.0)
    var t = 0.0
    while (t < 3) {
      g.record(60.0, t)
      t += 1.0 / 24
    }
    assertTrue(g.inferenceFps < 24)
    val reduced = g.inferenceFps
    while (t < 12) {
      g.record(5.0, t)
      t += 1.0 / 24
    }
    assertTrue(g.inferenceFps > reduced)
    g.setThermal(3, t)
    assertEquals(10.0, g.inferenceFps, 0.0)
    assertTrue(g.reducedEffects)
  }

  @Test
  fun fixedModesIgnoreLatency() {
    val g = PerformanceGovernor(PerformanceMode.accuracy)
    for (i in 0 until 100) g.record(200.0, i / 10.0)
    assertEquals(30.0, g.inferenceFps, 0.0)
  }

  @Test
  fun trackerLosesBodyAndIssuesNewId() {
    val tracker = BodyTracker()
    val s = BodySample()
    s.clear(0.0, 1.0)
    s.present = true
    for (i in 0 until JOINT_COUNT) {
      s.x[i] = 0.5
      s.y[i] = 0.5
      s.confidence[i] = 0.9
    }
    assertEquals(TrackerTransition.DETECTED, tracker.update(s))
    val absent = BodySample()
    absent.clear(0.3, 1.0)
    assertEquals(TrackerTransition.NONE, tracker.update(absent))
    absent.clear(0.6, 1.0)
    assertEquals(TrackerTransition.LOST, tracker.update(absent))
    s.timestamp = 0.7
    assertEquals(TrackerTransition.DETECTED, tracker.update(s))
    assertEquals(2, tracker.bodyId)
  }

  @Test
  fun sweptHitCatchesTargetSkippedBetweenSamples() {
    assertEquals(0.0, segmentDistance(50.0, 50.0, 0.0, 50.0, 100.0, 50.0), 1e-9)
    assertEquals(10.0, segmentDistance(50.0, 60.0, 0.0, 50.0, 100.0, 50.0), 1e-9)
    assertEquals(50.0, segmentDistance(150.0, 50.0, 0.0, 50.0, 100.0, 50.0), 1e-9)
  }

  @Test
  fun sceneDrawsSkeletonInViewSpace() {
    val f = Fixture.load(File(Fixture.directory, "tpose-hold.csv"))
    val engine = BodyEngine()
    engine.view = ViewTransform(360.0, 640.0, mirrored = true, cover = true, imageAspect = f.aspect)
    for (s in f.samples.take(30)) engine.process(s)
    val builder = SceneBuilder()
    engine.buildScene(builder, f.samples[29].timestamp + 0.016)
    val list = builder.list
    assertEquals(Skeleton.bones.size, (0 until list.count).count { list.kinds[it] == DrawList.LINE })
    for (i in 0 until list.count) {
      assertTrue(list.x1[i] in 0.0..360.0 && list.y1[i] in 0.0..640.0)
    }
    // Mirrored front preview: the person's left shoulder is on the viewer's left.
    val left = engine.view.pointX(engine.tracker.x(Joint.leftShoulder.ordinal))
    val right = engine.view.pointX(engine.tracker.x(Joint.rightShoulder.ordinal))
    assertTrue(left < right)
  }

  @Test
  fun rotationReseatsJointsWithoutLosingTheBody() {
    val tracker = BodyTracker()
    val s = BodySample()
    s.clear(0.0, 9.0 / 16)
    s.present = true
    for (i in 0 until JOINT_COUNT) {
      s.x[i] = 0.2
      s.y[i] = 0.3
      s.confidence[i] = 0.9
    }
    assertEquals(TrackerTransition.DETECTED, tracker.update(s))
    s.timestamp = 0.033
    s.aspect = 16.0 / 9
    for (i in 0 until JOINT_COUNT) {
      s.x[i] = 0.7
      s.y[i] = 0.8
    }
    assertEquals(TrackerTransition.NONE, tracker.update(s))
    assertEquals(1, tracker.bodyId)
    assertEquals(0.7, tracker.x(0), 1e-9)
    assertEquals(0.0, tracker.velocityX(0), 1e-9)
  }

  @Test
  fun floorFramingAsksForLandscape() {
    val f = Fixture.load(File(Fixture.directory, "setup-floor.csv"))
    val engine = BodyEngine()
    engine.configure(ConfigParser.engine(mapOf("readiness" to mapOf("framing" to "floor"))))
    engine.view = ViewTransform(390.0, 844.0, mirrored = false, cover = true, imageAspect = f.aspect)
    val issues = ArrayList<String>()
    for (s in f.samples) {
      engine.process(s)
      engine.events.takeBatch(s.timestamp)?.let { b ->
        engine.events.acknowledge(b.sequence)
        issues += b.events.filter { it.type == "readiness" }.map { (it.payload["issue"] as String?) ?: "ready" }
      }
    }
    assertEquals(listOf("rotateToLandscape"), issues)
  }

  @Test
  fun savedCalibrationSetsBodyScale() {
    val engine = BodyEngine()
    engine.configure(ConfigParser.engine(mapOf("calibration" to 0.2)))
    assertEquals(0.2, engine.calibratedScale!!, 1e-12)
    engine.configure(ConfigParser.engine(mapOf("calibration" to 0.2, "smoothing" to "light")))
    assertEquals(0.2, engine.calibratedScale!!, 1e-12)
    engine.configure(ConfigParser.engine(emptyMap()))
    assertNull(engine.calibratedScale)
    assertThrows(ConfigError::class.java) { ConfigParser.engine(mapOf("calibration" to -1.0)) }
  }
}
