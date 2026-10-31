package expo.modules.motion

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.DetectedActivity
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Sensor de actividad de Google Play (el que usan Maps y Waze): avisa cuando
// el usuario entra o sale de un vehículo, empieza a caminar o se queda quieto.
// El aviso llega a MotionReceiver aunque la app esté cerrada; allí se guarda
// con la última ubicación conocida y la app lo lee al abrirse.
//
// También gestiona la exención de ahorro de batería: sin ella, Android (sobre
// todo en Samsung) mata el servicio de ubicación en segundo plano.
class MotionModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext?.applicationContext) { "Sin contexto" }

  override fun definition() = ModuleDefinition {
    Name("Motion")

    Function("hasPermission") { hasActivityPermission(context) }

    AsyncFunction("requestPermission") { promise: Promise ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        promise.resolve(true)
        return@AsyncFunction
      }
      Permissions.askForPermissionsWithPermissionsManager(
        appContext.permissions,
        object : Promise {
          override fun resolve(value: Any?) {
            promise.resolve(hasActivityPermission(context))
          }

          override fun reject(code: String?, message: String?, cause: Throwable?) {
            promise.resolve(false)
          }
        },
        Manifest.permission.ACTIVITY_RECOGNITION,
      )
    }

    AsyncFunction("start") { promise: Promise ->
      if (!hasActivityPermission(context)) {
        promise.resolve(false)
        return@AsyncFunction
      }
      requestTransitions(context, promise)
    }

    Function("getEvents") { sinceMs: Double -> MotionStore.read(context, sinceMs.toLong()) }

    Function("isIgnoringBatteryOptimizations") {
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      power.isIgnoringBatteryOptimizations(context.packageName)
    }

    @SuppressLint("BatteryLife")
    Function("requestIgnoreBatteryOptimizations") {
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
        .setData(Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(intent)
        true
      } catch (_: Exception) {
        // Algunas capas de fabricante no tienen el diálogo: se abre la lista.
        try {
          context.startActivity(
            Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
          )
          true
        } catch (_: Exception) {
          false
        }
      }
    }
  }

  @SuppressLint("MissingPermission")
  private fun requestTransitions(context: Context, promise: Promise) {
    val transitions = listOf(
      DetectedActivity.IN_VEHICLE to ActivityTransition.ACTIVITY_TRANSITION_ENTER,
      DetectedActivity.IN_VEHICLE to ActivityTransition.ACTIVITY_TRANSITION_EXIT,
      DetectedActivity.WALKING to ActivityTransition.ACTIVITY_TRANSITION_ENTER,
      DetectedActivity.RUNNING to ActivityTransition.ACTIVITY_TRANSITION_ENTER,
      DetectedActivity.STILL to ActivityTransition.ACTIVITY_TRANSITION_ENTER,
    ).map { (activity, transition) ->
      ActivityTransition.Builder()
        .setActivityType(activity)
        .setActivityTransition(transition)
        .build()
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
    val pending = PendingIntent.getBroadcast(
      context,
      7301,
      Intent(context, MotionReceiver::class.java),
      flags,
    )
    ActivityRecognition.getClient(context)
      .requestActivityTransitionUpdates(ActivityTransitionRequest(transitions), pending)
      .addOnSuccessListener { promise.resolve(true) }
      .addOnFailureListener { promise.resolve(false) }
  }

  companion object {
    fun hasActivityPermission(context: Context): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
      return ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) ==
        PackageManager.PERMISSION_GRANTED
    }
  }
}
