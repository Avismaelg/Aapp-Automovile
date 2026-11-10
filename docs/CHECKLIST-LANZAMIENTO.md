# Checklist de lanzamiento — GO / NO-GO

**Evaluación (2026-11-04): NO-GO.** El código de los 5 P0 está corregido y
probado de forma estática, pero falta aplicarlo y probarlo de verdad.

## Criterios del prompt maestro

| Criterio | Estado |
|---|---|
| Sin P0 abiertos | 🟡 Corregidos en código; **no aplicados** a la base de datos |
| Políticas de acceso probadas | 🟡 Estáticas (19 pruebas); falta la prueba real en un proyecto de pruebas |
| Permisos y textos de privacidad coherentes | ✅ App y borrador alineados (ubicación privada por defecto, sin velocidades); falta revisión legal |
| Funciones principales con pruebas | ✅ 307 pruebas |
| Workflows de calidad en verde | 🟡 expo-doctor ya pasa y hay job de Deno; falta ver el workflow ejecutado en GitHub |
| Migraciones probadas en entorno separado | ❌ No hay proyecto de pruebas |
| GPS y LiveKit en dispositivos | ❌ No repetido tras estas correcciones |
| Mapas adecuados para producción | 🟡 Google (rutas y búsqueda) con tope de gasto; OSRM público fuera; Photon/Nominatim públicos de respaldo |
| Builds nativos Android e iOS | 🟡 Android compila (APK release); iOS sin compilar (falta cuenta de Apple) |
| Sin bloqueos de publicación | ❌ Ver abajo |

## Orden para pasar a GO

1. Proyecto de Supabase de pruebas → `Caravana-Seguridad-Aplicar.ps1` → todas
   las filas `ok`.
2. Compilar e instalar la APK de esta rama en los teléfonos (la versión vieja
   pide `select('*')` en vehicles y su garaje fallaría con las migraciones).
3. Aplicar en producción con el mismo script (pide escribir PRODUCCION).
4. Pruebas en dispositivos de `PRUEBAS-PRODUCCION.md`.
5. Bloqueos de tienda (abajo).

## Google Play (Android)

- [ ] Declaración de **ubicación en segundo plano** con vídeo (convoy y amigos con la app cerrada).
- [ ] Declaración de **servicios en primer plano**: `location` y `microphone` (voz con la pantalla bloqueada).
- [ ] Formulario de **seguridad de los datos**: ubicación precisa, audio (no se graba), id del dispositivo (avisos), informes de fallos (Crashlytics), fotos.
- [x] **URL web para pedir el borrado de la cuenta**: `infra/invite-page/borrar-cuenta/` (se publica en GitHub Pages al mergear a `main`; falta confirmar la URL pública).
- [ ] Política de privacidad en una URL HTTPS estable y revisada legalmente.
- [ ] `eas build -p android --profile production` (AAB) y prueba interna.

## App Store (iOS)

- [ ] Cuenta de Apple Developer; pasos de `docs/iOS-lanzamiento.md`.
- [ ] Primera compilación en EAS (puede necesitar ajustes de pods).
- [ ] Clave APNs (`Caravana-iOS-Avisos.ps1`).
- [ ] Justificar ubicación «Siempre» y audio en segundo plano en la revisión.
- [ ] Etiquetas de privacidad de la ficha.
- [ ] TestFlight.

## Riesgos que quedan

- Verificación GPS de retos no infalible (documentado).
- `index.tsx` grande y sin medir en gama media (P2-4).
- Photon/Nominatim públicos como respaldo de búsqueda.
- Datos antiguos de `speed_records` conservados (privados) hasta que autorices borrarlos.
