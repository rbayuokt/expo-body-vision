package expo.modules.demoposebackends

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// ML Kit is the library's Android default, so there's nothing extra to register here.
class DemoPoseBackendsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DemoPoseBackends")

    Function("register") { emptyList<String>() }
  }
}
