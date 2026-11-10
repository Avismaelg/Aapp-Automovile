# Plan de correcciones — producción

Orden del prompt maestro. Cada paso = commit pequeño con su prueba. Las
migraciones se escriben y prueban aquí; **se aplican a producción solo con
autorización** y después de probarlas en un entorno separado.

| Paso | Hallazgos | Cambio | Prueba | Necesita |
|---|---|---|---|---|
| 1 | P1-6 | `npx expo install --fix` (parches de Expo) | CI verde, expo-doctor OK | — |
| 2 | P0-1, P1-2, P2-5 | Migración: `party_members` sin insert directo; update propio solo de posición/progreso/canal; rol, pertenencia y expulsión por RPC; `join_party` con bloqueo y `kicked_at` | `db-permissions` + pruebas de políticas | Aplicar migración |
| 3 | P0-2 | Migración: amistad solo la acepta el destinatario; ids inmutables | idem | Aplicar migración |
| 4 | P0-3, P1-8 | Migración: revocar `plate`, `odometer_km`, `home_location`; RPC del dueño | idem + app que lee la matrícula del dueño | Aplicar migración |
| 5 | P1-1 | Compartir con amigos desactivado por defecto; revocar borra la última posición | Jest del consentimiento | — |
| 6 | P0-4 | Retirar la clasificación pública de velocidad; solo estadísticas privadas | Jest + revisión de pantallas | Aplicar migración (política) |
| 7 | P0-5 | Retos: sin update directo; `report_challenge_progress` comprueba la posición en la meta, precisión y antigüedad; resultado verificado/autodeclarado | Jest + SQL | Aplicar migración |
| 8 | P1-3, P1-7, P2-1 | Voz: token 15 min, convoy no caducado, expulsar de la sala al salir/expulsar, nombre sin correo | Deno/Jest | Desplegar función |
| 9 | P1-4, P2-2 | Borrado de cuenta: estado parcial, paginación, cola reintentable | Jest | Desplegar función |
| 10 | P1-5, P2-3 | Sin navegación sobre línea directa; OSRM público fuera | Jest | — |
| 11 | P2-4 | Rendimiento del mapa (medido en el dispositivo) | Profiler | Teléfono |
| 12 | — | CI con las pruebas nuevas; documentos de la fase 11; GO/NO-GO | — | — |

## Avance (2026-11-04)

Pasos 1–10 y 12 hechos en código, con pruebas (ver el estado por hallazgo en
`AUDITORIA-PRODUCCION.md`). Paso 11 (rendimiento) pendiente de medir en el
teléfono. Ninguna migración ni función nueva está aplicada o desplegada:
`Caravana-Seguridad-Aplicar.ps1` lo hace, primero en un proyecto de pruebas.
