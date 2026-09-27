package expo.modules.bodyvision

import android.Manifest
import expo.modules.bodyvision.core.JOINT_COUNT
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class ExpoBodyVisionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoBodyVision")

    Function("getCapabilities") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      mapOf(
        "platform" to "android",
        "backend" to "mlkit",
        "backends" to BodyVisionBackends.names,
        "joints" to JOINT_COUNT,
        "maxBodies" to 1,
        "testInput" to ReplaySource.isEnabled(context)
      )
    }

    AsyncFunction("getCameraPermissionsAsync") { promise: Promise ->
      Permissions.getPermissionsWithPermissionsManager(appContext.permissions, promise, Manifest.permission.CAMERA)
    }

    AsyncFunction("requestCameraPermissionsAsync") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(appContext.permissions, promise, Manifest.permission.CAMERA)
    }

    // Heavy decode and inference, so off Expo's shared module queue.
    AsyncFunction("analyzeVideo") Coroutine { uri: String, config: Map<String, Any?>, options: Map<String, Any?> ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      withContext(Dispatchers.Default) { VideoAnalyzer(context, uri, config, options).run() }
    }

    View(BodyVisionView::class) {
      Events("onEvents")

      Prop("facing") { view: BodyVisionView, facing: String -> view.facing = facing }
      Prop("active") { view: BodyVisionView, active: Boolean -> view.active = active }
      Prop("resizeMode") { view: BodyVisionView, mode: String -> view.resizeMode = mode }
      Prop("config") { view: BodyVisionView, config: Map<String, Any?> -> view.config = config }
      Prop("skeleton") { view: BodyVisionView, skeleton: Map<String, Any?> -> view.skeleton = skeleton }
      Prop("telemetry") { view: BodyVisionView, telemetry: Map<String, Any?> -> view.telemetry = telemetry }
      Prop("testInput") { view: BodyVisionView, input: Map<String, Any?>? ->
        view.testInput = input
        view.testInputChanged = true
      }
      Prop("video") { view: BodyVisionView, video: Map<String, Any?>? -> view.video = video }

      // Props arrive one by one. Apply them together so a facing + input change restarts once.
      OnViewDidUpdateProps { view: BodyVisionView -> view.commit() }

      OnViewDestroys { view: BodyVisionView -> view.destroy() }

      AsyncFunction("acknowledge") { view: BodyVisionView, sequence: Int -> view.acknowledge(sequence) }
      AsyncFunction("startCalibration") { view: BodyVisionView, durationMs: Double -> view.startCalibration(durationMs) }
      AsyncFunction("resetExercise") { view: BodyVisionView, id: String? -> view.resetExercise(id) }
    }
  }
}
