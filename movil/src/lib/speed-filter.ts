import { haversineMeters } from '@/src/lib/geo';

// Velocímetro estable. El GPS del teléfono da a veces velocidades absurdas
// (saltos de 0 a 90 km/h por un rebote de señal, 3–6 km/h estando parado). Se
// filtra así:
// 1. La velocidad Doppler del GPS solo vale con buena precisión.
// 2. Sin ella, se calcula por distancia/tiempo entre lecturas precisas.
// 3. Un cambio físicamente imposible se recorta (un coche no gana 40 km/h
//    en un segundo).
// 4. Se suaviza y, por debajo de 3 km/h, cuenta como parado.

export type SpeedFix = {
  latitude: number;
  longitude: number;
  // m/s del GPS (null o negativa si no la da).
  speedMps: number | null;
  accuracyM: number | null;
  at: number;
};

export type SpeedState = {
  speedKmh: number | null;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  at: number;
};

// Precisión necesaria para fiarse de la velocidad del GPS.
const DOPPLER_MAX_ACCURACY_M = 30;
// Para calcularla por distancia, ambas lecturas deben ser así de precisas.
const DERIVE_MAX_ACCURACY_M = 20;
// Cambio máximo creíble por segundo: acelerar ~12 km/h (0,34 g); frenar
// mucho más (un frenazo fuerte ronda 30 km/h por segundo).
const MAX_GAIN_KMH_PER_S = 12;
const MAX_DROP_KMH_PER_S = 30;
const STOPPED_KMH = 3;
const MAX_KMH = 250;
// Sin lecturas en este tiempo, se empieza de cero (no se arrastra lo viejo).
const RESET_GAP_MS = 8_000;

function rawSpeedKmh(previous: SpeedState | null, fix: SpeedFix): number | null {
  const accurate = fix.accuracyM == null || fix.accuracyM <= DOPPLER_MAX_ACCURACY_M;
  if (fix.speedMps != null && Number.isFinite(fix.speedMps) && fix.speedMps >= 0 && accurate) {
    return fix.speedMps * 3.6;
  }
  if (!previous) return null;
  const dt = (fix.at - previous.at) / 1000;
  const bothAccurate =
    (fix.accuracyM ?? 99) <= DERIVE_MAX_ACCURACY_M && (previous.accuracyM ?? 99) <= DERIVE_MAX_ACCURACY_M;
  if (dt < 1 || dt > 10 || !bothAccurate) return null;
  return (haversineMeters(previous, fix) / dt) * 3.6;
}

export function nextSpeed(previous: SpeedState | null, fix: SpeedFix): SpeedState {
  const fresh = !previous || fix.at - previous.at > RESET_GAP_MS || fix.at <= previous.at;
  const prior = fresh ? null : previous;
  const raw = rawSpeedKmh(prior, fix);

  let speedKmh: number | null;
  if (raw == null) {
    // Sin dato fiable se mantiene el último (o nada si no había).
    speedKmh = prior?.speedKmh ?? null;
  } else if (prior?.speedKmh == null) {
    speedKmh = Math.min(raw, MAX_KMH);
  } else {
    const dt = Math.max(0.5, (fix.at - prior.at) / 1000);
    const clamped = Math.max(
      prior.speedKmh - MAX_DROP_KMH_PER_S * dt,
      Math.min(prior.speedKmh + MAX_GAIN_KMH_PER_S * dt, raw),
    );
    // Suavizado: responde rápido pero sin temblar (al frenar, más rápido).
    const weight = clamped < prior.speedKmh ? 0.8 : 0.6;
    speedKmh = Math.min(MAX_KMH, prior.speedKmh + (clamped - prior.speedKmh) * weight);
  }
  if (speedKmh != null && speedKmh < STOPPED_KMH) speedKmh = 0;

  return {
    speedKmh,
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracyM: fix.accuracyM,
    at: fix.at,
  };
}
