import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { fetchWithTimeout } from '@/src/lib/network';

export type RoadInfo = {
  limitKmh: number | null;
  roadName: string | null;
};

const EMPTY: RoadInfo = { limitKmh: null, roadName: null };
const QUERY_MIN_INTERVAL_MS = 20_000;
const QUERY_MIN_DISTANCE_M = 100;

function requestHeaders() {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (Platform.OS !== 'web') {
    // Nominatim exige identificar la app; en navegador no se puede cambiar.
    headers['User-Agent'] = 'CaravanaApp/0.1 (https://github.com/Avismaelg/Aapp-Automovile)';
  }
  return headers;
}

function parseSpeedLimit(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  const match = text.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  let speed = Number.parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(speed) || speed <= 0) return null;
  if (text.includes('mph')) speed *= 1.60934;
  speed = Math.round(speed);
  if (speed < 5 || speed > 160) return null;
  return speed;
}

function movedMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  return Math.hypot(
    (b.lat - a.lat) * 111320,
    (b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180),
  );
}

type NominatimReverse = {
  name?: string;
  extratags?: { maxspeed?: string } | null;
  osm_type?: string;
  osm_id?: number;
};

type OsmWayResponse = {
  elements?: { tags?: Record<string, string> }[];
};

// Nombre de la vía y límite de velocidad desde OpenStreetMap. Se consulta como
// mucho cada 20 s y 100 m (política de uso de Nominatim) y solo en movimiento.
export function useRoadInfo(
  location: { latitude: number; longitude: number; speedKmh?: number | null },
  enabled = true,
) {
  const [info, setInfo] = useState<RoadInfo>(EMPTY);
  const lastQueryRef = useRef<{ lat: number; lng: number; at: number } | null>(null);

  const { latitude, longitude, speedKmh } = location;
  // La calle y el límite no necesitan precisión de cada fix GPS. Muestrear a
  // ~11 m evita recrear el efecto en cada actualización del sensor.
  const sampledLatitude = Number(latitude.toFixed(4));
  const sampledLongitude = Number(longitude.toFixed(4));
  const sampledSpeed = speedKmh == null ? null : Math.round(speedKmh / 5) * 5;

  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    const previous = lastQueryRef.current;
    if (previous) {
      if (now - previous.at < QUERY_MIN_INTERVAL_MS) return;
       if (movedMeters(previous, { lat: sampledLatitude, lng: sampledLongitude }) < QUERY_MIN_DISTANCE_M) return;
       if (sampledSpeed != null && sampledSpeed < 5) return;
    }
    lastQueryRef.current = { lat: sampledLatitude, lng: sampledLongitude, at: now };

    const controller = new AbortController();

    void (async () => {
      try {
        const reverseUrl =
          'https://nominatim.openstreetmap.org/reverse?format=json&zoom=17&extratags=1&accept-language=es' +
          `&lat=${sampledLatitude.toFixed(5)}&lon=${sampledLongitude.toFixed(5)}`;
        const reverse = await fetchWithTimeout(reverseUrl, {
          signal: controller.signal,
          headers: requestHeaders(),
        });
        if (!reverse.ok) return;
        const place = (await reverse.json()) as NominatimReverse;

        const roadName =
          typeof place.name === 'string' && place.name.trim() ? place.name.trim() : null;
        let limitKmh = parseSpeedLimit(place.extratags?.maxspeed);

        // Si Nominatim no trae la etiqueta, se consulta la vía directa en OSM.
        if (limitKmh == null && place.osm_type === 'way' && place.osm_id) {
          const wayResponse = await fetchWithTimeout(
            `https://api.openstreetmap.org/api/0.6/way/${place.osm_id}.json`,
            { signal: controller.signal, headers: requestHeaders() },
          );
          if (wayResponse.ok) {
            const way = (await wayResponse.json()) as OsmWayResponse;
            limitKmh = parseSpeedLimit(way.elements?.[0]?.tags?.maxspeed);
          }
        }

        setInfo({ limitKmh, roadName });
      } catch {
        // Sin red o límite de uso: se mantiene la última información.
      }
    })();

    return () => controller.abort();
  }, [enabled, sampledLatitude, sampledLongitude, sampledSpeed]);

  return info;
}
