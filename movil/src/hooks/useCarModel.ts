import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';

import { buildCarGlb } from '@/src/lib/car-model';

// Genera el coche 3D con el color del vehículo y lo guarda en la caché para
// que Mapbox lo cargue por file://. Devuelve null mientras no está listo.
export function useCarModel(color: string) {
  const [uri, setUri] = useState<string | null>(null);
  const key = color.replace('#', '').toLowerCase();

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        // v2: cambia el nombre si cambia la geometría para no usar una vieja.
        const file = new File(Paths.cache, `car-v2-${key}.glb`);
        if (!file.exists) await file.write(buildCarGlb(`#${key}`));
        if (active) setUri(file.uri);
      } catch {
        if (active) setUri(null);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [key]);

  return uri;
}
