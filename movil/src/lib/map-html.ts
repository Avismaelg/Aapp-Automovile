export type WorldMapMember = {
  id: string;
  name: string;
  color: string;
  latitude: number;
  longitude: number;
  isTalking?: boolean;
  battery?: number;
};

export type WorldMapDestination = {
  latitude: number;
  longitude: number;
  label: string;
};

export type WorldMapLocation = {
  latitude: number;
  longitude: number;
  heading?: number | null;
  accuracy?: number | null;
  speedKmh?: number | null;
};

// Coordenadas en formato [latitud, longitud], igual que GraphHopper.
export type WorldMapRoute = {
  coordinates: [number, number][];
  distanceM: number;
  timeMs: number;
  source: 'graphhopper' | 'osrm' | 'fallback';
};

export type WorldMapMode = '2d' | '3d';

export type WorldMapVehicleKind = 'car' | 'motorcycle' | 'ev' | 'truck';

export type WorldMapParking = {
  latitude: number;
  longitude: number;
};

export type WorldMapCommand =
  | { type: 'location'; payload: WorldMapLocation }
  | { type: 'members'; payload: WorldMapMember[] }
  | { type: 'destination'; payload: WorldMapDestination | null }
  | { type: 'route'; payload: WorldMapRoute | null }
  | { type: 'mode'; payload: WorldMapMode }
  | { type: 'vehicle'; payload: { color: string; kind?: WorldMapVehicleKind } }
  | { type: 'parking'; payload: WorldMapParking | null }
  | { type: 'recenter' };

export type WorldMapEvent =
  | { type: 'ready' }
  | { type: 'follow'; value: boolean }
  | { type: 'memberTap'; id: string }
  | { type: 'error'; message: string };

export function encodeWorldMapCommand(seq: number, command: WorldMapCommand) {
  return JSON.stringify({ ...command, seq });
}

export function parseWorldMapEvent(raw: unknown): WorldMapEvent | null {
  if (typeof raw !== 'string') return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const event = data as { type?: unknown; value?: unknown; id?: unknown; message?: unknown };
  if (event.type === 'ready') return { type: 'ready' };
  if (event.type === 'follow' && typeof event.value === 'boolean') {
    return { type: 'follow', value: event.value };
  }
  if (event.type === 'memberTap' && typeof event.id === 'string') {
    return { type: 'memberTap', id: event.id };
  }
  if (event.type === 'error' && typeof event.message === 'string') {
    return { type: 'error', message: event.message };
  }
  return null;
}

const MAPLIBRE_BASE = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl';

