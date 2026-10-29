// Proveedor de teselas y versión de MapLibre que carga el WebView.
export const MAPLIBRE_BASE = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl';
const MAPTILER_KEY = (process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '').trim();

function maptiler(style: string) {
  return `https://api.maptiler.com/maps/${style}/style.json?key=${encodeURIComponent(MAPTILER_KEY)}`;
}

// De día, mapa claro de calles (contrasta con la ruta azul); de noche, oscuro
// para no deslumbrar. OpenFreeMap es el respaldo sin API key.
export const MAP_FALLBACK_STYLES = {
  day: 'https://tiles.openfreemap.org/styles/liberty',
  night: 'https://tiles.openfreemap.org/styles/dark',
};
export const MAP_STYLES = MAPTILER_KEY
  ? { day: maptiler('streets-v2'), night: maptiler('streets-v2-dark') }
  : MAP_FALLBACK_STYLES;

export const WORLD_MAP_PROVIDER = MAPTILER_KEY ? 'maptiler' : 'openfreemap';
