// Proveedor de teselas y versión de MapLibre que carga el WebView.
export const MAPLIBRE_BASE = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl';
const MAPTILER_KEY = (process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '').trim();
// Mapa claro de calles: contrasta mejor con la ruta azul y se lee de día.
export const MAP_FALLBACK_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const MAP_STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(MAPTILER_KEY)}`
  : MAP_FALLBACK_STYLE_URL;

export const WORLD_MAP_PROVIDER = MAPTILER_KEY ? 'maptiler' : 'openfreemap';
