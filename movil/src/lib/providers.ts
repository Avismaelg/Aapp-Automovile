// RNF-24: proveedores de rutas y búsqueda configurables por variables de
// entorno, con los servicios públicos de OSM por defecto. (GraphHopper y los
// estilos del mapa ya se configuran con sus propias variables.)

function base(value: string | undefined, fallback: string) {
  return (value?.trim() || fallback).replace(/\/+$/, '');
}

export const OSRM_URL = base(process.env.EXPO_PUBLIC_OSRM_URL, 'https://router.project-osrm.org');
export const PHOTON_URL = base(process.env.EXPO_PUBLIC_PHOTON_URL, 'https://photon.komoot.io');
export const NOMINATIM_URL = base(process.env.EXPO_PUBLIC_NOMINATIM_URL, 'https://nominatim.openstreetmap.org');

// RNF-04: tiempo máximo por proveedor de rutas, para que la cadena
// GraphHopper → OSRM → línea directa no deje al usuario esperando.
export const GRAPHHOPPER_TIMEOUT_MS = 3_000;
export const OSRM_TIMEOUT_MS = 4_000;
