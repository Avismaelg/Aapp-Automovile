// Proveedor de teselas y versión de MapLibre que carga el WebView.
export const MAPLIBRE_BASE = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl';
const MAPTILER_KEY = (process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '').trim();
export const MAP_STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${encodeURIComponent(MAPTILER_KEY)}`
  : 'https://tiles.openfreemap.org/styles/dark';

export const WORLD_MAP_PROVIDER = MAPTILER_KEY ? 'maptiler' : 'openfreemap';
