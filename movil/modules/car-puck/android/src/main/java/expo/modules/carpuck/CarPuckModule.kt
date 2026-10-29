package expo.modules.carpuck

import android.view.View
import android.view.ViewGroup
import com.mapbox.maps.MapView
import com.mapbox.maps.plugin.LocationPuck3D
import com.mapbox.maps.plugin.locationcomponent.location
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Sustituye el indicador de posición de Mapbox por un modelo 3D (glTF). El
// motor nativo lo mueve y lo gira con el GPS a 60 fps, igual que el punto.
class CarPuckModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CarPuck")

    AsyncFunction("setModelPuck") { viewTag: Int, uri: String, scale: Double, rotation: Double ->
      val root = appContext.findView<View>(viewTag) ?: return@AsyncFunction false
      val mapView = findMapView(root) ?: return@AsyncFunction false
      val size = scale.toFloat()
      mapView.location.apply {
        enabled = true
        locationPuck = LocationPuck3D(
          modelUri = uri,
          modelScale = listOf(size, size, size),
          modelRotation = listOf(0f, 0f, rotation.toFloat()),
          modelCastShadows = true,
          modelReceiveShadows = false,
          modelEmissiveStrength = 0.6f,
        )
      }
      true
    }.runOnQueue(Queues.MAIN)
  }

  private fun findMapView(view: View): MapView? {
    if (view is MapView) return view
    if (view is ViewGroup) {
      for (index in 0 until view.childCount) {
        findMapView(view.getChildAt(index))?.let { return it }
      }
    }
    return null
  }
}
