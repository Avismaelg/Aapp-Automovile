package expo.modules.motion

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity
import com.google.android.gms.location.LocationServices
import org.json.JSONArray
import org.json.JSONObject

// Recibe los cambios de actividad (también con la app cerrada) y los guarda
// junto a la última ubicación conocida del teléfono.
class MotionReceiver : BroadcastReceiver() {
  @SuppressLint("MissingPermission")
  override fun onReceive(context: Context, intent: Intent) {
    if (!ActivityTransitionResult.hasResult(intent)) return
    val result = ActivityTransitionResult.extractResult(intent) ?: return
    val nowWall = System.currentTimeMillis()
    val nowElapsed = SystemClock.elapsedRealtimeNanos()
    val events = result.transitionEvents.mapNotNull { event ->
      val type = when (event.activityType) {
        DetectedActivity.IN_VEHICLE -> "vehicle"
        DetectedActivity.WALKING, DetectedActivity.RUNNING -> "foot"
        DetectedActivity.STILL -> "still"
        else -> return@mapNotNull null
      }
      val at = nowWall - (nowElapsed - event.elapsedRealTimeNanos) / 1_000_000
      JSONObject()
        .put("type", type)
        .put("transition", if (event.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER) "enter" else "exit")
        .put("at", at)
    }
    if (events.isEmpty()) return

    val pending = goAsync()
    val save = { latitude: Double?, longitude: Double?, accuracy: Float?, fixAt: Long? ->
      events.forEach { event ->
        if (latitude != null && longitude != null) {
          event.put("latitude", latitude).put("longitude", longitude)
          if (accuracy != null) event.put("accuracy", accuracy.toDouble())
          if (fixAt != null) event.put("fixAt", fixAt)
        }
        MotionStore.append(context, event)
      }
      pending.finish()
    }
    try {
      LocationServices.getFusedLocationProviderClient(context).lastLocation
        .addOnSuccessListener { location ->
          if (location == null) save(null, null, null, null)
          else save(location.latitude, location.longitude, location.accuracy, location.time)
        }
        .addOnFailureListener { save(null, null, null, null) }
    } catch (_: Exception) {
      save(null, null, null, null)
    }
  }
}

// Últimos eventos de actividad en SharedPreferences (accesible sin JS).
object MotionStore {
  private const val PREFS = "caravana.motion"
  private const val KEY = "events"
  private const val MAX_EVENTS = 300

  @Synchronized
  fun append(context: Context, event: JSONObject) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val current = try {
      JSONArray(prefs.getString(KEY, "[]"))
    } catch (_: Exception) {
      JSONArray()
    }
    current.put(event)
    val trimmed = JSONArray()
    val start = maxOf(0, current.length() - MAX_EVENTS)
    for (i in start until current.length()) trimmed.put(current.get(i))
    prefs.edit().putString(KEY, trimmed.toString()).apply()
  }

  @Synchronized
  fun read(context: Context, sinceMs: Long): List<Map<String, Any>> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val array = try {
      JSONArray(prefs.getString(KEY, "[]"))
    } catch (_: Exception) {
      return emptyList()
    }
    val out = mutableListOf<Map<String, Any>>()
    for (i in 0 until array.length()) {
      val item = array.optJSONObject(i) ?: continue
      val at = item.optLong("at")
      if (at < sinceMs) continue
      val map = mutableMapOf<String, Any>(
        "type" to item.optString("type"),
        "transition" to item.optString("transition"),
        "at" to at.toDouble(),
      )
      if (item.has("latitude")) {
        map["latitude"] = item.optDouble("latitude")
        map["longitude"] = item.optDouble("longitude")
      }
      if (item.has("accuracy")) map["accuracy"] = item.optDouble("accuracy")
      if (item.has("fixAt")) map["fixAt"] = item.optLong("fixAt").toDouble()
      out.add(map)
    }
    return out
  }
}
