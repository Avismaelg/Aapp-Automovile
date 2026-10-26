# Retos punto A → B

Caravana plantea los retos como **llegadas**, no como carreras de velocidad. Gana
quien llega primero a la meta respetando los límites y las normas de tránsito. No
hay apuestas, premios por velocidad máxima ni leaderboards de aceleración.

## Flujo real

1. El anfitrión elige una ruta A → B, una categoría (`mixed`, `car`,
   `motorcycle`, `ev` o `truck`) y uno o más amigos.
2. La app crea una fila en `public.challenges` y otra por participante en
   `public.challenge_participants`.
   - El anfitrión queda `accepted`.
   - Los invitados quedan `invited`.
3. El invitado ve la invitación en Retos y puede **aceptar** o **rechazar**.
4. Cuando el anfitrión tiene al menos un rival aceptado, puede iniciar la salida.
   Se guarda `starts_at` y el reto pasa a `live`.
5. Al finalizar, el anfitrión marca `finished_at`, el reto pasa a `finished` y los
   participantes aceptados quedan `finished`. El resultado aparece en el historial.

El modo `scheduled` crea el reto en `pending`. El modo `instant` crea la sala
directamente en `live`, pero cada invitado debe aceptar para unirse.

## Tablas

- `challenges`: título, código, categoría, estado, modo, salida, meta, distancia,
  reglas, `starts_at` y `finished_at`.
- `challenge_participants`: usuario, vehículo, categoría de vehículo, estado,
  progreso, tiempo y posición de llegada.
- `mode` se añadió con la migración
  `movil/supabase/migrations/20261026060000_challenge_mode.sql`.

## RLS y Realtime

- Solo el anfitrión y los participantes pueden leer un reto y su clasificación.
- Solo el anfitrión crea el reto e invita participantes.
- Cada participante puede aceptar o rechazar su propia invitación.
- Solo el anfitrión inicia o finaliza el reto.
- `challenges` y `challenge_participants` están en la publicación
  `supabase_realtime`; el cliente invalida la consulta al recibir cambios.

## Cliente

- `movil/src/hooks/useChallenges.ts`: consultas, amigos con vehículo, mutaciones y
  suscripción Realtime.
- `movil/src/lib/challenge-db.ts`: tipos y conversión al modelo visual.
- `movil/app/(tabs)/challenges.tsx`: creación, invitación, aceptación, inicio,
  cronómetro, clasificación e historial.
- En modo demo se mantiene el simulador local para poder probar la interfaz sin
  cuentas.

## Probado

- Dos cuentas reales, amistad aceptada y vehículo por cuenta.
- A crea un reto programado e invita a B.
- B ve la invitación, la acepta y A la ve como aceptada.
- A inicia el reto, corre el cronómetro y lo finaliza.
- El reto y los participantes quedan `finished` y aparece en resultados.
- Las cuentas, vehículos, amistad y retos de prueba se eliminaron.

## Pendiente

- Calcular progreso y llegada con GPS real por participante.
- Asignar `finish_rank` con una llegada verificada y reglas anti-trampas.
- Notificaciones push de invitación, aceptación e inicio.
- Retos con varios rivales en la interfaz de clasificación real.
- Revisión legal de textos y límites de edad.
