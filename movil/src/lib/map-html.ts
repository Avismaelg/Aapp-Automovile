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
};

export type WorldMapRoute = {
  coordinates: [number, number][];
  distanceM: number;
  timeMs: number;
  source: 'graphhopper' | 'fallback';
};

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function buildMapHtml({
  members,
  destination,
  initialLocation,
}: {
  members: WorldMapMember[];
  destination?: WorldMapDestination | null;
  initialLocation: WorldMapLocation;
}) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; background: #080b0f; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
  #map { height: 100%; width: 100%; background: #0b1118; }
  .leaflet-container { background: #0b1118; font-family: inherit; }
  .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.72) contrast(0.92) saturate(0.65); }
  .leaflet-control-zoom { border: 1px solid rgba(255,255,255,0.12) !important; border-radius: 12px !important; overflow: hidden; }
  .leaflet-control-zoom a { background: rgba(12,17,23,0.92) !important; color: #f3f6fa !important; border-color: rgba(255,255,255,0.08) !important; }
  .leaflet-control-zoom a:hover { background: rgba(255,90,31,0.9) !important; }
  .leaflet-control-attribution { background: rgba(6,8,11,0.75) !important; color: #5a6577 !important; font-size: 9px !important; border-radius: 6px 0 0 0; }
  .leaflet-control-attribution a { color: #8792a4 !important; }
  .leaflet-popup-content-wrapper, .leaflet-popup-tip { background: #10151b; color: #f3f6fa; border: 1px solid #232c38; }
  .leaflet-popup-content { margin: 9px 12px; font-size: 12px; }
  .member-wrap, .user-wrap, .dest-wrap { position: relative; width: 44px; height: 44px; }
  .member-dot {
    width: 38px; height: 38px; margin: 3px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #071016; font-weight: 800; font-size: 11px; letter-spacing: -0.3px;
    border: 2px solid rgba(6,8,11,0.9);
    box-shadow: 0 4px 14px rgba(0,0,0,0.45);
  }
  .member-dot.talking { animation: pulse-ring 1.4s ease-out infinite; }
  .member-name {
    position: absolute; top: 42px; left: 50%; transform: translateX(-50%);
    color: #e8edf4; font-size: 9px; font-weight: 700; white-space: nowrap;
    background: rgba(6,8,11,0.72); border: 1px solid rgba(255,255,255,0.1);
    padding: 2px 5px; border-radius: 5px;
  }
  .user-dot {
    position: absolute; left: 14px; top: 14px; width: 16px; height: 16px;
    border-radius: 50%; background: #ff5a1f; border: 3px solid #0b0f14;
    box-shadow: 0 0 0 2px rgba(255,90,31,0.9), 0 0 22px rgba(255,90,31,0.65);
    z-index: 3;
  }
  .user-pulse {
    position: absolute; left: 3px; top: 3px; width: 38px; height: 38px;
    border-radius: 50%; background: rgba(255,90,31,0.18);
    border: 1px solid rgba(255,90,31,0.45);
    animation: user-pulse 1.8s ease-out infinite;
  }
  .user-label {
    position: absolute; top: 40px; left: 50%; transform: translateX(-50%);
    color: #120802; background: #ff5a1f; font-size: 9px; font-weight: 800;
    padding: 2px 6px; border-radius: 5px; white-space: nowrap;
  }
  .dest-icon {
    width: 34px; height: 34px; margin: 5px; border-radius: 11px;
    background: #c9ff4d; color: #101603; border: 2px solid #0b0f14;
    display: flex; align-items: center; justify-content: center;
    font-size: 17px; box-shadow: 0 4px 14px rgba(0,0,0,0.45);
  }
  .dest-label {
    position: absolute; top: 42px; left: 50%; transform: translateX(-50%);
    color: #101603; background: #c9ff4d; font-size: 9px; font-weight: 800;
    padding: 2px 6px; border-radius: 5px; white-space: nowrap;
  }
  @keyframes user-pulse {
    0% { transform: scale(0.7); opacity: 0.9; }
    100% { transform: scale(1.7); opacity: 0; }
  }
  @keyframes pulse-ring {
    0% { box-shadow: 0 0 0 0 rgba(255,90,31,0.5); }
    100% { box-shadow: 0 0 0 12px rgba(255,90,31,0); }
  }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  const MEMBERS = ${safeJson(members)};
  const DESTINATION = ${safeJson(destination ?? null)};
  let user = ${safeJson(initialLocation)};
  let map = null;
  let userMarker = null;
  let accuracyCircle = null;
  let routeLayers = [];
  let routeData = null;
  let centered = false;

  const initials = (name) => name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  function updateUserMarker() {
    if (!map) return;
    const latlng = [user.latitude, user.longitude];
    if (!userMarker) {
      const icon = L.divIcon({
        className: '',
        html: '<div class="user-wrap"><div class="user-pulse"></div><div class="user-dot"></div><div class="user-label">Tú</div></div>',
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      userMarker = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(map);
      userMarker.bindPopup('Tu ubicación en vivo');
    } else {
      userMarker.setLatLng(latlng);
    }

    if (user.accuracy && user.accuracy > 0) {
      if (!accuracyCircle) {
        accuracyCircle = L.circle(latlng, {
          radius: user.accuracy,
          color: '#FF5A1F',
          weight: 1,
          fillColor: '#FF5A1F',
          fillOpacity: 0.08,
        }).addTo(map);
      } else {
        accuracyCircle.setLatLng(latlng).setRadius(user.accuracy);
      }
    }

    if (!routeData) drawRoute();
  }

  function drawRoute() {
    if (!map || !DESTINATION) return;

    routeLayers.forEach((layer) => map.removeLayer(layer));
    routeLayers = [];

    const coordinates = routeData?.coordinates?.length
      ? routeData.coordinates
      : [[user.latitude, user.longitude], [DESTINATION.latitude, DESTINATION.longitude]];
    const fallback =
      !routeData?.coordinates?.length || routeData.source === 'fallback';

    const casing = L.polyline(coordinates, {
      color: '#0B0F14',
      weight: 8,
      opacity: 0.65,
      lineCap: 'round',
    }).addTo(map);

    const line = L.polyline(coordinates, {
      color: '#FF5A1F',
      weight: 4,
      opacity: 0.92,
      dashArray: fallback ? '8 8' : undefined,
      lineCap: 'round',
    }).addTo(map);

    routeLayers = [casing, line];
  }

  function drawDestination() {
    if (!map || !DESTINATION) return;
    const destIcon = L.divIcon({
      className: '',
      html: '<div class="dest-wrap"><div class="dest-icon">⚑</div><div class="dest-label">' + DESTINATION.label + '</div></div>',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
    L.marker([DESTINATION.latitude, DESTINATION.longitude], { icon: destIcon, zIndexOffset: 500 })
      .addTo(map)
      .bindPopup('Destino: ' + DESTINATION.label);
  }

  function drawMembers() {
    if (!map) return;
    MEMBERS.forEach((member) => {
      const talking = member.isTalking ? ' talking' : '';
      const icon = L.divIcon({
        className: '',
        html:
          '<div class="member-wrap"><div class="member-dot' + talking + '" style="background:' + member.color + '">' +
          initials(member.name) +
          '</div><div class="member-name">' + member.name.split(' ')[0] + '</div></div>',
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      L.marker([member.latitude, member.longitude], { icon, zIndexOffset: 300 })
        .addTo(map)
        .bindPopup(member.name + ' · party en vivo');
    });
  }

  function fitToCrew() {
    if (!map || centered) return;
    const points = [[user.latitude, user.longitude]];
    MEMBERS.forEach((member) => points.push([member.latitude, member.longitude]));
    if (DESTINATION) points.push([DESTINATION.latitude, DESTINATION.longitude]);
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 13 });
    } else {
      map.setView(points[0], 14);
    }
    centered = true;
  }

  function handleMessage(event) {
    let payload = event.data;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch { return; }
    }
    if (!payload || typeof payload !== 'object') return;

    if (payload.type === 'location') {
      const firstGps = payload.source === 'gps' && user.source !== 'gps';
      user = { ...user, ...payload };
      updateUserMarker();
      if (firstGps && map) {
        map.setView([user.latitude, user.longitude], 14, { animate: true });
        centered = true;
      }
    }

    if (payload.type === 'route') {
      routeData = payload.route ?? null;
      drawRoute();
    }

    if (payload.type === 'recenter' && map) {
      map.setView([user.latitude, user.longitude], 16, { animate: true });
    }
  }

  function initMap() {
    if (!window.L) {
      setTimeout(initMap, 80);
      return;
    }
    map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    drawMembers();
    drawDestination();
    drawRoute();
    updateUserMarker();
    fitToCrew();

    window.parent?.postMessage({ type: 'map-ready' }, '*');
  }

  window.addEventListener('message', handleMessage);
  document.addEventListener('message', handleMessage);
  initMap();
</script>
</body>
</html>`;
}
