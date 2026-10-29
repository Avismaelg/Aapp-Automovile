import { MAP_STYLE_URL } from '@/src/lib/map/config';

// Estado del mapa, cámara, seguimiento, ruta, guía y asistencia de frenado.
// Se concatena con los demás fragmentos dentro de la misma IIFE.
export const MAP_SCRIPT_CORE = `(function () {
  // Rendimiento: el WebView renderiza a la resolución física del panel
  // (≈2.8x en la mayoría de teléfonos). El modo 2D es el arranque ligero y
  // el modo 3D se activa bajo demanda.
  window.devicePixelRatio = Math.min(window.devicePixelRatio || 1, 1.0);

  var STYLE_URL = '${MAP_STYLE_URL}';
  var FALLBACK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
  var styleFallbackAttempted = false;
  var DEFAULT_CENTER = [-69.9312, 18.4861];
  var MAP_PIXEL_RATIO = 1.0;
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
    mode: '2d',
    following: true,
    heading: null,
    vehicleColor: '#ff5a1f',
    vehicleKind: 'car',
    parking: null,
    travelMode: 'car',
    northUp: false
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
  var personMarker = null;
  var lastFollow = null;
  var smoothedHeading = null;
  var carRenderWarned = false;
  var accuracyValue = null;
  var accuracyUpdatedAt = 0;
  var parkingLineAt = 0;
  var lastCarKey = '';
  var lastRouteProgressIndex = -1;
  // El canvas del vehículo usa una resolución moderada para no competir con
  // el mapa por la GPU del teléfono.
  var caravanaPerfScale = 1;

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
    if (state.travelMode === 'walking') return 45;
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
    var walking = state.travelMode === 'walking';
    var bearing = state.northUp
      ? 0
      : state.heading !== null
        ? state.heading
        : map.getBearing();
    var center = lngLatOf(point);
    var moving = !walking && typeof point.speedKmh === 'number' && point.speedKmh >= MOVING_KMH;

    // Movimiento continuo: en vez de saltar a cada señal GPS, proyectamos a
    // donde estará el coche y la cámara desliza hasta ese punto.
    if (moving) {
      var meters = (point.speedKmh / 3.6) * 2.2;
      center = aheadLngLat(point, bearing, meters);
    }

    if (lastFollow && !zoomIn) {
      var moved = haversineLngLat(lastFollow.center, center);
      var turned = Math.abs(((bearing - lastFollow.bearing + 540) % 360) - 180);
      var minMove = walking ? 3 : 8;
      var minTurn = walking ? 4 : 6;
      if (moved < minMove && turned < minTurn) return;
    }
    lastFollow = { center: center, bearing: bearing };

    var targetZoom = walking ? FOLLOW_ZOOM + 0.5 : FOLLOW_ZOOM;

    // Failsafe: si la cámara está lejos (arranque, vuelta de segundo plano o
    // una animación cancelada), saltamos directamente a tu posición.
    var mapCenter = map.getCenter();
    var offCenter = haversineLngLat([mapCenter.lng, mapCenter.lat], center);
    if (offCenter > 800) {
      map.jumpTo({
        center: center,
        zoom: targetZoom,
        pitch: pitchFor(state.mode),
        bearing: bearing
      });
      return;
    }

    var options = {
      center: center,
      pitch: pitchFor(state.mode),
      bearing: bearing,
       // La señal GPS llega cada pocos segundos; una animación de 1.9 s se
       // solapaba con la siguiente y producía sensación de mapa pesado.
       duration: animate ? (moving ? 850 : 450) : 0,
      essential: true
    };
    if (moving) options.easing = function (t) { return t; };
    if (zoomIn || map.getZoom() < targetZoom - 0.5) options.zoom = targetZoom;
    map.easeTo(options);
  }

  function setLocation(location) {
    if (!location) return;
    var firstFix = !state.location;
    if (firstFix) {
      // Al abrir la app o recargar el mapa, la primera posición siempre
      // reengancha el seguimiento: la cámara nunca se queda en el centro por
      // defecto (Kennedy) aunque antes se hubiera soltado.
      setFollowing(true);
    }
    state.location = location;
    var moving = typeof location.speedKmh !== 'number' || location.speedKmh >= MOVING_KMH;
    if (typeof location.heading === 'number' && location.heading >= 0) {
      // Filtro simple: el GPS y la brújula tiemblan; la cámara no debe bailar.
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
    updateAccuracy(location);
    if (personMarker && state.travelMode === 'walking') {
      personMarker.setLngLat(lngLatOf(location));
    }
    renderCar();
    updateRouteProgress(false);
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
    var hadRoute = routePoints.length > 1;
    state.route = route || null;
    if (!mapReady) return;
    var points = state.route && state.route.coordinates ? state.route.coordinates : [];
    routePoints = points.map(function (point) { return [point[1], point[0]]; });
    lastRouteProgressIndex = -1;
    updateRouteProgress(true);
    updateGuide();
    if (!hadRoute && routePoints.length > 1) focusRoute();
  }

  function routeDataForProgress(splitIndex) {
    if (!state.route || routePoints.length < 2) return EMPTY_ROUTE;

    var split = Math.max(0, Math.min(routePoints.length - 1, splitIndex));
    var features = [];
    var past = routePoints.slice(0, split + 1);
    var future = routePoints.slice(split);
    var kind = state.route.source;

    if (past.length > 1) {
      features.push({
        type: 'Feature',
        properties: { kind: kind, segment: 'past' },
        geometry: { type: 'LineString', coordinates: past }
      });
    }
    if (future.length > 1) {
      features.push({
        type: 'Feature',
        properties: { kind: kind, segment: 'future' },
        geometry: { type: 'LineString', coordinates: future }
      });
    }
    return { type: 'FeatureCollection', features: features };
  }

  function updateRouteProgress(force) {
    if (!mapReady || !map.getSource('caravana-route')) return;
    if (!state.route || routePoints.length < 2) {
      lastRouteProgressIndex = -1;
      map.getSource('caravana-route').setData(EMPTY_ROUTE);
      return;
    }

    var split = state.location ? nearestRouteIndex(lngLatOf(state.location)) : 0;
    if (!force && split === lastRouteProgressIndex) return;
    lastRouteProgressIndex = split;
    map.getSource('caravana-route').setData(routeDataForProgress(split));
  }

  // Reencuadre corto: el coche queda en el centro y el tramo inmediato de la
  // ruta ocupa la vista, en lugar de mostrar la ruta completa diminuta.
  function focusRoute() {
    if (!mapReady || !state.location) return;
    var center = lngLatOf(state.location);
    var bearing = state.northUp
      ? 0
      : state.heading !== null
        ? state.heading
        : map.getBearing();
    lastFollow = { center: center, bearing: bearing };
    map.easeTo({
      center: center,
      zoom: Math.max(17.5, map.getZoom()),
      pitch: pitchFor(state.mode),
      bearing: bearing,
      duration: 650,
      essential: true
    });
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
    renderCar();
    map.easeTo({ pitch: pitchFor(state.mode), duration: 700, essential: true });
  }

  function recenter() {
    setFollowing(true);
    follow(true, true);
  }

  function handleMessage(event) {
    var message = parse(event.data);
    if (!message) return;
    try {
      if (typeof message.seq !== 'number' || message.seq === lastSeq) return;
      lastSeq = message.seq;
      if (message.type === 'location') setLocation(message.payload);
      else if (message.type === 'members') setMembers(message.payload);
      else if (message.type === 'destination') setDestination(message.payload);
      else if (message.type === 'route') setRoute(message.payload);
      else if (message.type === 'mode') setMode(message.payload);
      else if (message.type === 'vehicle') setVehicleInput(message.payload);
      else if (message.type === 'parking') setParking(message.payload);
      else if (message.type === 'travel') setTravelMode(message.payload);
      else if (message.type === 'north') setNorthUp(message.payload);
      else if (message.type === 'fit') fitRoute(message.payload && message.payload.coordinates);
      else if (message.type === 'autofollow') setAutoFollow(message.payload);
      else if (message.type === 'recenter') recenter();
    } catch (error) {
      fail('Mapa: ' + (error && error.message ? error.message : String(error)));
    }
  }

  function addRoute() {
    map.addSource('caravana-route', { type: 'geojson', data: EMPTY_ROUTE });
    var before = firstSymbolLayerId();
    map.addLayer({
      id: 'caravana-route-casing',
      type: 'line',
      source: 'caravana-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['==', ['get', 'segment'], 'past'], '#101820', '#061008'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 7, 14, 11, 16, 15, 18, 22],
        'line-opacity': ['case', ['==', ['get', 'segment'], 'past'], 0.55, 0.96]
      }
    }, before);
    map.addLayer({
      id: 'caravana-route-line',
      type: 'line',
      source: 'caravana-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['==', ['get', 'segment'], 'past'], '#596778', '#baff3f'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 5, 14, 8, 16, 12, 18, 17]
      }
    }, before);
    // Brillo interior: da volumen a la cinta, como la ruta de Waze.
    map.addLayer({
      id: 'caravana-route-core',
      type: 'line',
      source: 'caravana-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['==', ['get', 'segment'], 'past'], '#9aa7b8', '#f2ffc1'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 14, 2, 16, 3, 18, 4],
        'line-opacity': ['case', ['==', ['get', 'segment'], 'past'], 0.35, 0.95]
      }
    }, before);
    addRouteArrows(before);
  }

  function createRouteArrowIcon() {
    var size = 36;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var context = canvas.getContext('2d');
    context.strokeStyle = 'rgba(240,248,255,0.92)';
    context.lineWidth = size * 0.16;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(size * 0.28, size * 0.58);
    context.lineTo(size * 0.5, size * 0.34);
    context.lineTo(size * 0.72, size * 0.58);
    context.stroke();
    var image = context.getImageData(0, 0, size, size);
    map.addImage('caravana-route-arrow', {
      width: size,
      height: size,
      data: new Uint8Array(image.data.buffer)
    });
  }

  function addRouteArrows(before) {
    createRouteArrowIcon();
    map.addLayer({
      id: 'caravana-route-arrows',
      type: 'symbol',
      source: 'caravana-route',
      filter: ['==', ['get', 'segment'], 'future'],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 90,
        'icon-image': 'caravana-route-arrow',
        'icon-size': 0.75,
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    }, before);
  }

  // Estilo tipo Waze: menos ruido de etiquetas de negocios y calles más
  // legibles, con las arterias resaltadas sobre la base.
  function hideClutter() {
    var layers = map.getStyle().layers || [];
    for (var index = 0; index < layers.length; index += 1) {
      var layer = layers[index];
      if (layer.type !== 'symbol') continue;
      var sourceLayer = layer['source-layer'] || '';
       var keepPlaceLabel =
         layer.id === 'place_city' ||
         layer.id === 'place_city_large' ||
         layer.id === 'place_country_major' ||
         layer.id === 'highway_name_motorway';
       if (
         sourceLayer === 'poi' ||
         sourceLayer === 'housenumber' ||
         sourceLayer === 'transportation' ||
         (sourceLayer === 'transportation_name' && !keepPlaceLabel) ||
         (sourceLayer === 'place' && !keepPlaceLabel)
       ) {
        try {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        } catch (error) {
          // Si el estilo no permite ocultarla, se deja como está.
        }
      }
    }
  }

  function addRoadStyle() {
    var style = map.getStyle();
    var sources = style.sources || {};
    var sourceId = Object.keys(sources).filter(function (id) {
      return sources[id].type === 'vector';
    })[0];
    if (!sourceId) return;
    var before = firstSymbolLayerId();
    map.addLayer({
      id: 'caravana-arteries',
      type: 'line',
      source: sourceId,
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['primary', 'secondary', 'tertiary']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#4b5670',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 14, 3, 16, 6, 18, 11],
        'line-opacity': 0.95
      }
    }, before);
    map.addLayer({
      id: 'caravana-highways',
      type: 'line',
      source: sourceId,
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#5d6a86',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 14, 4, 16, 7.5, 18, 13],
        'line-opacity': 0.95
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
`;
