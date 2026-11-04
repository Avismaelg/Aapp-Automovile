# Pruebas de producción

## Automáticas (ejecutadas el 2026-11-04 en `fix/production-readiness`)

| Comando (desde `movil/`) | Resultado real |
|---|---|
| `npm ci` | OK |
| `npm run typecheck` | OK, 0 errores |
| `npm run lint` | OK, 0 errores |
| `npm test` | 45 suites, **307 pruebas OK** (281 al empezar) |
| `npx expo-doctor` | 20/20 OK (antes fallaba 1: CI estaba en rojo) |
| `deno check` de las 6 Edge Functions | OK (añadido a CI, job `functions`) |

Pruebas nuevas:

| Archivo | Cubre |
|---|---|
| `rls-hardening.test.ts` (19) | Estado final de políticas, permisos por columna y funciones tras todas las migraciones: P0-1…P0-5, voz, borrado. **9 de 10** de las primeras fallan sin las migraciones nuevas (comprobado) |
| `db-permissions.test.ts` (4) | Uso del esquema `private` y ejecución de sus funciones |
| `location-consent-states.test.ts` (2) | Compartir con amigos desactivado por defecto; política coherente |
| `segment-stats.test.ts` (3) | Estadísticas por tramo sin velocidades |
| `route-fallback.test.ts` (4) | Sin ruta real no hay guía; sin OSRM público; cancelar no inventa ruta |

**Límite:** las pruebas de políticas son **estáticas** (leen las migraciones).
No sustituyen a la prueba contra una base real.

## Contra una base real — pendiente (necesita un proyecto de pruebas)

1. Crear un proyecto de Supabase **separado** (gratuito), p. ej. `caravana-staging`.
2. Ejecutar `Caravana-Seguridad-Aplicar.ps1` (Escritorio) con su ref: aplica
   **todas** las migraciones en orden, despliega `livekit-token`,
   `livekit-revoke` y `delete-account` y corre
   `movil/supabase/tests/rls_produccion.sql`.
3. Criterio: todas las filas con `ok = true`. Comprueba como usuario ajeno y
   como visitante: alta directa en convoy ajeno, cambio de rol, volver tras
   expulsión, aceptarse una amistad, matrícula de un vehículo público, el dueño
   sí ve su matrícula, velocidades ajenas.
4. Riesgo conocido: las migraciones antiguas se escribieron sobre un proyecto
   que ya existía (`production_reconcile`); en uno vacío alguna puede necesitar
   ajuste. Si falla, el script se detiene en esa migración.

**Estado:** no ejecutado (no hay proyecto de pruebas).

## En dispositivos — pendiente (necesita los teléfonos y un viaje)

| Prueba | Cómo | Criterio |
|---|---|---|
| Ubicación privada por defecto | Instalar limpio, entrar | Ningún amigo te ve hasta aceptar «Compartir» |
| Revocar | Activar, luego el ojo del mapa | Desapareces del mapa de tu amigo en ≤ 10 s |
| Cerrar sesión | Cerrar sesión con el convoy abierto | Sin notificación de servicio; nadie recibe tu posición |
| Pantalla bloqueada / app cerrada | Convoy de 2 teléfonos, 15 min | Posición cada ≤ 10 s en el otro teléfono |
| Reinicio | Reiniciar el teléfono en convoy | Tras abrir la app, vuelve a compartir sin duplicar viajes |
| Voz: expulsión | El anfitrión expulsa | El expulsado deja de oír en ≤ 5 s |
| Voz: red | Modo avión 10 s y volver | «Sin conexión» → «Reconectando» → conectado, sin tocar nada |
| Voz: Bluetooth | Auriculares o el coche | El audio sale por Bluetooth |
| Sin ruta | Sin datos, pedir ruta | «No encontramos una ruta por carretera…», sin flechas |
| Reto | Llegar a la meta | «llegada» (verificada); con app vieja, «llegada autodeclarada» |
| Batería | Viaje de 1 h con convoy y voz | Anotar % (objetivo ≤ 15 %/h en gama media) |
| Rendimiento | Profiler de React en el mapa navegando | Anotar renders por segundo de `index.tsx` (P2-4) |

**Estado:** no ejecutado tras estas correcciones. La voz (0,9 s de conexión) y
los avisos con la app cerrada se probaron en Android el 2026-11-04, antes de
esta rama.
