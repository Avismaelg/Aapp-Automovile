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
  source: 'graphhopper' | 'fallback';
};

export type WorldMapMode = '2d' | '3d';

export type WorldMapCommand =
  | { type: 'location'; payload: WorldMapLocation }
  | { type: 'members'; payload: WorldMapMember[] }
  | { type: 'destination'; payload: WorldMapDestination | null }
  | { type: 'route'; payload: WorldMapRoute | null }
  | { type: 'mode'; payload: WorldMapMode }
  | { type: 'recenter' };

export type WorldMapEvent =
  | { type: 'ready' }
  | { type: 'follow'; value: boolean }
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

  const event = data as { type?: unknown; value?: unknown; message?: unknown };
  if (event.type === 'ready') return { type: 'ready' };
  if (event.type === 'follow' && typeof event.value === 'boolean') {
    return { type: 'follow', value: event.value };
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
  .vehicle, .member, .dest { pointer-events: none; }
  .vehicle { position: relative; width: 64px; height: 64px; }
  .vehicle-halo {
    position: absolute; left: 14px; top: 14px; width: 36px; height: 36px; border-radius: 50%;
    background: rgba(255,90,31,0.45); animation: halo 2s ease-out infinite;
  }
  .vehicle-arrow { position: absolute; left: 0; top: 0; width: 64px; height: 64px; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.55)); }
  .vehicle-arrow path { fill: #ff5a1f; stroke: #ffffff; stroke-width: 4; stroke-linejoin: round; }
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
    0% { transform: scale(0.8); opacity: 0.9; }
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
  var CRUISE_PITCH = 60;
  var FOLLOW_ZOOM = 16.5;
  var MOVING_KMH = 5;
  var LOAD_TIMEOUT_MS = 25000;
  var VIEW_PADDING = { top: 90, bottom: 220, left: 0, right: 0 };
  var EMPTY_ROUTE = { type: 'FeatureCollection', features: [] };

  var state = {
    location: null,
    members: [],
    destination: null,
    route: null,
    mode: '3d',
    following: true,
    heading: null
  };
  var map = null;
  var mapReady = false;
  var errorSent = false;
  var lastSeq = 0;
  var vehicleMarker = null;
  var destinationMarker = null;
  var destinationLabel = null;
  var memberMarkers = new Map();

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
    var options = {
      center: lngLatOf(state.location),
      pitch: pitchFor(state.mode),
      bearing: state.heading !== null ? state.heading : map.getBearing(),
      duration: animate ? 900 : 0,
      essential: true
    };
    if (zoomIn) options.zoom = FOLLOW_ZOOM;
    map.easeTo(options);
  }

  function setLocation(location) {
    if (!location) return;
    state.location = location;
    var moving = typeof location.speedKmh !== 'number' || location.speedKmh >= MOVING_KMH;
    if (typeof location.heading === 'number' && location.heading >= 0 && moving) {
      state.heading = location.heading;
    }
    if (!mapReady) return;
    vehicleMarker.setLngLat(lngLatOf(location));
    if (state.heading !== null) vehicleMarker.setRotation(state.heading);
    if (state.following) follow(true, false);
  }

  function buildMemberElement(member) {
    var element = document.createElement('div');
    element.className = 'member';
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
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
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

  function addDestination() {
    var element = document.createElement('div');
    element.className = 'dest';
    element.innerHTML =
      '<div class="dest-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4"></path><path d="M5 4h12l-2.5 4L17 12H5"></path></svg></div>' +
      '<div class="dest-label"></div>';
    destinationLabel = element.querySelector('.dest-label');
    destinationMarker = new maplibregl.Marker({ element: element });
  }

  function onLoad() {
    mapReady = true;
    document.body.setAttribute('data-ready', 'true');
    map.setPadding(VIEW_PADDING);
    map.setPitch(pitchFor(state.mode));
    addTerrain();
    addBuildings();
    addRoute();
    addVehicle();
    addDestination();
    setMembers(state.members);
    setDestination(state.destination);
    setRoute(state.route);
    if (state.location) {
      vehicleMarker.setLngLat(lngLatOf(state.location));
      if (state.heading !== null) vehicleMarker.setRotation(state.heading);
      if (state.following) follow(false, true);
    }
    post({ type: 'ready' });
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
  window.addEventListener('message', handleMessage);
  document.addEventListener('message', handleMessage);
  createMap();
})();
</script>
</body>
</html>`;
