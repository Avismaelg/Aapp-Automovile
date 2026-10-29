package expo.modules.carpuck

import android.view.View
import android.view.ViewGroup
import com.mapbox.maps.MapView
import com.mapbox.maps.plugin.LocationPuck3D
import com.mapbox.maps.plugin.PuckBearing
import com.mapbox.maps.plugin.locationcomponent.createDefault2DPuck
import com.mapbox.maps.plugin.locationcomponent.location
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Coche 3D en el mapa de Mapbox (Android):
// - setModelPuck: sustituye el indicador de posición por el modelo; el motor
//   nativo lo mueve y lo gira con el GPS a 60 fps, igual que el punto.
// - addModel: registra un modelo en el estilo con su ruta file:/// tal cual
//   (el componente Models de rnmapbox la reescribe a «file:/» y Mapbox no
//   la abre).
class CarPuckModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CarPuck")

    AsyncFunction("setModelPuck") { viewTag: Int, uri: String, scale: Double, rotation: Double ->
      val mapView = mapViewFor(viewTag) ?: return@AsyncFunction false
      val size = scale.toFloat()
      mapView.location.apply {
        enabled = true
        puckBearingEnabled = true
        puckBearing = PuckBearing.COURSE
        pulsingEnabled = false
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

    // Vuelve al punto azul (a pie): sin esto el coche 3D seguía pegado a ti.
    AsyncFunction("resetPuck") { viewTag: Int ->
      val mapView = mapViewFor(viewTag) ?: return@AsyncFunction false
      mapView.location.apply {
        locationPuck = createDefault2DPuck(withBearing = true)
        puckBearing = PuckBearing.HEADING
        pulsingEnabled = true
      }
      true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("addModel") { viewTag: Int, modelId: String, uri: String ->
      val mapView = mapViewFor(viewTag) ?: return@AsyncFunction false
      val style = mapView.mapboxMap.style ?: return@AsyncFunction false
      style.addStyleModel(modelId, uri).isValue
    }.runOnQueue(Queues.MAIN)
  }

  // Primero por el tag de la vista; si no se resuelve (pasa con Fabric según
  // el contenedor), se busca el MapView visible en la ventana de la app.
  private fun mapViewFor(viewTag: Int): MapView? {
    val byTag = try {
      appContext.findView<View>(viewTag)?.let { findMapView(it) }
    } catch (_: Exception) {
      null
    }
    if (byTag != null) return byTag
    val decor = appContext.currentActivity?.window?.decorView ?: return null
    return findMapView(decor, visibleOnly = true)
  }

  // El tag puede ser el contenedor de rnmapbox (RNMBXMapView), que expone el
  // MapView con getMapView(), o una vista que lo contiene.
  private fun findMapView(view: View, visibleOnly: Boolean = false): MapView? {
    if (visibleOnly && !view.isShown) return null
    if (view is MapView) return view
    try {
      val method = view.javaClass.getMethod("getMapView")
      (method.invoke(view) as? MapView)?.let { return it }
    } catch (_: Exception) {
      // No es el contenedor de rnmapbox: se buscan sus hijos.
    }
    if (view is ViewGroup) {
      for (index in 0 until view.childCount) {
        findMapView(view.getChildAt(index), visibleOnly)?.let { return it }
      }
    }
    return null
  }
}
