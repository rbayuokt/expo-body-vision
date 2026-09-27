package expo.modules.bodyvision.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class FixtureTest {
  private val types = mapOf(
    "reps" to ("repCompleted" to "exercise"),
    "rejected" to ("repRejected" to "exercise"),
    "entered" to ("poseEntered" to "pose"),
    "exited" to ("poseExited" to "pose"),
    "hits" to ("targetHit" to "target")
  )

  @Test
  fun fixturesMeetExpectations() {
    val fixtures = Fixture.all()
    assertTrue(fixtures.size >= 9)
    for (f in fixtures) {
      val r = runFixture(f)
      for ((key, value) in f.expect) {
        val parts = key.split(".")
        when (parts[0]) {
          "phases" -> {
            val phases = r.events.filter { it.type == "exercisePhase" }.map { it.payload["phase"] as String }
            val expected = value.split(",")
            assertEquals("${f.name} phases", expected, phases.take(expected.size))
          }
          "readinessSeq", "readinessLast" -> {
            val seen = r.events.filter { it.type == "readiness" }.map { (it.payload["issue"] as String?) ?: "ready" }
            if (parts[0] == "readinessLast") {
              assertEquals("${f.name} ${r.trace}", value, seen.last())
            } else {
              var rest = value.split(",")
              for (s in seen) if (rest.firstOrNull() == s) rest = rest.drop(1)
              assertTrue("${f.name}: expected $value in order, saw $seen", rest.isEmpty())
            }
          }
          "bodyLost", "bodyDetected" ->
            assertEquals("${f.name} $key", value.toInt(), r.events.count { it.type == parts[0] })
          else -> {
            val (type, field) = types.getValue(parts[0])
            val n = r.events.count { it.type == type && it.payload[field] == parts[1] }
            assertEquals("${f.name} $key\n${r.trace}", value.toInt(), n)
          }
        }
      }
    }
  }

  /** Golden traces are written by the Swift suite. Kotlin must match them byte for byte. */
  @Test
  fun tracesMatchGolden() {
    val dir = File(Fixture.directory, "golden")
    for (f in Fixture.all()) {
      assertEquals(f.name, File(dir, "${f.name}.txt").readText(), runFixture(f).trace)
    }
  }

  @Test
  fun predictionStaysFiniteAndBounded() {
    val x = DoubleArray(JOINT_COUNT)
    val y = DoubleArray(JOINT_COUNT)
    val c = DoubleArray(JOINT_COUNT)
    for (f in Fixture.all()) {
      runFixture(f) { engine, t ->
        engine.tracker.predict(t, x, y, c)
        for (i in 0 until JOINT_COUNT) {
          if (c[i] <= 0) continue
          assertTrue("${f.name} non-finite joint $i", x[i].isFinite() && y[i].isFinite())
          assertTrue("${f.name} joint $i out of bounds", x[i] in -0.25..1.25 && y[i] in -0.25..1.25)
        }
      }
    }
  }
}
