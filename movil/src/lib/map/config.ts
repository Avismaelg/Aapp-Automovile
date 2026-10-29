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

// Móvil (Android/iOS): estilos de navegación de Mapbox, pensados para
// conducir. Sin token se usan los mismos de OpenFreeMap que en la web.
export const MAPBOX_ACCESS_TOKEN = (process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '').trim();
export const NATIVE_MAP_STYLES = MAPBOX_ACCESS_TOKEN
  ? {
      day: 'mapbox://styles/mapbox/navigation-day-v1',
      night: 'mapbox://styles/mapbox/navigation-night-v1',
    }
  : MAP_FALLBACK_STYLES;
// Capa del estilo bajo la que van ruta y líneas propias (encima quedan los
// nombres de calles). Es la misma en los estilos de día y de noche.
export const NATIVE_LABEL_LAYER = MAPBOX_ACCESS_TOKEN
  ? { day: 'road-intersection', night: 'road-intersection' }
  : { day: 'waterway_line_label', night: 'place_other' };
