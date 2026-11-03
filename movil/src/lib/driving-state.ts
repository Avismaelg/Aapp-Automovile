// Cuándo mostrar la notificación de conducción según la velocidad del GPS.
// El sensor de actividad (MotionReceiver) es el aviso principal; esto lo
// respalda en teléfonos donde el sensor tarda o no existe.

// A partir de esta velocidad vas en un vehículo (caminar o trotar no llega).
export const DRIVING_START_KMH = 15;
// Por debajo de esta velocidad cuenta como parado.
export const DRIVING_STOP_KMH = 5;
// Parado durante este tiempo se apaga. Un tapón en la Máximo Gómez pasa
// de 4 min sin moverse: con 4 min se apagaba y la ruta se quedaba sin puntos.
export const DRIVING_IDLE_MS = 10 * 60 * 1000;

export type DrivingTracker = { active: boolean; lastMovingAt: number | null };

export function nextDrivingState(
  state: DrivingTracker,
  speedKmh: number | null,
  now: number,
): { state: DrivingTracker; action: 'start' | 'stop' | null } {
  if (speedKmh != null && speedKmh >= DRIVING_START_KMH) {
    return { state: { active: true, lastMovingAt: now }, action: state.active ? null : 'start' };
  }
  const moving = speedKmh != null && speedKmh >= DRIVING_STOP_KMH;
  const lastMovingAt = moving ? now : state.lastMovingAt;
  if (state.active && (lastMovingAt == null || now - lastMovingAt >= DRIVING_IDLE_MS)) {
    return { state: { active: false, lastMovingAt }, action: 'stop' };
  }
  return { state: { active: state.active, lastMovingAt }, action: null };
}
