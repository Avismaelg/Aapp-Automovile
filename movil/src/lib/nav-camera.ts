// Cámara de conducción al estilo Waze: vista inclinada, cerca del coche en
// ciudad y abriéndose poco a poco en vías rápidas, con el coche en la parte
// baja de la pantalla para ver más calle por delante.

export type NavCamera = {
  zoom: number;
  pitch: number;
  // Fracción de la altura del mapa que se reserva arriba: empuja el coche
  // hacia abajo.
  topPaddingRatio: number;
};

// Puntos de la curva velocidad → zoom (km/h, zoom). Entre ellos se interpola.
const ZOOM_CURVE: [number, number][] = [
  [0, 18],
  [20, 17.8],
  [40, 17.3],
  [70, 16.8],
  [100, 16.3],
  [130, 15.9],
];
const MANEUVER_ZOOM = 18;
// A partir de esta distancia al próximo giro se acerca la cámara.
export const MANEUVER_ZOOM_M = 250;
// Pasos de zoom: evita que la cámara "respire" con cada variación del GPS.
const ZOOM_STEP = 0.25;

function interpolate(speedKmh: number) {
  if (speedKmh <= ZOOM_CURVE[0][0]) return ZOOM_CURVE[0][1];
  for (let i = 1; i < ZOOM_CURVE.length; i += 1) {
    const [s1, z1] = ZOOM_CURVE[i];
    if (speedKmh <= s1) {
      const [s0, z0] = ZOOM_CURVE[i - 1];
      return z0 + ((speedKmh - s0) / (s1 - s0)) * (z1 - z0);
    }
  }
  return ZOOM_CURVE[ZOOM_CURVE.length - 1][1];
}

export function navCamera({
  speedKmh,
  walking,
  driving,
  maneuverM,
}: {
  speedKmh: number;
  walking: boolean;
  // Rumbo arriba (conduciendo o navegando); con norte arriba la vista es plana.
  driving: boolean;
  maneuverM?: number | null;
}): NavCamera {
  if (walking) return { zoom: 17.5, pitch: 0, topPaddingRatio: 0 };
  const speed = Number.isFinite(speedKmh) && speedKmh > 0 ? speedKmh : 0;
  let zoom = interpolate(speed);
  if (maneuverM != null && maneuverM < MANEUVER_ZOOM_M && speed < 90) {
    zoom = Math.max(zoom, MANEUVER_ZOOM);
  }
  zoom = Math.round(zoom / ZOOM_STEP) * ZOOM_STEP;
  if (!driving) return { zoom: Math.min(zoom, 17), pitch: 0, topPaddingRatio: 0 };
  // Más inclinación a más velocidad: se ve más lejos sin alejar el coche.
  const pitch = speed < 30 ? 50 : speed < 80 ? 55 : 60;
  return { zoom, pitch, topPaddingRatio: 0.42 };
}
