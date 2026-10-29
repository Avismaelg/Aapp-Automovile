// Capas del mapa, mensajes de la app y arranque.
export const MAP_SCRIPT_RUNTIME = `  function addPerson() {
    var element = document.createElement('div');
    element.className = 'person';
    element.style.display = 'none';
    element.innerHTML =
      '<div class="person-halo"></div>' +
      '<div class="person-badge"><svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="13" cy="4" r="2"></circle>' +
      '<path d="M13 6l-2.5 4.5L13 13l1 6"></path>' +
      '<path d="M10.5 10.5L8 14l-1.5 5"></path>' +
      '<path d="M13 10l3 2 2 5"></path>' +
      '</svg></div>';
    personMarker = new maplibregl.Marker({ element: element, anchor: 'center' });
  }

  function setTravelMode(mode) {
    state.travelMode = mode === 'walking' ? 'walking' : 'car';
    if (!mapReady) return;
    var walking = state.travelMode === 'walking';

    if (walking) {
      if (!personMarker) addPerson();
      if (state.location) personMarker.setLngLat(lngLatOf(state.location)).addTo(map);
      personMarker.getElement().style.display = '';
    } else if (personMarker) {
      personMarker.getElement().style.display = 'none';
    }
    // Caminando, el coche se queda en el aparcamiento y tú eres el peatón.
    if (vehicleMarker) vehicleMarker.getElement().style.display = walking ? 'none' : '';
    if (state.following) follow(true, true);
  }

  function setNorthUp(value) {
    state.northUp = Boolean(value);
    if (!mapReady) return;
    lastFollow = null;
    if (state.following) {
      follow(true, false);
    } else {
      map.easeTo({ bearing: 0, duration: 600, essential: true });
    }
  }

  // Encuadra la ruta completa (por ejemplo, la ruta de un evento).
  function fitRoute(coordinates) {
    if (!mapReady || !Array.isArray(coordinates) || coordinates.length < 2) return;
    setFollowing(false);

    var minLat = Infinity;
    var maxLat = -Infinity;
    var minLng = Infinity;
    var maxLng = -Infinity;
    coordinates.forEach(function (point) {
      minLat = Math.min(minLat, point[0]);
      maxLat = Math.max(maxLat, point[0]);
      minLng = Math.min(minLng, point[1]);
      maxLng = Math.max(maxLng, point[1]);
    });

    var center = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
    var spanM = Math.max(
      (maxLat - minLat) * 111320,
      (maxLng - minLng) * 111320 * Math.cos(center[1] * Math.PI / 180)
    );
    var zoom = spanM > 0
      ? Math.min(16, Math.max(10.5, Math.log(160000000 / Math.max(spanM, 400)) / Math.LN2))
      : 14;
    map.jumpTo({ center: center, zoom: zoom, pitch: 0, bearing: 0 });
  }

  function setAutoFollow(value) {
    setFollowing(Boolean(value));
  }

  function addAccuracyLayer() {
    map.addSource('caravana-accuracy', { type: 'geojson', data: EMPTY_ROUTE });
    map.addLayer({
      id: 'caravana-accuracy',
      type: 'fill',
      source: 'caravana-accuracy',
      paint: {
        'fill-color': '#4de1ff',
        'fill-opacity': 0.1,
        'fill-outline-color': 'rgba(77,225,255,0.28)'
      }
    }, firstSymbolLayerId());
  }

  // Círculo de precisión GPS alrededor del coche, como el de Google Maps.
  // Se regenera como mucho cada 10 s o si la precisión cambia >20 %.
  function updateAccuracy(location) {
    if (!mapReady || !map.getSource('caravana-accuracy')) return;
    var accuracy = typeof location.accuracy === 'number' ? location.accuracy : null;
    if (accuracy == null || accuracy < 5 || accuracy > 150) {
      if (accuracyValue !== null) {
        accuracyValue = null;
        map.getSource('caravana-accuracy').setData(EMPTY_ROUTE);
      }
      return;
    }

    var now = Date.now();
    var changed =
      accuracyValue == null ||
      Math.abs(accuracy - accuracyValue) > Math.max(8, accuracy * 0.2);
    if (!changed && now - accuracyUpdatedAt < 10000) return;
    accuracyUpdatedAt = now;
    accuracyValue = accuracy;

    var earthRadius = 6378137;
    var latitude = location.latitude * Math.PI / 180;
    var longitude = location.longitude * Math.PI / 180;
    var distance = accuracy / earthRadius;
    var coordinates = [];
    for (var step = 0; step <= 28; step += 1) {
      var bearing = step * Math.PI * 2 / 28;
      var lat2 = Math.asin(
        Math.sin(latitude) * Math.cos(distance) +
        Math.cos(latitude) * Math.sin(distance) * Math.cos(bearing)
      );
      var lng2 = longitude + Math.atan2(
        Math.sin(bearing) * Math.sin(distance) * Math.cos(latitude),
        Math.cos(distance) - Math.sin(latitude) * Math.sin(lat2)
      );
      coordinates.push([lng2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
    }
    map.getSource('caravana-accuracy').setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [coordinates] }
      }]
    });
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

  function updateParkingLine(force) {
    if (!mapReady || !parkingMarker || !map.getSource('caravana-parking-line')) return;
    if (!force && Date.now() - parkingLineAt < 1500) return;
    parkingLineAt = Date.now();
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
    updateParkingLine(true);
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

  // El coche queda en el tercio inferior de la pantalla para ver más calle
  // por delante que por detrás.
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

  // En WebView el contenedor puede cambiar de tamaño después de crear el mapa
  // (barra de pestañas, teclado, rotación). Forzamos canvas y padding a juego.
  function watchResize() {
    var container = map.getContainer();
    var lastWidth = container.clientWidth;
    var lastHeight = container.clientHeight;

    function sync() {
      if (!map) return;
      var width = container.clientWidth;
      var height = container.clientHeight;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      map.resize();
      applyViewPadding();
    }

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(sync).observe(container);
    }
    window.addEventListener('resize', sync);
    map.on('resize', applyViewPadding);

    // El WebView puede terminar de maquetar después de crear el mapa; forzamos
    // el tamaño real unas cuantas veces al arrancar.
    function forceSync() {
      if (!map) return;
      lastWidth = container.clientWidth;
      lastHeight = container.clientHeight;
      map.resize();
      applyViewPadding();
    }
    setTimeout(forceSync, 50);
    setTimeout(forceSync, 900);
    setTimeout(forceSync, 2500);
  }

  function onLoad() {
    if (mapReady) return;
    mapReady = true;
    document.body.setAttribute('data-ready', 'true');
    try {
      // MapLibre tiene su propio pixel ratio; cambiar solo window.devicePixelRatio
      // no siempre afecta al canvas del mapa en Android WebView.
      if (map.setPixelRatio) map.setPixelRatio(MAP_PIXEL_RATIO);
      applyViewPadding();
      watchResize();
      addAccuracyLayer();
      addRoute();
      hideClutter();
      addVehicle();
      addDestination();
      addParking();
      addParkingLine();
      setMembers(state.members);
      setDestination(state.destination);
      setRoute(state.route);
      setAlternatives(state.alternatives);
      setParking(state.parking);
      setTravelMode(state.travelMode);
      if (state.location) {
        vehicleMarker.setLngLat(lngLatOf(state.location));
        if (state.heading !== null) vehicleMarker.setRotation(state.heading);
        if (state.following) follow(false, true);
      }
    } catch (error) {
      fail('Mapa: ' + (error && error.message ? error.message : String(error)));
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
      fail('No pudimos cargar el motor del mapa. Revisa tu conexión.');
      return;
    }
    if (!webglAvailable()) {
      fail('Este dispositivo no soporta el mapa (WebGL).');
      return;
    }
    map = new maplibregl.Map({
      container: 'map',
      style: STYLE_URL,
      center: state.location ? lngLatOf(state.location) : DEFAULT_CENTER,
      zoom: 16,
      pitch: 0,
      bearing: 0,
      maxPitch: 0,
      pitchWithRotate: false,
      attributionControl: false
    });
    // Mapa siempre plano: ni el gesto de dos dedos lo inclina.
    if (map.touchPitch) map.touchPitch.disable();
    window.caravanaMap = map;
    map.on('styleimagemissing', function (event) {
      if (!map.hasImage(event.id)) map.addImage(event.id, { width: 1, height: 1, data: new Uint8Array(4) });
    });
    map.on('load', onLoad);
    map.on('style.load', function () {
      if (!mapReady) onLoad();
    });
    map.on('error', function (event) {
      if (!mapReady && !styleFallbackAttempted && STYLE_URL !== FALLBACK_STYLE_URL) {
        styleFallbackAttempted = true;
        map.setStyle(FALLBACK_STYLE_URL);
        return;
      }
      if (!mapReady && !event.sourceId) fail('No pudimos cargar el mapa. Revisa tu conexión.');
    });
    map.on('dragstart', function (event) {
      if (event.originalEvent) setFollowing(false);
    });
    map.on('rotatestart', function (event) {
      if (event.originalEvent) setFollowing(false);
    });
    setTimeout(function () {
      if (!mapReady) fail('El mapa tarda demasiado en cargar. Revisa tu conexión.');
    }, LOAD_TIMEOUT_MS);
  }

  document.body.setAttribute('data-follow', 'on');
  window.addEventListener('message', handleMessage);
  document.addEventListener('message', handleMessage);
  createMap();
})();`;
