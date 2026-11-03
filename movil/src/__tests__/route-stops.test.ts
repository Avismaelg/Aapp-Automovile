import { describe, expect, it } from '@jest/globals';

import { metersBetween, type Point } from '@/src/lib/convoy';
import { graphHopperParams, mapboxDirectionsUrl, osrmUrl } from '@/src/lib/graphhopper';
import { instructionsFromOsrm, STOP_TEXT } from '@/src/lib/route-instructions';
import { bestStopIndex, insertStop, MAX_STOPS, reachedNextStop, STOP_REACHED_M } from '@/src/lib/stops';

// Santo Domingo → Boca Chica → Juan Dolio → La Romana (hacia el este).
const HOME: Point = { latitude: 18.4861, longitude: -69.9312 };
const BOCA_CHICA = { latitude: 18.4537, longitude: -69.6111, label: 'Boca Chica' };
const JUAN_DOLIO = { latitude: 18.4269, longitude: -69.4162, label: 'Juan Dolio' };
const LA_ROMANA = { latitude: 18.4227, longitude: -68.9664, label: 'La Romana' };
const SAN_CRISTOBAL = { latitude: 18.416, longitude: -70.1102, label: 'San Cristóbal' };

describe('añadir parada en la ruta', () => {
  it('cada parada va en el hueco que menos alarga el viaje', () => {
    // Añadir primero Juan Dolio y luego Boca Chica: Boca Chica va antes.
    let stops = insertStop(HOME, [], LA_ROMANA, JUAN_DOLIO);
    stops = insertStop(HOME, stops, LA_ROMANA, BOCA_CHICA);
    expect(stops.map((s) => s.label)).toEqual(['Boca Chica', 'Juan Dolio']);
  });

  it('una parada «hacia atrás» va al principio, no a mitad', () => {
    expect(bestStopIndex(HOME, [BOCA_CHICA], LA_ROMANA, SAN_CRISTOBAL)).toBe(0);
  });

  it('no repite la misma parada ni pasa del máximo', () => {
    let stops = insertStop(HOME, [], LA_ROMANA, BOCA_CHICA);
    stops = insertStop(HOME, stops, LA_ROMANA, { ...BOCA_CHICA, label: 'Boca Chica otra vez' });
    expect(stops).toHaveLength(1);
    let many = stops;
    for (let i = 0; i < 10; i += 1) {
      many = insertStop(HOME, many, LA_ROMANA, {
        latitude: 18.45 - i * 0.01,
        longitude: -69.7 + i * 0.05,
        label: `p${i}`,
      });
    }
    expect(many.length).toBe(MAX_STOPS);
  });

  it('GraphHopper recibe salida, paradas en orden y destino', () => {
    const params = graphHopperParams(HOME, LA_ROMANA, [BOCA_CHICA, JUAN_DOLIO]);
    const points = params.filter((p) => p.startsWith('point='));
    expect(points).toEqual([
      `point=${HOME.latitude},${HOME.longitude}`,
      `point=${BOCA_CHICA.latitude},${BOCA_CHICA.longitude}`,
      `point=${JUAN_DOLIO.latitude},${JUAN_DOLIO.longitude}`,
      `point=${LA_ROMANA.latitude},${LA_ROMANA.longitude}`,
    ]);
    // Con paradas no se piden alternativas (GraphHopper no las da).
    expect(params.some((p) => p.startsWith('algorithm='))).toBe(false);
    expect(graphHopperParams(HOME, LA_ROMANA).some((p) => p.startsWith('algorithm='))).toBe(true);
  });

  it('OSRM recibe las paradas y sin alternativas', () => {
    const url = decodeURIComponent(osrmUrl(HOME, LA_ROMANA, [BOCA_CHICA]));
    expect(url).toContain(
      `${HOME.longitude},${HOME.latitude};${BOCA_CHICA.longitude},${BOCA_CHICA.latitude};${LA_ROMANA.longitude},${LA_ROMANA.latitude}`,
    );
    expect(url).toContain('alternatives=false');
  });

  it('las instrucciones dicen «Llegas a tu parada» a mitad y quitan la salida repetida', () => {
    const steps = [
      { distance: 500, name: 'Av. España', maneuver: { type: 'depart' } },
      { distance: 0, name: '', maneuver: { type: 'arrive' } },
      { distance: 300, name: 'Autopista Las Américas', maneuver: { type: 'depart' } },
      { distance: 200, name: 'Calle 1', maneuver: { type: 'turn', modifier: 'right' } },
      { distance: 0, name: '', maneuver: { type: 'arrive' } },
    ];
    const list = instructionsFromOsrm(steps);
    expect(list.map((i) => i.icon)).toEqual(['depart', 'arrive', 'right', 'arrive']);
    expect(list[1].text).toBe(STOP_TEXT);
    expect(list[3].text).not.toBe(STOP_TEXT);
  });

  it('viaje completo con 2 paradas: se hacen en orden y llegas al final', () => {
    let stops = insertStop(HOME, [], LA_ROMANA, JUAN_DOLIO);
    stops = insertStop(HOME, stops, LA_ROMANA, BOCA_CHICA);
    const done: string[] = [];
    // Conduce en línea recta por los puntos de la ruta a 80 km/h.
    const path: Point[] = [HOME, BOCA_CHICA, JUAN_DOLIO, LA_ROMANA];
    let position = HOME;
    for (let leg = 0; leg < path.length - 1; leg += 1) {
      const from = path[leg];
      const to = path[leg + 1];
      const total = metersBetween(from, to);
      for (let m = 0; m <= total; m += 22) {
        const k = m / total;
        position = {
          latitude: from.latitude + (to.latitude - from.latitude) * k,
          longitude: from.longitude + (to.longitude - from.longitude) * k,
        };
        if (reachedNextStop(position, stops)) {
          done.push(stops[0].label);
          stops = stops.slice(1);
        }
      }
    }
    expect(done).toEqual(['Boca Chica', 'Juan Dolio']);
    expect(stops).toHaveLength(0);
    expect(metersBetween(position, LA_ROMANA)).toBeLessThan(STOP_REACHED_M);
  });

  it('pasar cerca de la 2ª parada antes de la 1ª no la salta', () => {
    const stops = [BOCA_CHICA, JUAN_DOLIO];
    expect(reachedNextStop(JUAN_DOLIO, stops)).toBe(false);
    expect(reachedNextStop(BOCA_CHICA, stops)).toBe(true);
  });

  it('una gasolinera a 90 m de la carretera también se da por hecha al pasar', () => {
    const station = { latitude: 18.4537, longitude: -69.6111 };
    const onRoad = { latitude: 18.4537 + 90 / 110_540, longitude: -69.6111 };
    expect(reachedNextStop(onRoad, [station])).toBe(false);
    expect(reachedNextStop(onRoad, [station], 90)).toBe(true);
    // Pero no a 400 m (otra calle).
    const farther = { latitude: 18.4537 + 400 / 110_540, longitude: -69.6111 };
    expect(reachedNextStop(farther, [station], 90)).toBe(false);
  });
});

describe('MAPA-12: rutas con tráfico de Mapbox', () => {
  it('usa el perfil con tráfico, pide alternativas sin paradas y no con ellas', () => {
    const plain = mapboxDirectionsUrl(HOME, LA_ROMANA);
    expect(plain).toContain('/mapbox/driving-traffic/');
    expect(plain).toContain('alternatives=true');
    expect(plain).toContain('steps=true');
    const withStop = mapboxDirectionsUrl(HOME, LA_ROMANA, [BOCA_CHICA]);
    expect(withStop).toContain('alternatives=false');
    expect(withStop.split('driving-traffic/')[1].split('?')[0].split(';')).toHaveLength(3);
  });
});
