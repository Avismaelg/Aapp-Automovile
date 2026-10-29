import { MAP_FALLBACK_STYLES, MAP_STYLES } from '@/src/lib/map/config';

// Estado del mapa, cámara, seguimiento, ruta, alternativas y próxima maniobra.
// Se concatena con los demás fragmentos dentro de la misma IIFE.
export const MAP_SCRIPT_CORE = `(function () {
  // Nitidez frente a GPU: el panel suele ser ≈2.8x; a 1x el mapa se veía
  // borroso y a resolución completa cuesta el triple. 1.75x es el equilibrio.
  var MAP_PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 1.75);

  var STYLES = ${JSON.stringify(MAP_STYLES)};
  var FALLBACK_STYLES = ${JSON.stringify(MAP_FALLBACK_STYLES)};
  var styleFallbackAttempted = false;
  var DEFAULT_CENTER = [-69.9312, 18.4861];
  var MOVING_KMH = 5;
  var LOAD_TIMEOUT_MS = 25000;
  var EMPTY_ROUTE = { type: 'FeatureCollection', features: [] };
  // A menos de esta distancia de una maniobra la cámara se acerca.
  var MANEUVER_ZOOM_M = 250;

  var state = {
    location: null,
    members: [],
    destination: null,
    route: null,
    alternatives: [],
    following: true,
    heading: null,
    vehicleColor: '#ff5a1f',
    vehicleKind: 'car',
    parking: null,
    travelMode: 'car',
    northUp: false,
    // Hasta que la app mande el cálculo solar, una estimación por la hora local.
    theme: (function () {
      var hour = new Date().getHours();
      return hour >= 7 && hour < 19 ? 'day' : 'night';
    })()
  };
  // Tema del estilo cargado ahora; difiere de state.theme mientras se cambia.
  var loadedTheme = state.theme;
  var styleSwapping = false;
  var alternativeTapBound = false;
  var map = null;
  var mapReady = false;
  var errorSent = false;
  var lastSeq = 0;
  var vehicleMarker = null;
  var destinationMarker = null;
  var destinationLabel = null;
  var memberMarkers = new Map();
  var routePoints = [];
  var routeCumulative = [];
  var routeProgressM = null;
  var maneuverDistanceM = null;
  var parkingMarker = null;
  var personMarker = null;
  var lastFollow = null;
  var smoothedHeading = null;
  var accuracyValue = null;
  var accuracyUpdatedAt = 0;
  var parkingLineAt = 0;
  var lastRouteProgressIndex = -1;
  var routeProgressAt = 0;
  // Movimiento continuo: entre dos señales GPS el coche y la cámara se
  // interpolan fotograma a fotograma en vez de saltar.
  var shown = null;
  var motion = null;
  var motionFrame = 0;
  var lastFixAt = 0;
  var lastFrameAt = 0;

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

  // Capa del estilo base bajo la que van las nuestras: la primera etiqueta que
  // queda por encima de todas las calles y superficies. Algunos estilos (el
  // oscuro) tienen etiquetas antes que las carreteras; usar la primera
  // etiqueta dejaba la ruta tapada por las calles.
  function firstSymbolLayerId() {
    var layers = map.getStyle().layers || [];
    var lastShape = -1;
    for (var i = 0; i < layers.length; i += 1) {
      var type = layers[i].type;
      if (layers[i].id.indexOf('caravana-') === 0) continue;
      if (type === 'line' || type === 'fill' || type === 'fill-extrusion') lastShape = i;
    }
    for (var j = lastShape + 1; j < layers.length; j += 1) {
      if (layers[j].type === 'symbol' && layers[j].id.indexOf('caravana-') !== 0) return layers[j].id;
    }
    return undefined;
  }

  function setFollowing(value) {
    if (state.following === value) return;
    state.following = value;
    document.body.setAttribute('data-follow', value ? 'on' : 'off');
    post({ type: 'follow', value: value });
  }

  // Zoom automático: cerca a poca velocidad, más lejos en autopista para ver
  // lo que viene, y cerca otra vez justo antes de girar.
  function zoomForSpeed() {
    if (state.travelMode === 'walking') return 17.5;
    var speed = state.location && typeof state.location.speedKmh === 'number'
      ? state.location.speedKmh
      : 0;
    var zoom = speed < 25 ? 17 : speed < 50 ? 16.5 : speed < 80 ? 16 : 15.3;
    if (maneuverDistanceM != null && maneuverDistanceM < MANEUVER_ZOOM_M && speed < 80) {
      zoom = Math.max(zoom, 17);
    }
    return zoom;
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
    var center = shown ? [shown.lng, shown.lat] : lngLatOf(point);
    var moving = !walking && typeof point.speedKmh === 'number' && point.speedKmh >= MOVING_KMH;

    var targetZoom = zoomForSpeed();
    var zoomOff = Math.abs(map.getZoom() - targetZoom) > 0.25;

    if (lastFollow && !zoomIn) {
      var moved = haversineLngLat(lastFollow.center, center);
      var turned = Math.abs(((bearing - lastFollow.bearing + 540) % 360) - 180);
      var minMove = walking ? 3 : 8;
      var minTurn = walking ? 4 : 6;
      if (moved < minMove && turned < minTurn && !(moving && zoomOff)) return;
    }
    lastFollow = { center: center, bearing: bearing };

    // Failsafe: si la cámara está lejos (arranque, vuelta de segundo plano o
    // una animación cancelada), saltamos directamente a tu posición.
    var mapCenter = map.getCenter();
    var offCenter = haversineLngLat([mapCenter.lng, mapCenter.lat], center);
    if (offCenter > 800) {
      map.jumpTo({ center: center, zoom: targetZoom, pitch: 0, bearing: bearing });
      return;
    }

    var options = {
      center: center,
      pitch: 0,
      bearing: bearing,
      // La señal GPS llega cada pocos segundos; una animación larga se
      // solapaba con la siguiente y producía sensación de mapa pesado.
      duration: animate ? (moving ? 850 : 450) : 0,
      essential: true
    };
    if (moving) options.easing = function (t) { return t; };
    // Parado respetamos el zoom que elija el usuario; en marcha manda la velocidad.
    if (zoomIn || (moving && zoomOff) || map.getZoom() < targetZoom - 1.5) options.zoom = targetZoom;
    map.easeTo(options);
  }

  function setLocation(location) {
    if (!location) return;
    var firstFix = !state.location;
    if (firstFix) {
      // Al abrir la app o recargar el mapa, la primera posición siempre
      // reengancha el seguimiento: la cámara nunca se queda en el centro por
      // defecto aunque antes se hubiera soltado.
      setFollowing(true);
    }
    state.location = location;
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
    updateAccuracy(location);
    if (personMarker && state.travelMode === 'walking') {
      personMarker.setLngLat(lngLatOf(location));
    }
    updateRouteProgress(false);
    updateManeuver();
    updateParkingLine();
    if (firstFix || !shown) {
      placeShown(location.longitude, location.latitude, state.heading);
      if (state.following) follow(false, true);
      return;
    }
    animateTo(location);
  }

  function placeShown(lng, lat, heading) {
    shown = { lng: lng, lat: lat, heading: heading };
    motion = null;
    vehicleMarker.setLngLat([lng, lat]);
    if (heading !== null) vehicleMarker.setRotation(heading);
  }

  function shortestTurn(from, to) {
    return ((to - from + 540) % 360) - 180;
  }

  // Desliza del punto mostrado al nuevo durante el tiempo entre señales: así
  // el coche no se para a esperar la siguiente.
  function animateTo(location) {
    var now = performance.now();
    var gap = lastFixAt ? now - lastFixAt : 1000;
    lastFixAt = now;
    var targetHeading = state.heading !== null ? state.heading : shown.heading;
    var jump = haversineLngLat([shown.lng, shown.lat], lngLatOf(location));
    // Un salto enorme (túnel, vuelta de segundo plano) no se anima.
    if (jump > 400) {
      placeShown(location.longitude, location.latitude, targetHeading);
      if (state.following) follow(false, false);
      return;
    }
    motion = {
      from: { lng: shown.lng, lat: shown.lat, heading: shown.heading },
      to: { lng: location.longitude, lat: location.latitude, heading: targetHeading },
      start: now,
      duration: Math.max(350, Math.min(1600, gap))
    };
    if (!motionFrame) {
      lastFrameAt = now;
      motionFrame = requestAnimationFrame(stepMotion);
    }
  }

  function stepMotion(now) {
    motionFrame = 0;
    if (!motion || !mapReady) return;
    var dt = Math.min(100, now - lastFrameAt);
    lastFrameAt = now;
    var t = Math.min(1, (now - motion.start) / motion.duration);
    var from = motion.from;
    var to = motion.to;
    var heading = to.heading;
    if (from.heading !== null && to.heading !== null) {
      heading = (from.heading + shortestTurn(from.heading, to.heading) * t + 360) % 360;
    }
    shown = {
      lng: from.lng + (to.lng - from.lng) * t,
      lat: from.lat + (to.lat - from.lat) * t,
      heading: heading
    };
    vehicleMarker.setLngLat([shown.lng, shown.lat]);
    if (heading !== null) vehicleMarker.setRotation(heading);
    if (state.following) followFrame(dt);
    if (t < 1) {
      motionFrame = requestAnimationFrame(stepMotion);
    } else {
      motion = null;
    }
  }

  // Cámara pegada al coche mostrado; el zoom se acerca suavemente al de la
  // velocidad para no dar tirones.
  function followFrame(dt) {
    var options = {
      center: [shown.lng, shown.lat],
      bearing: state.northUp ? 0 : shown.heading !== null ? shown.heading : map.getBearing()
    };
    var speed = state.location && typeof state.location.speedKmh === 'number' ? state.location.speedKmh : 0;
    if (state.travelMode !== 'walking' && speed >= MOVING_KMH) {
      var zoom = map.getZoom();
      var target = zoomForSpeed();
      if (Math.abs(target - zoom) > 0.02) options.zoom = zoom + (target - zoom) * Math.min(1, dt / 900);
    }
    lastFollow = { center: options.center, bearing: options.bearing };
    map.jumpTo(options);
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
    routeCumulative = [0];
    for (var i = 1; i < routePoints.length; i += 1) {
      routeCumulative.push(routeCumulative[i - 1] + haversineLngLat(routePoints[i - 1], routePoints[i]));
    }
    lastRouteProgressIndex = -1;
    updateRouteProgress(true);
    updateManeuver();
    if (!hadRoute && routePoints.length > 1) focusRoute();
  }

  // Rutas alternativas (sin elegir) en gris bajo la principal; se pueden tocar.
  function setAlternatives(list) {
    state.alternatives = Array.isArray(list) ? list : [];
    if (!mapReady || !map.getSource('caravana-alternatives')) return;
    map.getSource('caravana-alternatives').setData({
      type: 'FeatureCollection',
      features: state.alternatives
        .filter(function (item) { return item && Array.isArray(item.coordinates) && item.coordinates.length > 1; })
        .map(function (item) {
          return {
            type: 'Feature',
            properties: { index: item.index },
            geometry: {
              type: 'LineString',
              coordinates: item.coordinates.map(function (point) { return [point[1], point[0]]; })
            }
          };
        })
    });
  }

  function routeDataForProgress(splitIndex) {
    if (!state.route || routePoints.length < 2) return EMPTY_ROUTE;

    var split = Math.max(0, Math.min(routePoints.length - 1, splitIndex));
    var features = [];
    var past = routePoints.slice(0, split + 1);
    var future = routePoints.slice(split);

    if (past.length > 1) {
      features.push({
        type: 'Feature',
        properties: { segment: 'past' },
        geometry: { type: 'LineString', coordinates: past }
      });
    }
    if (future.length > 1) {
      features.push({
        type: 'Feature',
        properties: { segment: 'future' },
        geometry: { type: 'LineString', coordinates: future }
      });
    }
    return { type: 'FeatureCollection', features: features };
  }

  function updateRouteProgress(force) {
    if (!mapReady || !map.getSource('caravana-route')) return;
    if (!state.route || routePoints.length < 2) {
      lastRouteProgressIndex = -1;
      routeProgressM = null;
      map.getSource('caravana-route').setData(EMPTY_ROUTE);
      return;
    }

    var split = state.location ? nearestRouteIndex(lngLatOf(state.location)) : 0;
    routeProgressM = routeCumulative[split] || 0;
    if (!force && split === lastRouteProgressIndex) return;
    // Rehacer la geometría de la ruta cuesta: como mucho una vez por segundo.
    var now = Date.now();
    if (!force && now - routeProgressAt < 1000) return;
    routeProgressAt = now;
    lastRouteProgressIndex = split;
    map.getSource('caravana-route').setData(routeDataForProgress(split));
  }

  // Punto de la ruta a cierta distancia desde el inicio.
  function pointAtDistance(meters) {
    for (var i = 1; i < routePoints.length; i += 1) {
      if (routeCumulative[i] >= meters) {
        var span = routeCumulative[i] - routeCumulative[i - 1];
        var t = span > 0 ? (meters - routeCumulative[i - 1]) / span : 0;
        var a = routePoints[i - 1];
        var b = routePoints[i];
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
    }
    return routePoints[routePoints.length - 1];
  }

  // Marca en el mapa el punto exacto de la próxima maniobra.
  function updateManeuver() {
    if (!mapReady || !map.getSource('caravana-maneuver')) return;
    var instructions = state.route && Array.isArray(state.route.instructions)
      ? state.route.instructions
      : [];
    var progress = routeProgressM;
    var next = null;
    if (progress != null && routePoints.length > 1) {
      for (var i = 0; i < instructions.length; i += 1) {
        var item = instructions[i];
        if (item.icon === 'depart' || item.icon === 'straight') continue;
        if (item.atDistanceM > progress + 10) {
          next = item;
          break;
        }
      }
    }
    if (!next) {
      maneuverDistanceM = null;
      map.getSource('caravana-maneuver').setData(EMPTY_ROUTE);
      return;
    }
    maneuverDistanceM = next.atDistanceM - progress;
    map.getSource('caravana-maneuver').setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: pointAtDistance(next.atDistanceM) }
      }]
    });
  }

  // Reencuadre corto: el coche queda abajo y el tramo inmediato de la ruta
  // ocupa la vista, en lugar de mostrar la ruta completa diminuta.
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
      zoom: Math.max(zoomForSpeed(), map.getZoom()),
      pitch: 0,
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
      else if (message.type === 'alternatives') setAlternatives(message.payload);
      else if (message.type === 'vehicle') setVehicleInput(message.payload);
      else if (message.type === 'parking') setParking(message.payload);
      else if (message.type === 'travel') setTravelMode(message.payload);
      else if (message.type === 'north') setNorthUp(message.payload);
      else if (message.type === 'fit') fitRoute(message.payload && message.payload.coordinates);
      else if (message.type === 'autofollow') setAutoFollow(message.payload);
      else if (message.type === 'recenter') recenter();
      else if (message.type === 'theme') setTheme(message.payload);
    } catch (error) {
      fail('Mapa: ' + (error && error.message ? error.message : String(error)));
    }
  }

  function addAlternatives(before) {
    map.addSource('caravana-alternatives', { type: 'geojson', data: EMPTY_ROUTE });
    map.addLayer({
      id: 'caravana-alt-casing',
      type: 'line',
      source: 'caravana-alternatives',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#6f7f93',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 6, 14, 9, 16, 13, 18, 19]
      }
    }, before);
    map.addLayer({
      id: 'caravana-alt-line',
      type: 'line',
      source: 'caravana-alternatives',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#b4c2d3',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 14, 6, 16, 9, 18, 14]
      }
    }, before);
    // El manejador va por id de capa y sobrevive a un cambio de estilo.
    if (alternativeTapBound) return;
    alternativeTapBound = true;
    map.on('click', 'caravana-alt-casing', function (event) {
      var feature = event.features && event.features[0];
      if (feature && typeof feature.properties.index === 'number') {
        post({ type: 'alternativeTap', index: feature.properties.index });
      }
    });
  }

  // Ruta principal: cinta azul gruesa con borde oscuro; lo ya recorrido en gris.
  function addRoute() {
    var before = firstSymbolLayerId();
    addAlternatives(before);
    map.addSource('caravana-route', { type: 'geojson', data: EMPTY_ROUTE });
    map.addLayer({
      id: 'caravana-route-casing',
      type: 'line',
      source: 'caravana-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['==', ['get', 'segment'], 'past'], '#8a96a4', '#1458b8'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 8, 14, 12, 16, 17, 18, 24],
        'line-opacity': ['case', ['==', ['get', 'segment'], 'past'], 0.6, 1]
      }
    }, before);
    map.addLayer({
      id: 'caravana-route-line',
      type: 'line',
      source: 'caravana-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['==', ['get', 'segment'], 'past'], '#c3cbd4', '#3d9bff'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 5.5, 14, 8.5, 16, 12.5, 18, 18]
      }
    }, before);
    addRouteArrows(before);
    addManeuverLayer();
  }

  function createRouteArrowIcon() {
    if (map.hasImage('caravana-route-arrow')) return;
    var size = 36;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var context = canvas.getContext('2d');
    context.strokeStyle = 'rgba(255,255,255,0.95)';
    context.lineWidth = size * 0.16;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    // Con symbol-placement 'line' el eje +x del icono sigue el sentido de la
    // línea: el chevrón apunta a la derecha para señalar hacia delante.
    context.beginPath();
    context.moveTo(size * 0.4, size * 0.26);
    context.lineTo(size * 0.64, size * 0.5);
    context.lineTo(size * 0.4, size * 0.74);
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
        'symbol-spacing': 110,
        'icon-image': 'caravana-route-arrow',
        'icon-size': 0.7,
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    }, before);
  }

  // Punto blanco con borde azul donde hay que girar.
  function addManeuverLayer() {
    map.addSource('caravana-maneuver', { type: 'geojson', data: EMPTY_ROUTE });
    map.addLayer({
      id: 'caravana-maneuver',
      type: 'circle',
      source: 'caravana-maneuver',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 16, 8, 18, 11],
        'circle-color': '#ffffff',
        'circle-stroke-color': '#1458b8',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 3.5, 18, 5]
      }
    });
  }

  // Mapa limpio: fuera negocios, números de portal y flechas de sentido; los
  // nombres de calles se quedan, que es lo que se lee al conducir.
  function hideClutter() {
    var layers = map.getStyle().layers || [];
    for (var index = 0; index < layers.length; index += 1) {
      var layer = layers[index];
      // Edificios en relieve: el mapa es plano y solo gastaban GPU.
      if (layer.type === 'fill-extrusion') {
        try {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        } catch (error) {
          // Se deja como está.
        }
        continue;
      }
      if (layer.type !== 'symbol') continue;
      var sourceLayer = layer['source-layer'] || '';
      if (
        sourceLayer === 'poi' ||
        sourceLayer === 'housenumber' ||
        sourceLayer === 'aerodrome_label' ||
        sourceLayer === 'transportation'
      ) {
        try {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        } catch (error) {
          // Si el estilo no permite ocultarla, se deja como está.
        }
      }
    }
  }

  function addVehicle() {
    var element = document.createElement('div');
    element.className = 'vehicle';
    element.style.setProperty('--car-color', state.vehicleColor);
    element.innerHTML =
      '<div class="vehicle-halo"></div>' +
      '<svg class="vehicle-arrow" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 L52 56 L32 45 L12 56 Z"></path></svg>';
    vehicleMarker = new maplibregl.Marker({
      element: element,
      rotationAlignment: 'map',
      pitchAlignment: 'map'
    })
      .setLngLat(state.location ? lngLatOf(state.location) : DEFAULT_CENTER)
      .addTo(map);
  }
`;
