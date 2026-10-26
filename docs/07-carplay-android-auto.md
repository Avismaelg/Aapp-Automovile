# Caravana — Modo conducción, CarPlay y Android Auto

> Estado: la app ya tiene un **Modo conducción** interno, optimizado para pantallas
> grandes y uso con una mano. La proyección nativa a CarPlay y Android Auto **no
> está activada todavía**: requiere build nativo, entitlements de Apple,
> aprobación de Google y pruebas en hardware o simuladores oficiales.

---

## 1. Qué está implementado

- Ruta `/drive` con interfaz simplificada:
  - party activa, destino, ETA y tiempo;
  - mapa de ruta;
  - botón grande de push-to-talk;
  - reto activo, tiempo y clasificación;
  - acciones grandes para abrir party o clasificación;
  - salida rápida del modo.
- Diseño adaptativo: dos columnas en horizontal y una columna en vertical.
- Acceso desde Mapa → **Conducir**.
- Sin formularios, sin feed y sin interacciones pequeñas.
- Se mantiene la regla de seguridad: se mide llegada, no velocidad.

![Modo conducción en horizontal](screenshots/drive-mode-landscape.png)

## 2. Qué falta para CarPlay/Android Auto reales

La proyección no se puede hacer solo con Expo Router ni con JavaScript:

| Plataforma | Requisito |
|---|---|
| iOS/CarPlay | Entitlement `com.apple.developer.carplay-*`, escenas nativas, Apple Developer Program y aprobación de Apple |
| Android Auto | `CarAppService`, Android for Cars App Library, categoría válida y aprobación/declaración en Google Play |
| Build | `expo prebuild` o EAS Build con módulo nativo; **Expo Go no lo soporta** |
| Pruebas | CarPlay Simulator y Android Auto Desktop Head Unit (DHU), luego coche real |

Además, CarPlay y Android Auto no aceptan cualquier app social. Hay que encajar
la experiencia en una categoría permitida, por ejemplo:

- navegación / companion de ruta;
- carga de EV y puntos de interés;
- comunicación de voz si se cumplen las guías de la plataforma.

El feed social, los retos complejos, los formularios y la personalización no
deben trasladarse tal cual a la pantalla del coche.

---

## 3. Librerías evaluadas

| Librería | CarPlay | Android Auto | Estado para este repo |
|---|---:|---:|---|
| `@iternio/react-native-auto-play` | ✅ | ✅ | La opción más completa; New Architecture + NitroModules. Requiere Xcode 27+/iOS 27 SDK y pruebas nativas. |
| `@bradford-tech/expo-carplay` | ✅ | ❌ | Módulo Expo con config plugin, pero solo CarPlay. |
| `@santoshpk/react-native-carplay` | ✅ | ✅ | Fork con Android Auto, pero hay que validar RN 0.88/SDK 58. |
| `@g4rb4g3/react-native-carplay` | ✅ | ✅ | Declara compatibilidad con Expo SDK 53/RN ≤ 0.79; no se debe asumir para SDK 58. |

**Recomendación:** evaluar `@iternio/react-native-auto-play` en una rama nativa
aparte y con un EAS development build. No instalarlo en la rama principal sin
probar compilación y entitlements, porque puede romper el build de iOS/Android.

> En esta entrega **no se instaló ninguna librería nativa de CarPlay/Android Auto**.
> Se priorizó no romper el build de Expo actual y dejar una base de UI y
> documentación verificable. La proyección real es la siguiente rama de trabajo.

---

## 4. Plan de integración

### Fase 1 — Producto y permisos

1. Definir la categoría: navegación/companion de ruta o EV charging.
2. Reducir la experiencia de coche a:
   - destino y progreso;
   - party y estado de compañeros;
   - PTT;
   - llegada/meta.
3. Solicitar el entitlement CarPlay en Apple Developer.
4. Declarar la categoría de Android Auto y preparar la revisión de Google Play.

### Fase 2 — Build nativo

```bash
cd movil
npx expo prebuild --clean
```

- Instalar la librería elegida con una versión compatible con Expo SDK 58.
- Añadir el config plugin o la configuración nativa de escenas/entitlements.
- Configurar `NSMicrophoneUsageDescription`, audio en segundo plano y ubicación.
- Compilar:

```bash
npx eas-cli@latest build --profile development
```

### Fase 3 — Plantillas de coche

La UI de `app/drive.tsx` sirve como referencia visual. En la capa nativa habría:

- un `MapTemplate`/lista con la ruta y los miembros;
- una acción grande de PTT (sin texto libre);
- estado del reto y llegada;
- pocas acciones, sin scroll complejo.

### Fase 4 — Pruebas

- CarPlay Simulator.
- Android Auto DHU con “Unknown sources” activado.
- Coche real.
- Interrupciones: llamada, Bluetooth, pérdida de red, túnel, batería baja.
- Verificar que el teléfono puede bloquearse sin detener la sesión.

---

## 5. Arquitectura prevista

La lógica compartida debe salir de las pantallas y vivir en servicios:

```
Party/Challenge store
        │
        ├─ app/drive.tsx (UI móvil)
        ├─ CarPlay templates (nativo)
        └─ Android Auto templates (nativo)
```

Cuando party y retos estén conectados a Supabase Realtime, el Modo conducción
podrá consumir el mismo estado sin duplicar reglas.

---

## 6. Seguridad y tiendas

- No mostrar teclados, formularios ni video en movimiento.
- No mostrar rankings de velocidad máxima ni incentivos a conducir rápido.
- No permitir crear retos con interacción compleja desde el coche.
- La ubicación solo se comparte dentro de una party.
- Apple/Google pueden rechazar funciones sociales que no encajen en su categoría.
- La aprobación de CarPlay no es automática por incluir el entitlement.

---

## 7. Criterio de aceptación

- El Modo conducción funciona en teléfono horizontal y vertical.
- El PTT responde con una pulsación mantenida.
- La party y el reto se ven sin interacción pequeña.
- Un development build arranca sin errores con el módulo nativo.
- CarPlay Simulator muestra la pantalla de Caravana.
- Android Auto DHU muestra la pantalla de Caravana.
- Apple/Google aprueban la categoría y la app pasa revisión.