// El HTML es estático: los datos cambian por postMessage y el WebView no se recarga.
export const WORLD_MAP_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="${MAPLIBRE_BASE}.css" />
<style>
  * { box-sizing: border-box; }
  html, body, #map { height: 100%; width: 100%; margin: 0; overflow: hidden; background: #06080b; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
  .vehicle, .dest { pointer-events: none; }
  .member { pointer-events: auto; cursor: pointer; }
  .vehicle { --car-color: #ff5a1f; position: relative; width: 64px; height: 64px; transition: opacity 0.3s ease; }
  .vehicle-halo {
    position: absolute; left: 14px; top: 14px; width: 36px; height: 36px; border-radius: 50%;
    background: var(--car-color); animation: halo 2s ease-out infinite;
  }
  .vehicle-arrow { position: absolute; left: 0; top: 0; width: 64px; height: 64px; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.55)); }
  .vehicle-arrow path { fill: var(--car-color); stroke: #ffffff; stroke-width: 4; stroke-linejoin: round; }
  .vehicle.is-3d .vehicle-arrow { display: none; }
  .guide-arrow { pointer-events: none; width: 44px; height: 44px; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.55)); }
  .guide-arrow path { fill: #c9ff4d; stroke: #06080b; stroke-width: 3; stroke-linejoin: round; }
  .parking { pointer-events: none; display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .parking-badge {
    width: 38px; height: 38px; border-radius: 50%; background: #4de1ff;
    border: 2px solid #06080b; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 14px rgba(0,0,0,0.5);
  }
  .parking-badge svg { width: 21px; height: 21px; fill: none; stroke: #06131a; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .parking-label {
    white-space: nowrap; background: #06131a; color: #4de1ff; font-size: 9px; font-weight: 800;
    padding: 2px 6px; border-radius: 5px; border: 1px solid rgba(77,225,255,0.5);
  }
  .member { position: relative; width: 44px; height: 44px; }
  .member-dot {
    position: absolute; left: 3px; top: 3px; width: 38px; height: 38px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #071016; font-weight: 800; font-size: 11px; letter-spacing: -0.3px;
    border: 2px solid rgba(6,8,11,0.9); box-shadow: 0 4px 14px rgba(0,0,0,0.5);
  }
  .member.talking .member-dot { animation: talk 1.4s ease-out infinite; }
  .member-name {
    position: absolute; top: 44px; left: 50%; transform: translateX(-50%); white-space: nowrap;
    color: #e8edf4; font-size: 9px; font-weight: 700;
    background: rgba(6,8,11,0.75); border: 1px solid rgba(255,255,255,0.12);
    padding: 2px 5px; border-radius: 5px;
  }
  .dest { position: relative; width: 44px; height: 44px; }
  .dest-icon {
    position: absolute; left: 5px; top: 5px; width: 34px; height: 34px; border-radius: 11px;
    background: #c9ff4d; border: 2px solid #06080b;
    display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.5);
  }
  .dest-icon svg { width: 18px; height: 18px; fill: none; stroke: #101603; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  .dest-label {
    position: absolute; top: 42px; left: 50%; transform: translateX(-50%); white-space: nowrap;
    max-width: 160px; overflow: hidden; text-overflow: ellipsis;
    color: #101603; background: #c9ff4d; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 5px;
  }
  @keyframes halo {
    0% { transform: scale(0.8); opacity: 0.45; }
    100% { transform: scale(2.4); opacity: 0; }
  }
  @keyframes talk {
    0% { box-shadow: 0 0 0 0 rgba(255,90,31,0.55); }
    100% { box-shadow: 0 0 0 14px rgba(255,90,31,0); }
  }
</style>
</head>
<body>
<div id="map"></div>
<script src="${MAPLIBRE_BASE}.js"></script>
<script>
(function () {
  var STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
  var TERRAIN_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  var DEFAULT_CENTER = [-69.9312, 18.4861];
  var CRUISE_PITCH = 65;
  var FOLLOW_ZOOM = 17;
  var MOVING_KMH = 5;
  var LOAD_TIMEOUT_MS = 25000;
  var EMPTY_ROUTE = { type: 'FeatureCollection', features: [] };
  var THREE_MODULE_URL = 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js';
  var CAR_LENGTH_PX = 60;
  var CAR_LOOKAHEAD_M = 20;
  var CAMERA_DISTANCE = 1000;
  var GUIDE_CHECKPOINT_MIN_M = 500;
  var GUIDE_MAX_CHECKPOINTS = 40;
  var GUIDE_ARROW_AHEAD_M = 45;
  var BRAKE_LOOKAHEAD_M = 400;
  var BRAKE_RED_M = 150;
  var BRAKE_RED_DEG = 55;
  var BRAKE_YELLOW_DEG = 25;

  var state = {
    location: null,
    members: [],
    destination: null,
    route: null,
    mode: '3d',
    following: true,
    heading: null,
    vehicleColor: '#ff5a1f',
    vehicleKind: 'car',
    parking: null
  };
  var map = null;
  var mapReady = false;
  var errorSent = false;
  var lastSeq = 0;
  var vehicleMarker = null;
  var destinationMarker = null;
  var destinationLabel = null;
  var memberMarkers = new Map();
  var THREE = null;
  var car3d = null;
  var routePoints = [];
  var guideMarker = null;
  var parkingMarker = null;
  var lastFollow = null;
  var smoothedHeading = null;
  var carRenderWarned = false;

  function post(message) {
    var payload = JSON.stringify(message);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(payload);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, '*');
    }
  }

  function fail(message) {
    if (errorSent) return;
    errorSent = true;
    post({ type: 'error', message: message });
  }

  function parse(data) {
    if (typeof data !== 'string') return null;
    try {
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  function pitchFor(mode) {
    return mode === '2d' ? 0 : CRUISE_PITCH;
  }

  function lngLatOf(point) {
    return [point.longitude, point.latitude];
  }

  function initials(name) {
    return String(name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) { return part.charAt(0); })
      .join('')
      .toUpperCase();
  }

  function firstName(name) {
    return String(name || '').split(' ')[0] || '';
  }

  function firstSymbolLayerId() {
    var layers = map.getStyle().layers || [];
    for (var i = 0; i < layers.length; i += 1) {
      if (layers[i].type === 'symbol') return layers[i].id;
    }
    return undefined;
  }

  function setFollowing(value) {
    if (state.following === value) return;
    state.following = value;
    document.body.setAttribute('data-follow', value ? 'on' : 'off');
    post({ type: 'follow', value: value });
  }

  function follow(animate, zoomIn) {
    if (!mapReady || !state.location) return;
    var point = state.location;
    var bearing = state.heading !== null ? state.heading : map.getBearing();
    var center = lngLatOf(point);
    var moving = typeof point.speedKmh === 'number' && point.speedKmh >= MOVING_KMH;

    // Movimiento continuo: en vez de saltar a cada señal GPS, proyectamos a
    // donde estará el coche y la cámara desliza hasta ese punto.
    if (moving) {
      var meters = (point.speedKmh / 3.6) * 2.2;
      center = aheadLngLat(point, bearing, meters);
    }

    if (lastFollow && !zoomIn) {
      var moved = haversineLngLat(lastFollow.center, center);
      var turned = Math.abs(((bearing - lastFollow.bearing + 540) % 360) - 180);
      if (moved < 8 && turned < 6) return;
    }
    lastFollow = { center: center, bearing: bearing };

    var options = {
      center: center,
      pitch: pitchFor(state.mode),
      bearing: bearing,
      duration: animate ? (moving ? 1900 : 500) : 0,
      essential: true
    };
    if (moving) options.easing = function (t) { return t; };
    if (zoomIn || map.getZoom() < FOLLOW_ZOOM - 0.5) options.zoom = FOLLOW_ZOOM;
    map.easeTo(options);
  }

  function setLocation(location) {
    if (!location) return;
    var firstFix = !state.location;
    state.location = location;
    var moving = typeof location.speedKmh !== 'number' || location.speedKmh >= MOVING_KMH;
    if (typeof location.heading === 'number' && location.heading >= 0 && moving) {
      // Filtro simple: el GPS tiembla ±20°, la cámara no debe bailar.
      if (smoothedHeading === null) {
        smoothedHeading = location.heading;
      } else {
        var delta = ((location.heading - smoothedHeading + 540) % 360) - 180;
        smoothedHeading = (smoothedHeading + delta * 0.5 + 360) % 360;
      }
      state.heading = smoothedHeading;
    }
    if (!mapReady) return;
    vehicleMarker.setLngLat(lngLatOf(location));
    if (state.heading !== null) vehicleMarker.setRotation(state.heading);
    renderCar();
    updateBrakeAssist();
    updateGuideArrow();
    updateParkingLine();
    if (state.following) follow(true, firstFix);
  }

  function buildMemberElement(member) {
    var element = document.createElement('div');
    element.className = 'member';
    element.addEventListener('click', function () {
      post({ type: 'memberTap', id: member.id });
    });
    var dot = document.createElement('div');
    dot.className = 'member-dot';
    dot.style.background = member.color;
    dot.textContent = initials(member.name);
    var label = document.createElement('div');
    label.className = 'member-name';
    label.textContent = firstName(member.name);
    element.appendChild(dot);
    element.appendChild(label);
    return element;
  }

  function setMembers(members) {
    state.members = Array.isArray(members) ? members : [];
    if (!mapReady) return;
    var present = {};
    state.members.forEach(function (member) {
      present[member.id] = true;
      var entry = memberMarkers.get(member.id);
      if (entry && (entry.name !== member.name || entry.color !== member.color)) {
        entry.marker.remove();
        memberMarkers.delete(member.id);
        entry = null;
      }
      if (!entry) {
        var element = buildMemberElement(member);
        var marker = new maplibregl.Marker({ element: element }).setLngLat(lngLatOf(member)).addTo(map);
        entry = { marker: marker, element: element, name: member.name, color: member.color };
        memberMarkers.set(member.id, entry);
      }
      entry.marker.setLngLat(lngLatOf(member));
      entry.element.classList.toggle('talking', Boolean(member.isTalking));
    });
    memberMarkers.forEach(function (entry, id) {
      if (!present[id]) {
        entry.marker.remove();
        memberMarkers.delete(id);
      }
    });
  }

  function setDestination(destination) {
    state.destination = destination || null;
    if (!mapReady) return;
    if (!state.destination) {
      destinationMarker.remove();
      return;
    }
    destinationLabel.textContent = state.destination.label;
    destinationMarker.setLngLat(lngLatOf(state.destination)).addTo(map);
  }

  function setRoute(route) {
    state.route = route || null;
    if (!mapReady) return;
    var points = state.route && state.route.coordinates ? state.route.coordinates : [];
    routePoints = points.map(function (point) { return [point[1], point[0]]; });
    var data = EMPTY_ROUTE;
    if (points.length > 1) {
      data = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: { kind: state.route.source },
          geometry: {
            type: 'LineString',
            coordinates: points.map(function (point) { return [point[1], point[0]]; })
          }
        }]
      };
    }
    map.getSource('caravana-route').setData(data);
    updateGuide();
  }

  function haversineLngLat(a, b) {
    var R = 6371000;
    var toRad = function (deg) { return deg * Math.PI / 180; };
    var dLat = toRad(b[1] - a[1]);
    var dLng = toRad(b[0] - a[0]);
    var h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function bearingLngLat(a, b) {
    var dLng = (b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180);
    var dLat = b[1] - a[1];
    var deg = Math.atan2(dLng, dLat) * 180 / Math.PI;
    return (deg + 360) % 360;
  }

  // Banderas de checkpoint repartidas a lo largo de la ruta, estilo Forza.
  function computeCheckpoints(points) {
    var cumulative = [];
    var total = 0;
    for (var i = 1; i < points.length; i += 1) {
      total += haversineLngLat(points[i - 1], points[i]);
      cumulative.push(total);
    }
    if (total < GUIDE_CHECKPOINT_MIN_M * 2) return [];

    var spacing = Math.max(GUIDE_CHECKPOINT_MIN_M, total / GUIDE_MAX_CHECKPOINTS);
    var result = [];
    var next = spacing;
    var index = 1;
    while (next < total - spacing * 0.6) {
      while (index < cumulative.length && cumulative[index - 1] < next) index += 1;
      if (index >= points.length) break;
      var before = index === 1 ? 0 : cumulative[index - 2];
      var span = cumulative[index - 1] - before;
      var t = span > 0 ? (next - before) / span : 0;
      var a = points[index - 1];
      var b = points[index];
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      next += spacing;
    }
    return result;
  }

  // Punto de la ruta a X metros delante del coche, con el rumbo de ese tramo.
  function pointAheadOnRoute(origin, meters) {
    var nearest = 0;
    var nearestDistance = Infinity;
    for (var i = 0; i < routePoints.length; i += 1) {
      var d = haversineLngLat(origin, routePoints[i]);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = i;
      }
    }

    var walked = 0;
    for (var j = nearest; j < routePoints.length - 1; j += 1) {
      var a = routePoints[j];
      var b = routePoints[j + 1];
      var span = haversineLngLat(a, b);
      if (walked + span >= meters) {
        var t = span > 0 ? (meters - walked) / span : 0;
        return {
          point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
          bearing: bearingLngLat(a, b)
        };
      }
      walked += span;
    }

    var last = routePoints[routePoints.length - 1];
    var before = routePoints[routePoints.length - 2];
    return { point: last, bearing: bearingLngLat(before, last) };
  }

  function updateGuide() {
    if (!mapReady || !map.getSource('caravana-guide')) return;
    var checkpoints = routePoints.length > 2 ? computeCheckpoints(routePoints) : [];
    map.getSource('caravana-guide').setData(
      checkpoints.length
        ? {
            type: 'FeatureCollection',
            features: checkpoints.map(function (point) {
              return {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Point', coordinates: point }
              };
            })
          }
        : EMPTY_ROUTE
    );
    updateBrakeAssist();
    updateGuideArrow();
  }

  function nearestRouteIndex(origin) {
    var nearest = 0;
    var nearestDistance = Infinity;
    for (var i = 0; i < routePoints.length; i += 1) {
      var d = haversineLngLat(origin, routePoints[i]);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = i;
      }
    }
    return nearest;
  }

  // Curva siguiente: cambio de rumbo y distancia desde el coche.
  function brakeLevel(deltaDeg, distanceM) {
    if (deltaDeg >= BRAKE_RED_DEG && distanceM <= BRAKE_RED_M) return 'red';
    if (deltaDeg >= BRAKE_YELLOW_DEG) return 'yellow';
    return 'green';
  }

  // Asistencia de frenado: pinta los próximos metros de ruta en
  // verde (sin problema), amarillo (suelta el acelerador) o rojo (frena ya).
  function updateBrakeAssist() {
    if (!mapReady || !map.getSource('caravana-brake')) return;
    if (routePoints.length < 3 || !state.location) {
      map.getSource('caravana-brake').setData(EMPTY_ROUTE);
      return;
    }

    var origin = lngLatOf(state.location);
    var start = nearestRouteIndex(origin);
    var segments = [];
    var walked = 0;
    var i = start;

    while (i < routePoints.length - 1 && walked < BRAKE_LOOKAHEAD_M) {
      var a = routePoints[i];
      var b = routePoints[i + 1];
      var span = haversineLngLat(a, b);
      if (span === 0) {
        i += 1;
        continue;
      }

      // Rumbo de entrada y de salida en la curva que sigue a este tramo.
      var before = routePoints[Math.max(0, i - 1)];
      var delta = Math.abs(bearingLngLat(before, a) - bearingLngLat(a, b));
      if (delta > 180) delta = 360 - delta;
      var level = brakeLevel(delta, walked + span);

      segments.push({
        type: 'Feature',
        properties: { level: level },
        geometry: { type: 'LineString', coordinates: [a, b] }
      });
      walked += span;
      i += 1;
    }

    map.getSource('caravana-brake').setData({
      type: 'FeatureCollection',
      features: segments
    });
  }

  function addBrakeLayer() {
    map.addSource('caravana-brake', { type: 'geojson', data: EMPTY_ROUTE });
    map.addLayer({
      id: 'caravana-brake-line',
      type: 'line',
      source: 'caravana-brake',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': [
          'match',
          ['get', 'level'],
          'red',
          '#ff4d5e',
          'yellow',
          '#ffc94d',
          '#3ddc84'
        ],
        'line-width': 5,
        'line-opacity': 0.92
      }
    }, firstSymbolLayerId());
  }

  // Nivel de la primera curva que exige frenar más adelante.
  function nextBrakeLevel() {
    var origin = lngLatOf(state.location);
    var start = nearestRouteIndex(origin);
    var walked = 0;
    var i = start;
    while (i < routePoints.length - 1 && walked < BRAKE_LOOKAHEAD_M) {
      var a = routePoints[i];
      var b = routePoints[i + 1];
      var before = routePoints[Math.max(0, i - 1)];
      var delta = Math.abs(bearingLngLat(before, a) - bearingLngLat(a, b));
      if (delta > 180) delta = 360 - delta;
      var span = haversineLngLat(a, b);
      var level = brakeLevel(delta, walked + span);
      if (level !== 'green') return level;
      walked += span;
      i += 1;
    }
    return 'green';
  }

  function updateGuideArrow() {
    if (!mapReady) return;
    var show = routePoints.length >= 2 && Boolean(state.location);
    if (!show) {
      if (guideMarker) guideMarker.getElement().style.display = 'none';
      return;
    }
    var target = pointAheadOnRoute(lngLatOf(state.location), GUIDE_ARROW_AHEAD_M);
    if (!guideMarker) {
      var element = document.createElement('div');
      element.className = 'guide-arrow';
      element.innerHTML =
        '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4 L34 34 L20 27 L6 34 Z"></path></svg>';
      guideMarker = new maplibregl.Marker({
        element: element,
        rotationAlignment: 'map',
        pitchAlignment: 'viewport'
      }).setLngLat(target.point).addTo(map);
    }
    guideMarker.getElement().style.display = '';
    guideMarker.setLngLat(target.point);
    guideMarker.setRotation(target.bearing);
    var level = nextBrakeLevel();
    var arrowPath = guideMarker.getElement().querySelector('path');
    if (arrowPath) {
      arrowPath.setAttribute(
        'fill',
        level === 'red' ? '#ff4d5e' : level === 'yellow' ? '#ffc94d' : '#c9ff4d'
      );
    }
  }

  function createFlagIcon() {
    var size = 60;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var context = canvas.getContext('2d');
    context.fillStyle = 'rgba(6,8,11,0.9)';
    context.fillRect(size * 0.42, size * 0.14, size * 0.07, size * 0.72);
    context.beginPath();
    context.moveTo(size * 0.49, size * 0.16);
    context.lineTo(size * 0.86, size * 0.3);
    context.lineTo(size * 0.49, size * 0.46);
    context.closePath();
    context.fillStyle = '#c9ff4d';
    context.fill();
    context.strokeStyle = 'rgba(6,8,11,0.85)';
    context.lineWidth = size * 0.05;
    context.stroke();
    context.beginPath();
    context.arc(size * 0.455, size * 0.87, size * 0.09, 0, Math.PI * 2);
    context.fillStyle = 'rgba(201,255,77,0.9)';
    context.fill();
    var image = context.getImageData(0, 0, size, size);
    map.addImage('caravana-guide-flag', {
      width: size,
      height: size,
      data: new Uint8Array(image.data.buffer)
    });
  }

  function addGuideLayer() {
    createFlagIcon();
    map.addSource('caravana-guide', { type: 'geojson', data: EMPTY_ROUTE });
    map.addLayer({
      id: 'caravana-guide-flags',
      type: 'symbol',
      source: 'caravana-guide',
      layout: {
        'icon-image': 'caravana-guide-flag',
        'icon-size': 0.85,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    }, firstSymbolLayerId());
  }

  function setMode(mode) {
    state.mode = mode === '2d' ? '2d' : '3d';
    document.body.setAttribute('data-mode', state.mode);
    if (!mapReady) return;
    map.easeTo({ pitch: pitchFor(state.mode), duration: 700, essential: true });
  }

  function recenter() {
    setFollowing(true);
    follow(true, true);
  }

  function handleMessage(event) {
    var message = parse(event.data);
    if (!message || typeof message.seq !== 'number' || message.seq === lastSeq) return;
    lastSeq = message.seq;
    if (message.type === 'location') setLocation(message.payload);
    else if (message.type === 'members') setMembers(message.payload);
    else if (message.type === 'destination') setDestination(message.payload);
    else if (message.type === 'route') setRoute(message.payload);
    else if (message.type === 'mode') setMode(message.payload);
    else if (message.type === 'vehicle') setVehicleInput(message.payload);
    else if (message.type === 'parking') setParking(message.payload);
    else if (message.type === 'recenter') recenter();
  }

  // Al cargar el relieve la cámara cambia de altura sin evento de movimiento; reproyectamos los marcadores.
  function refreshMarkers() {
    if (vehicleMarker) vehicleMarker.setLngLat(vehicleMarker.getLngLat());
    if (destinationMarker) destinationMarker.setLngLat(destinationMarker.getLngLat());
    memberMarkers.forEach(function (entry) {
      entry.marker.setLngLat(entry.marker.getLngLat());
    });
  }

  function addTerrain() {
    try {
      map.addSource('caravana-terrain', {
        type: 'raster-dem',
        tiles: [TERRAIN_URL],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 15
      });
      map.setTerrain({ source: 'caravana-terrain', exaggeration: 1 });
    } catch (error) {
      // Sin relieve el mapa sigue en 3D con inclinación y edificios.
    }
  }

  function addBuildings() {
    var style = map.getStyle();
    var layers = style.layers || [];
    var sources = style.sources || {};
    var sourceId = Object.keys(sources).filter(function (id) {
      return sources[id].type === 'vector';
    })[0];
    var hasExtrusions = layers.some(function (layer) {
      return layer.type === 'fill-extrusion';
    });
    if (!sourceId || hasExtrusions) return;
    map.addLayer({
      id: 'caravana-buildings-3d',
      type: 'fill-extrusion',
      source: sourceId,
      'source-layer': 'building',
      minzoom: 14.5,
      paint: {
        'fill-extrusion-color': '#313c53',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 8],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'height_min'], 0],
        'fill-extrusion-opacity': 0.9
      }
    }, firstSymbolLayerId());
  }

  function addRoute() {
    map.addSource('caravana-route', { type: 'geojson', data: EMPTY_ROUTE });
    var before = firstSymbolLayerId();
    map.addLayer({
      id: 'caravana-route-casing',
      type: 'line',
      source: 'caravana-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#05070a', 'line-width': 10, 'line-opacity': 0.7 }
    }, before);
    map.addLayer({
      id: 'caravana-route-line',
      type: 'line',
      source: 'caravana-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['==', ['get', 'kind'], 'fallback'], '#c9ff4d', '#ff5a1f'],
        'line-width': 5
      }
    }, before);
  }

  function addVehicle() {
    var element = document.createElement('div');
    element.className = 'vehicle';
    element.style.setProperty('--car-color', state.vehicleColor);
    element.innerHTML =
      '<div class="vehicle-halo"></div>' +
      '<svg class="vehicle-arrow" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 L50 56 L32 46 L14 56 Z"></path></svg>';
    vehicleMarker = new maplibregl.Marker({
      element: element,
      rotationAlignment: 'map',
      pitchAlignment: 'viewport'
    })
      .setLngLat(state.location ? lngLatOf(state.location) : DEFAULT_CENTER)
      .addTo(map);
  }

  function normalizeColor(value) {
    var color = typeof value === 'string' ? value.trim() : '';
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    if (/^#[0-9a-f]{3}$/i.test(color)) {
      return '#' + color.charAt(1) + color.charAt(1) + color.charAt(2) + color.charAt(2) + color.charAt(3) + color.charAt(3);
    }
    if (/^[0-9a-f]{6}$/i.test(color)) return '#' + color;
    return '#ff5a1f';
  }

  function normalizeKind(value) {
    var kinds = ['car', 'motorcycle', 'ev', 'truck'];
    return kinds.indexOf(value) >= 0 ? value : 'car';
  }

  function vehicleBuilder(kind) {
    if (kind === 'motorcycle') return buildMotorcycle;
    if (kind === 'truck') return buildTruck;
    return buildCar;
  }

  function setVehicleInput(input) {
    state.vehicleColor = normalizeColor(input && input.color);
    state.vehicleKind = normalizeKind(input && input.kind);
    if (vehicleMarker) vehicleMarker.getElement().style.setProperty('--car-color', state.vehicleColor);
    if (!car3d) return;
    car3d.paint.color.set(state.vehicleColor);
    if (car3d.kind !== state.vehicleKind) {
      car3d.scene.remove(car3d.model);
      var built = vehicleBuilder(state.vehicleKind)(state.vehicleColor);
      built.group.scale.setScalar(CAR_LENGTH_PX / built.lengthM);
      car3d.model = built.group;
      car3d.paint = built.paint;
      car3d.kind = state.vehicleKind;
      car3d.scene.add(car3d.model);
    }
    renderCar();
  }

  function buildCar(color) {
    var car = new THREE.Group();
    var paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), metalness: 0.25, roughness: 0.35 });
    var trim = new THREE.MeshStandardMaterial({ color: 0x11161d, metalness: 0.35, roughness: 0.55 });
    var glass = new THREE.MeshStandardMaterial({ color: 0x0a141d, metalness: 0.75, roughness: 0.18, side: THREE.DoubleSide });
    var rubber = new THREE.MeshStandardMaterial({ color: 0x080a0d, roughness: 0.95 });
    var rim = new THREE.MeshStandardMaterial({ color: 0x95a1b4, metalness: 0.85, roughness: 0.3 });
    var headlight = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe9b0, emissiveIntensity: 1.8, roughness: 0.25 });
    var taillight = new THREE.MeshStandardMaterial({ color: 0xff3040, emissive: 0xff2233, emissiveIntensity: 1.2, roughness: 0.3 });

    var shape = new THREE.Shape();
    shape.moveTo(-2.05, 0.28);
    shape.lineTo(-2.1, 0.62);
    shape.lineTo(-2.02, 0.94);
    shape.lineTo(-1.55, 1.02);
    shape.lineTo(-1.15, 1.38);
    shape.lineTo(0.35, 1.42);
    shape.lineTo(0.95, 1.08);
    shape.lineTo(1.7, 0.98);
    shape.lineTo(2.08, 0.78);
    shape.lineTo(2.1, 0.45);
    shape.lineTo(2.02, 0.28);
    shape.lineTo(-2.05, 0.28);

    var bodyGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: 1.72,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.06,
      bevelSegments: 2,
      curveSegments: 1
    });
    bodyGeometry.translate(0, 0, -0.86);
    car.add(new THREE.Mesh(bodyGeometry, paint));

    var windowShape = new THREE.Shape();
    windowShape.moveTo(-1.02, 1.0);
    windowShape.lineTo(-0.86, 1.31);
    windowShape.lineTo(0.18, 1.34);
    windowShape.lineTo(0.72, 1.03);
    windowShape.lineTo(-1.02, 1.0);
    var windowGeometry = new THREE.ShapeGeometry(windowShape);
    var leftWindow = new THREE.Mesh(windowGeometry, glass);
    leftWindow.position.z = 0.94;
    car.add(leftWindow);
    var rightWindow = new THREE.Mesh(windowGeometry, glass);
    rightWindow.position.z = -0.94;
    car.add(rightWindow);

    var windshield = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.52, 1.46), glass);
    windshield.position.set(0.68, 1.2, 0);
    windshield.rotation.z = -0.62;
    car.add(windshield);
    var rearWindow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.46, 1.4), glass);
    rearWindow.position.set(-1.24, 1.18, 0);
    rearWindow.rotation.z = 0.62;
    car.add(rearWindow);

    var mirrorGeometry = new THREE.BoxGeometry(0.18, 0.1, 0.14);
    [0.98, -0.98].forEach(function (z) {
      var mirror = new THREE.Mesh(mirrorGeometry, trim);
      mirror.position.set(0.62, 1.05, z);
      car.add(mirror);
    });

    var wheelGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18);
    wheelGeometry.rotateX(Math.PI / 2);
    var hubGeometry = new THREE.CylinderGeometry(0.17, 0.17, 0.25, 12);
    hubGeometry.rotateX(Math.PI / 2);
    [[-1.35, 0.92], [-1.35, -0.92], [1.35, 0.92], [1.35, -0.92]].forEach(function (position) {
      var wheel = new THREE.Mesh(wheelGeometry, rubber);
      wheel.position.set(position[0], 0.34, position[1]);
      car.add(wheel);
      var hub = new THREE.Mesh(hubGeometry, rim);
      hub.position.set(position[0], 0.34, position[1]);
      car.add(hub);
    });

    var headlightGeometry = new THREE.BoxGeometry(0.08, 0.16, 0.38);
    [0.5, -0.5].forEach(function (z) {
      var light = new THREE.Mesh(headlightGeometry, headlight);
      light.position.set(2.04, 0.82, z);
      car.add(light);
      var tail = new THREE.Mesh(headlightGeometry, taillight);
      tail.position.set(-2.04, 0.84, z);
      car.add(tail);
    });

    var grille = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.74), trim);
    grille.position.set(2.08, 0.58, 0);
    car.add(grille);
    var plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.12, 0.36),
      new THREE.MeshStandardMaterial({ color: 0xe8edf4, roughness: 0.5 })
    );
    plate.position.set(2.1, 0.44, 0);
    car.add(plate);

    var shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.36, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(2.3, 1.1, 1);
    shadow.position.y = 0.02;
    car.add(shadow);

    car.traverse(function (object) {
      if (!object.material) return;
      var materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(function (material) {
        material.side = THREE.DoubleSide;
      });
    });

    return { group: car, paint: paint, lengthM: 4.2 };
  }

  function buildMotorcycle(color) {
    var group = new THREE.Group();
    var paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), metalness: 0.25, roughness: 0.35 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 0.6 });
    var chrome = new THREE.MeshStandardMaterial({ color: 0x9aa6b8, metalness: 0.7, roughness: 0.3 });
    var lightMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe9b0, emissiveIntensity: 1.6, roughness: 0.3 });
    var tailMat = new THREE.MeshStandardMaterial({ color: 0xff3040, emissive: 0xff2233, emissiveIntensity: 1.1, roughness: 0.3 });

    var wheelGeometry = new THREE.CylinderGeometry(0.33, 0.33, 0.14, 16);
    wheelGeometry.rotateX(Math.PI / 2);
    var frontWheel = new THREE.Mesh(wheelGeometry, dark);
    frontWheel.position.set(0.75, 0.33, 0);
    group.add(frontWheel);
    var rearWheel = new THREE.Mesh(wheelGeometry, dark);
    rearWheel.position.set(-0.75, 0.33, 0);
    group.add(rearWheel);

    var body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 0.34), paint);
    body.position.set(0, 0.75, 0);
    group.add(body);
    var tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.36), paint);
    tank.position.set(0.2, 1.02, 0);
    group.add(tank);
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), dark);
    seat.position.set(-0.4, 1.0, 0);
    group.add(seat);
    var fork = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.6, 0.09), chrome);
    fork.position.set(0.72, 0.62, 0);
    group.add(fork);
    var handlebar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.72), chrome);
    handlebar.position.set(0.58, 1.08, 0);
    group.add(handlebar);
    var headlight = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.15, 0.18), lightMat);
    headlight.position.set(0.86, 0.9, 0);
    group.add(headlight);
    var taillight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.2), tailMat);
    taillight.position.set(-1.02, 0.82, 0);
    group.add(taillight);

    var shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1.05, 0.5, 1);
    shadow.position.y = 0.02;
    group.add(shadow);

    group.traverse(function (object) {
      if (!object.material) return;
      var materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(function (material) {
        material.side = THREE.DoubleSide;
      });
    });

    return { group: group, paint: paint, lengthM: 2.1 };
  }

  function buildTruck(color) {
    var group = new THREE.Group();
    var paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), metalness: 0.25, roughness: 0.35 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 0.6 });
    var glass = new THREE.MeshStandardMaterial({ color: 0x0a141d, metalness: 0.75, roughness: 0.18, side: THREE.DoubleSide });
    var cargo = new THREE.MeshStandardMaterial({ color: 0xd8dee6, roughness: 0.55 });
    var lightMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe9b0, emissiveIntensity: 1.6, roughness: 0.3 });
    var tailMat = new THREE.MeshStandardMaterial({ color: 0xff3040, emissive: 0xff2233, emissiveIntensity: 1.1, roughness: 0.3 });

    var chassis = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.3, 2.0), dark);
    chassis.position.set(0, 0.55, 0);
    group.add(chassis);
    var cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.9, 2.1), paint);
    cab.position.set(2.4, 1.6, 0);
    group.add(cab);
    var windshield = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 1.8), glass);
    windshield.position.set(3.26, 1.95, 0);
    group.add(windshield);
    var cargoBox = new THREE.Mesh(new THREE.BoxGeometry(4.3, 2.2, 2.2), cargo);
    cargoBox.position.set(-0.9, 1.8, 0);
    group.add(cargoBox);

    var wheelGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 18);
    wheelGeometry.rotateX(Math.PI / 2);
    [[2.4, 0.95], [2.4, -0.95], [-1.6, 0.95], [-1.6, -0.95], [-2.8, 0.95], [-2.8, -0.95]].forEach(function (position) {
      var wheel = new THREE.Mesh(wheelGeometry, dark);
      wheel.position.set(position[0], 0.5, position[1]);
      group.add(wheel);
    });

    var lightGeometry = new THREE.BoxGeometry(0.08, 0.16, 0.38);
    [0.8, -0.8].forEach(function (z) {
      var head = new THREE.Mesh(lightGeometry, lightMat);
      head.position.set(3.3, 0.75, z);
      group.add(head);
      var tail = new THREE.Mesh(lightGeometry, tailMat);
      tail.position.set(-3.06, 0.75, z);
      group.add(tail);
    });

    var shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.36, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(3.4, 1.15, 1);
    shadow.position.y = 0.02;
    group.add(shadow);

    group.traverse(function (object) {
      if (!object.material) return;
      var materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(function (material) {
        material.side = THREE.DoubleSide;
      });
    });

    return { group: group, paint: paint, lengthM: 6.8 };
  }

  function sizeCar() {
    if (!car3d) return;
    var container = map.getContainer();
    car3d.width = container.clientWidth;
    car3d.height = container.clientHeight;
    car3d.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    car3d.renderer.setSize(car3d.width, car3d.height, false);
    car3d.camera.left = -car3d.width / 2;
    car3d.camera.right = car3d.width / 2;
    car3d.camera.top = car3d.height / 2;
    car3d.camera.bottom = -car3d.height / 2;
    car3d.camera.updateProjectionMatrix();
  }

  function createCar3D() {
    var canvas = document.createElement('canvas');
    canvas.id = 'caravana-car';
    canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1;display:none';
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    map.getContainer().appendChild(canvas);
    var scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    var sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.6, 1, 0.4);
    scene.add(sun);
    var built = vehicleBuilder(state.vehicleKind)(state.vehicleColor);
    built.group.scale.setScalar(CAR_LENGTH_PX / built.lengthM);
    built.group.traverse(function (object) {
      object.frustumCulled = false;
    });
    scene.add(built.group);
    car3d = {
      canvas: canvas,
      renderer: renderer,
      scene: scene,
      camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000),
      model: built.group,
      paint: built.paint,
      kind: state.vehicleKind,
      width: 0,
      height: 0
    };
    sizeCar();
  }

  function aheadLngLat(location, heading, meters) {
    var radians = heading * Math.PI / 180;
    var latitude = location.latitude;
    return [
      location.longitude + meters * Math.sin(radians) / (111320 * Math.cos(latitude * Math.PI / 180)),
      latitude + meters * Math.cos(radians) / 111320
    ];
  }

  // Dibujamos el coche en su propio canvas con la misma cámara inclinada que el mapa.
  // La posición sale de map.project() y el giro, de un punto 20 m por delante del coche.
  function renderCar() {
    if (!car3d || !mapReady) return;
    try {
    var container = map.getContainer();
    if (container.clientWidth !== car3d.width || container.clientHeight !== car3d.height) sizeCar();

    var located = Boolean(state.location);
    car3d.canvas.style.display = located ? 'block' : 'none';
    if (vehicleMarker) {
      var element = vehicleMarker.getElement();
      element.classList.toggle('is-3d', located);
      // Con relieve e inclinación MapLibre puede colocar el marcador DOM en
      // posiciones raras; escondido no molesta.
      element.style.opacity = located ? '0' : '';
      element.style.display = located ? 'none' : '';
    }
    if (!located) return;

    var pitch = map.getPitch() * Math.PI / 180;
    var sinPitch = Math.sin(pitch);
    var cosPitch = Math.cos(pitch);
    var heading = state.heading !== null ? state.heading : map.getBearing();
    var anchor = map.project(lngLatOf(state.location));
    var ahead = map.project(aheadLngLat(state.location, heading, CAR_LOOKAHEAD_M));
    var onScreen = Math.atan2(ahead.x - anchor.x, anchor.y - ahead.y);
    var turn = Math.atan2(Math.sin(onScreen), Math.cos(onScreen) / cosPitch);
    var offsetX = anchor.x - car3d.width / 2;
    var offsetY = car3d.height / 2 - anchor.y;

    car3d.camera.up.set(0, sinPitch, -cosPitch);
    car3d.camera.position.set(0, CAMERA_DISTANCE * cosPitch, CAMERA_DISTANCE * sinPitch);
    car3d.camera.lookAt(0, 0, 0);
    car3d.model.position.set(offsetX, offsetY * sinPitch, -offsetY * cosPitch);
    car3d.model.rotation.y = Math.PI / 2 - turn;
    car3d.renderer.render(car3d.scene, car3d.camera);
    } catch (error) {
      if (!carRenderWarned) {
        carRenderWarned = true;
        console.warn('Caravana: no se pudo dibujar el coche 3D en este frame.', error);
      }
    }
  }

  async function initCar3D() {
    if (THREE || car3d) return;
    try {
      THREE = await import(THREE_MODULE_URL);
    } catch (error) {
      console.warn('Caravana: no se pudo cargar Three.js; se usa la flecha 2D.', error);
      return;
    }
    if (!mapReady || car3d) return;
    try {
      createCar3D();
      map.on('render', renderCar);
      document.body.setAttribute('data-car', '3d');
      renderCar();
    } catch (error) {
      console.warn('Caravana: no se pudo crear el coche 3D; se usa la flecha 2D.', error);
      if (car3d) car3d.canvas.remove();
      car3d = null;
      document.body.setAttribute('data-car', '2d');
    }
  }

  function addParking() {
    var element = document.createElement('div');
    element.className = 'parking';
    element.style.display = 'none';
    element.innerHTML =
      '<div class="parking-badge"><svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M4 16h16M6 16V9l2-4h8l2 4v7M6 16v3M18 16v3"></path>' +
      '<circle cx="8.5" cy="16" r="1.3"></circle><circle cx="15.5" cy="16" r="1.3"></circle>' +
      '</svg></div><div class="parking-label">Tu coche</div>';
    parkingMarker = new maplibregl.Marker({ element: element, anchor: 'bottom' });
  }

  function addParkingLine() {
    map.addSource('caravana-parking-line', { type: 'geojson', data: EMPTY_ROUTE });
    map.addLayer({
      id: 'caravana-parking-line',
      type: 'line',
      source: 'caravana-parking-line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#4de1ff',
        'line-width': 4,
        'line-dasharray': [2, 2],
        'line-opacity': 0.9
      }
    }, firstSymbolLayerId());
  }

  function parkingLabel(distance) {
    if (distance == null) return 'Tu coche';
    return distance < 1000
      ? 'Tu coche · ' + Math.round(distance) + ' m'
      : 'Tu coche · ' + (distance / 1000).toFixed(1) + ' km';
  }

  function updateParkingLine() {
    if (!mapReady || !parkingMarker || !map.getSource('caravana-parking-line')) return;
    if (!state.parking) {
      parkingMarker.getElement().style.display = 'none';
      map.getSource('caravana-parking-line').setData(EMPTY_ROUTE);
      return;
    }
    parkingMarker.getElement().style.display = '';
    var distance = state.location
      ? haversineLngLat(lngLatOf(state.location), lngLatOf(state.parking))
      : null;
    var label = parkingMarker.getElement().querySelector('.parking-label');
    if (label) label.textContent = parkingLabel(distance);
    var data = EMPTY_ROUTE;
    if (state.location && distance != null && distance > 40) {
      data = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [lngLatOf(state.location), lngLatOf(state.parking)]
          }
        }]
      };
    }
    map.getSource('caravana-parking-line').setData(data);
  }

  function setParking(parking) {
    state.parking = parking
      ? { latitude: parking.latitude, longitude: parking.longitude }
      : null;
    if (!mapReady) return;
    if (!parkingMarker) addParking();
    if (state.parking) parkingMarker.setLngLat(lngLatOf(state.parking)).addTo(map);
    updateParkingLine();
  }

  function addDestination() {
    var element = document.createElement('div');
    element.className = 'dest';
    element.innerHTML =
      '<div class="dest-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4"></path><path d="M5 4h12l-2.5 4L17 12H5"></path></svg></div>' +
      '<div class="dest-label"></div>';
    destinationLabel = element.querySelector('.dest-label');
    destinationMarker = new maplibregl.Marker({ element: element });
  }

  // Cámara de persecución: el coche queda abajo en pantalla y se ve hacia
  // adelante, como una cámara 360 montada detrás del vehículo.
  function applyViewPadding() {
    var container = map.getContainer();
    var height = container.clientHeight || 800;
    map.setPadding({
      top: Math.round(height * 0.55),
      bottom: Math.round(height * 0.1),
      left: 0,
      right: 0
    });
  }

  function onLoad() {
    mapReady = true;
    document.body.setAttribute('data-ready', 'true');
    applyViewPadding();
    map.on('resize', applyViewPadding);
    map.setPitch(pitchFor(state.mode));
    addTerrain();
    addBuildings();
    addRoute();
    addGuideLayer();
    addBrakeLayer();
    addVehicle();
    addDestination();
    addParking();
    addParkingLine();
    setMembers(state.members);
    setDestination(state.destination);
    setRoute(state.route);
    setParking(state.parking);
    if (state.location) {
      vehicleMarker.setLngLat(lngLatOf(state.location));
      if (state.heading !== null) vehicleMarker.setRotation(state.heading);
      if (state.following) follow(false, true);
    }
    post({ type: 'ready' });
    void initCar3D();
  }

  function webglAvailable() {
    try {
      var canvas = document.createElement('canvas');
      return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch (error) {
      return false;
    }
  }

  function createMap() {
    if (typeof maplibregl === 'undefined') {
      fail('No pudimos cargar el motor del mapa 3D. Revisa tu conexión.');
      return;
    }
    if (!webglAvailable()) {
      fail('Este dispositivo no soporta mapas 3D (WebGL).');
      return;
    }
    map = new maplibregl.Map({
      container: 'map',
      style: STYLE_URL,
      center: state.location ? lngLatOf(state.location) : DEFAULT_CENTER,
      zoom: 16,
      pitch: pitchFor(state.mode),
      bearing: 0,
      maxPitch: 70,
      attributionControl: false
    });
    window.caravanaMap = map;
    map.on('styleimagemissing', function (event) {
      if (!map.hasImage(event.id)) map.addImage(event.id, { width: 1, height: 1, data: new Uint8Array(4) });
    });
    map.on('load', onLoad);
    map.on('sourcedata', function (event) {
      if (mapReady && event.sourceId === 'caravana-terrain') refreshMarkers();
    });
    map.on('error', function (event) {
      if (!mapReady && !event.sourceId) fail('No pudimos cargar el mapa. Revisa tu conexión.');
    });
    map.on('dragstart', function (event) {
      if (event.originalEvent) setFollowing(false);
    });
    map.on('rotatestart', function (event) {
      if (event.originalEvent) setFollowing(false);
    });
    map.on('pitchstart', function (event) {
      if (event.originalEvent) setFollowing(false);
    });
    setTimeout(function () {
      if (!mapReady) fail('El mapa tarda demasiado en cargar. Revisa tu conexión.');
    }, LOAD_TIMEOUT_MS);
  }

  document.body.setAttribute('data-follow', 'on');
  document.body.setAttribute('data-mode', state.mode);
  document.body.setAttribute('data-car', '2d');
  window.addEventListener('message', handleMessage);
  document.addEventListener('message', handleMessage);
  createMap();
})();
</script>
</body>
</html>`;
