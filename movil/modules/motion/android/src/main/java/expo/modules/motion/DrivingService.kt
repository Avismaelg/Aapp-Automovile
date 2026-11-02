package expo.modules.motion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

// Servicio en primer plano solo mientras se conduce (o con una party en vivo).
// La ubicación en segundo plano se registra siempre sin notificación; Android
// la entrega entonces unas pocas veces por hora, que basta parado. Mientras
// este servicio está activo la app cuenta como «en primer plano» y recibe la
// ubicación a ritmo completo, con su notificación visible.
//
// Lo encienden: MotionReceiver al detectar «en vehículo» (aviso del sensor de
// actividad, una de las excepciones con las que Android permite arrancar un
// servicio desde segundo plano) y la app al entrar en una party o al ver que
// te mueves. Lo apaga MotionReceiver al detectar «quieto» o «a pie», y la app
// tras unos minutos sin moverte.
class DrivingService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Android exige startForeground tras startForegroundService aunque el
    // servicio se apague enseguida (si no, cierra la app).
    val notification = buildNotification(this)
    try {
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        notification,
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0,
      )
      running = true
      if (activeReasons(this).isEmpty()) {
        stopSelfSafely()
        return START_NOT_STICKY
      }
    } catch (_: Exception) {
      // Sin permiso o arrancado desde segundo plano sin excepción: se apaga.
      stopSelfSafely()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  private fun stopSelfSafely() {
    running = false
    try {
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    } catch (_: Exception) {
    }
    stopSelf()
  }

  companion object {
    private const val PREFS = "caravana.driving"
    private const val CHANNEL_ID = "caravana-driving"
    private const val NOTIFICATION_ID = 7302
    const val REASON_VEHICLE = "vehicle"
    const val REASON_CONVOY = "convoy"

    @Volatile
    var running = false
      private set

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun autoEnabled(context: Context) = prefs(context).getBoolean("auto", false)

    fun setAuto(context: Context, enabled: Boolean) {
      prefs(context).edit().putBoolean("auto", enabled).apply()
      if (!enabled) stop(context, REASON_VEHICLE)
    }

    // Textos ya traducidos por la app (el receptor no tiene JS para hacerlo).
    fun setTexts(context: Context, texts: Map<String, String>) {
      val editor = prefs(context).edit()
      texts.forEach { (key, value) -> editor.putString("text.$key", value) }
      editor.apply()
    }

    private fun text(context: Context, key: String, fallback: String) =
      prefs(context).getString("text.$key", null) ?: fallback

    fun activeReasons(context: Context): Set<String> =
      prefs(context).getStringSet("reasons", emptySet())?.toSet() ?: emptySet()

    @Synchronized
    fun start(context: Context, reason: String): Boolean {
      val reasons = activeReasons(context) + reason
      prefs(context).edit().putStringSet("reasons", reasons).apply()
      return try {
        val intent = Intent(context, DrivingService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
        else context.startService(intent)
        true
      } catch (_: Exception) {
        // Android no deja arrancarlo ahora (app en segundo plano sin excepción).
        false
      }
    }

    @Synchronized
    fun stop(context: Context, reason: String) {
      val reasons = activeReasons(context) - reason
      prefs(context).edit().putStringSet("reasons", reasons).apply()
      if (reasons.isEmpty()) {
        context.stopService(Intent(context, DrivingService::class.java))
        running = false
      } else if (running) {
        // Cambia el texto (p. ej. deja la party pero sigue conduciendo).
        try {
          val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
          manager.notify(NOTIFICATION_ID, buildNotification(context))
        } catch (_: Exception) {
        }
      }
    }

    private fun buildNotification(context: Context): Notification {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
        manager.createNotificationChannel(
          NotificationChannel(
            CHANNEL_ID,
            text(context, "channel", "Conducción"),
            NotificationManager.IMPORTANCE_LOW,
          ),
        )
      }
      val convoy = REASON_CONVOY in activeReasons(context)
      val title = if (convoy) {
        text(context, "convoyTitle", "Caravana · convoy en vivo")
      } else {
        text(context, "drivingTitle", "Caravana está registrando tu ruta")
      }
      val body = if (convoy) {
        text(context, "convoyBody", "Tu party ve tu posición. Toca para abrir.")
      } else {
        text(context, "drivingBody", "Tu viaje se guarda automáticamente. Toca para abrir.")
      }
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      val contentIntent = launch?.let {
        PendingIntent.getActivity(
          context,
          NOTIFICATION_ID,
          it,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
      }
      val smallIcon = context.resources
        .getIdentifier("notification_icon", "drawable", context.packageName)
        .takeIf { it != 0 } ?: context.applicationInfo.icon
      return NotificationCompat.Builder(context, CHANNEL_ID)
        .setContentTitle(title)
        .setContentText(body)
        .setSmallIcon(smallIcon)
        .setColor(0xFFFF6A33.toInt())
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
        .setContentIntent(contentIntent)
        .build()
    }
  }
}
