import { MAPLIBRE_BASE } from '@/src/lib/map/config';
import { MAP_CSS } from '@/src/lib/map/css';
import { MAP_SCRIPT_CORE } from '@/src/lib/map/script-core';
import { MAP_SCRIPT_RUNTIME } from '@/src/lib/map/script-runtime';
import { MAP_VEHICLE_SCRIPT } from '@/src/lib/map/script-vehicles';

export * from '@/src/lib/map/protocol';
export { WORLD_MAP_PROVIDER } from '@/src/lib/map/config';

// Documento completo que carga el WebView del mapa. Los fragmentos viven en
// src/lib/map/ y se concatenan en orden: el script es una sola IIFE. Es
// estático: los datos cambian por postMessage y el WebView no se recarga.
export const WORLD_MAP_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="${MAPLIBRE_BASE}.css" />
<style>
${MAP_CSS}
</style>
</head>
<body>
<div id="map"></div>
<script src="${MAPLIBRE_BASE}.js"></script>
<script>
${MAP_SCRIPT_CORE}
${MAP_VEHICLE_SCRIPT}
${MAP_SCRIPT_RUNTIME}
</script>
</body>
</html>`;
