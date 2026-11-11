package expo.modules.motion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
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
      ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, serviceTypes(this))
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
    // Canal de importancia mínima: sin icono en la barra de estado, sin sonido
    // y plegado al fondo de las notificaciones. Android exige una notificación
    // para seguir la ubicación en segundo plano; así casi no se ve. Es un
    // canal nuevo porque la importancia de uno ya creado no se puede bajar.
    private const val CHANNEL_ID = "caravana-background"
    private const val OLD_CHANNEL_ID = "caravana-driving"
    private const val NOTIFICATION_ID = 7302
    const val REASON_VEHICLE = "vehicle"
    const val REASON_CONVOY = "convoy"
    // Voz del convoy conectada: el servicio añade el tipo micrófono para que
    // se oiga y se pueda hablar (manos libres) con la pantalla bloqueada.
    const val REASON_VOICE = "voice"
    // Compartes tu posición con amigos: el servicio sigue activo con la app en
    // segundo plano o cerrada para que te vean moverte en su mapa.
    const val REASON_FRIENDS = "friends"

    private fun hasLocationPermission(context: Context): Boolean =
      context.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED ||
        context.checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED

    private fun hasMicPermission(context: Context): Boolean =
      context.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) ==
        PackageManager.PERMISSION_GRANTED

    // Tipos del servicio: ubicación y, con la voz activa, micrófono. Desde
    // Android 14 cada tipo exige su permiso concedido: declararlo sin él lanza
    // una excepción y Android cierra la app.
    fun serviceTypes(context: Context): Int {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return 0
      var types = 0
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || hasLocationPermission(context)) {
        types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && REASON_VOICE in activeReasons(context) &&
        hasMicPermission(context)
      ) {
        types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      }
      return types
    }

    // Android 14+: sin ningún tipo válido el servicio no puede arrancar. Hay
    // que saberlo ANTES de startForegroundService: una vez pedido, si no llega
    // a ponerse en primer plano Android cierra la app.
    private fun canRunInForeground(context: Context): Boolean =
      Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || serviceTypes(context) != 0

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
      val previous = activeReasons(context)
      prefs(context).edit().putStringSet("reasons", previous + reason).apply()
      if (!canRunInForeground(context)) {
        // Sin permiso de ubicación (ni de micrófono para la voz): no arranca.
        prefs(context).edit().putStringSet("reasons", previous).apply()
        return false
      }
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
      } else if (running && !canRunInForeground(context)) {
        // Lo que queda ya no tiene permiso para seguir en primer plano.
        context.stopService(Intent(context, DrivingService::class.java))
        running = false
      } else if (running) {
        // Sigue por otro motivo (p. ej. cuelga la voz pero sigue conduciendo):
        // se vuelve a declarar el servicio para quitar el tipo micrófono y
        // cambiar el texto.
        try {
          val intent = Intent(context, DrivingService::class.java)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
          else context.startService(intent)
        } catch (_: Exception) {
          try {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(NOTIFICATION_ID, buildNotification(context))
          } catch (_: Exception) {
          }
        }
      }
    }

    private fun buildNotification(context: Context): Notification {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          text(context, "channel", "Conducción"),
          NotificationManager.IMPORTANCE_MIN,
        )
        channel.setShowBadge(false)
        channel.lockscreenVisibility = Notification.VISIBILITY_SECRET
        manager.createNotificationChannel(channel)
        // Android no deja borrar un canal con un servicio activo: sin borrar
        // no pasa nada (el viejo queda sin uso).
        try {
          manager.deleteNotificationChannel(OLD_CHANNEL_ID)
        } catch (_: Exception) {
        }
      }
      val reasons = activeReasons(context)
      val voice = REASON_VOICE in reasons
      val convoy = REASON_CONVOY in reasons
      val friends = REASON_FRIENDS in reasons && REASON_VEHICLE !in reasons
      val title = when {
        voice -> text(context, "voiceTitle", "Caravana · voz del convoy activa")
        convoy -> text(context, "convoyTitle", "Caravana · convoy en vivo")
        friends -> text(context, "friendsTitle", "Caravana · compartiendo ubicación")
        else -> text(context, "drivingTitle", "Caravana está registrando tu ruta")
      }
      val body = when {
        voice -> text(context, "voiceBody", "Oyes a tu party con la pantalla bloqueada. Toca para abrir.")
        convoy -> text(context, "convoyBody", "Tu party ve tu posición. Toca para abrir.")
        friends -> text(context, "friendsBody", "Tus amigos ven tu posición en su mapa. Toca para abrir.")
        else -> text(context, "drivingBody", "Tu viaje se guarda automáticamente. Toca para abrir.")
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
        .setShowWhen(false)
        .setPriority(NotificationCompat.PRIORITY_MIN)
        .setVisibility(NotificationCompat.VISIBILITY_SECRET)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_DEFERRED)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setContentIntent(contentIntent)
        .build()
    }
  }
}
