package expo.modules.bodyvision.core

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.math.roundToLong

/** Parsed fixture CSV (see scripts/generate-fixtures.js). */
class Fixture(
  val name: String,
  val aspect: Double,
  val configs: List<Map<String, Any?>>,
  val expect: Map<String, String>,
  val samples: List<BodySample>
) {
  companion object {
    val directory: File
      get() = System.getenv("BODY_VISION_FIXTURES")?.let(::File) ?: File("../../fixtures")

    fun all(): List<Fixture> =
      directory.listFiles { f -> f.extension == "csv" }!!.sortedBy { it.name }.map(::load)

    fun load(file: File): Fixture {
      var aspect = 1.0
      val configs = ArrayList<Map<String, Any?>>()
      val expect = LinkedHashMap<String, String>()
      val samples = ArrayList<BodySample>()
      for (line in file.readLines()) {
        if (line.isEmpty()) continue
        when {
          line.startsWith("# aspect: ") -> aspect = line.substring(10).toDouble()
          line.startsWith("# config: ") -> configs.add(toMap(JSONObject(line.substring(10))))
          line.startsWith("# expect: ") -> {
            val kv = line.substring(10).split("=", limit = 2)
            expect[kv[0]] = kv[1]
          }
          !line.startsWith("#") -> {
            val v = line.split(",").map { it.toDouble() }
            val s = BodySample()
            s.clear(v[0] / 1000, aspect)
            s.present = v[1] == 1.0
            if (s.present) {
              for (i in 0 until JOINT_COUNT) {
                s.x[i] = v[2 + i * 3]
                s.y[i] = v[3 + i * 3]
                s.confidence[i] = v[4 + i * 3]
              }
            }
            samples.add(s)
          }
        }
      }
      return Fixture(file.nameWithoutExtension, aspect, configs, expect, samples)
    }

    /** Same shape Expo hands native: maps, lists, Double numbers. */
    fun toMap(o: JSONObject): Map<String, Any?> = o.keys().asSequence().associateWith { convert(o.get(it)) }

    private fun convert(v: Any?): Any? = when (v) {
      is JSONObject -> toMap(v)
      is JSONArray -> (0 until v.length()).map { convert(v.get(it)) }
      is Number -> v.toDouble()
      JSONObject.NULL -> null
      else -> v
    }
  }
}

class FixtureRun(val events: List<EngineEvent>, val trace: String)

fun runFixture(fixture: Fixture, prediction: ((BodyEngine, Double) -> Unit)? = null): FixtureRun {
  val engine = BodyEngine()
  val rules = fixture.configs.filter { it["type"] != "view" && it["type"] != "readiness" }
  val config = mutableMapOf<String, Any?>("rules" to rules)
  fixture.configs.firstOrNull { it["type"] == "readiness" }?.let { config["readiness"] = it }
  engine.configure(ConfigParser.engine(config))
  fixture.configs.firstOrNull { it["type"] == "view" }?.let { v ->
    engine.view = ViewTransform(
      width = v["width"] as Double,
      height = v["height"] as Double,
      mirrored = v["mirrored"] as Boolean,
      cover = v["resizeMode"] != "contain",
      imageAspect = fixture.aspect
    )
  }
  val events = ArrayList<EngineEvent>()
  for ((i, s) in fixture.samples.withIndex()) {
    engine.process(s)
    engine.events.takeBatch(s.timestamp)?.let { batch ->
      events.addAll(batch.events)
      engine.events.acknowledge(batch.sequence)
    }
    if (prediction != null && i + 1 < fixture.samples.size) {
      val next = fixture.samples[i + 1].timestamp
      for (k in 1..4) prediction(engine, s.timestamp + (next - s.timestamp) * k.toDouble() / 4)
    }
  }
  return FixtureRun(events, trace(events))
}

/** Event trace compared across Swift and Kotlin: type, subject and time in whole ms. */
fun trace(events: List<EngineEvent>): String = events.joinToString("\n") { e ->
  val p = e.payload
  val subject = p["exercise"] ?: p["pose"] ?: p["target"] ?: p["bodyId"] ?: ""
  var extra = ""
  p["phase"]?.let { extra = " $it" }
  p["reason"]?.let { extra = " $it" }
  p["count"]?.let { extra = " $it" }
  p["side"]?.let { extra += " $it" }
  if (e.type == "readiness") extra = " ${p["issue"] ?: "ready"}"
  "${(e.time * 1000).roundToLong()} ${e.type} $subject$extra"
} + "\n"
