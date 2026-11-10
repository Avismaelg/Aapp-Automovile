import type { VehicleKind } from '@/src/types/models';

// REG-05: marcas y modelos habituales en RD para autocompletar. Se puede
// escribir cualquier otra marca o modelo (texto libre).
export const VEHICLE_MAKES: Record<string, { kinds: VehicleKind[]; models: string[] }> = {
  Toyota: { kinds: ['car', 'truck'], models: ['Corolla', 'Camry', 'RAV4', 'Hilux', 'Land Cruiser', 'Prado', '4Runner', 'Yaris', 'Highlander', 'Tacoma', 'Fortuner', 'C-HR'] },
  Honda: { kinds: ['car', 'motorcycle'], models: ['Civic', 'Accord', 'CR-V', 'HR-V', 'Fit', 'Pilot', 'Odyssey', 'CB190R', 'XR150L', 'Navi', 'Dio'] },
  Hyundai: { kinds: ['car', 'truck', 'ev'], models: ['Sonata', 'Elantra', 'Tucson', 'Santa Fe', 'Accent', 'Creta', 'Kona', 'Ioniq 5', 'H-1', 'Porter'] },
  Kia: { kinds: ['car', 'ev'], models: ['Picanto', 'Rio', 'K5', 'Forte', 'Sportage', 'Sorento', 'Seltos', 'Soul', 'Carnival', 'EV6', 'Niro'] },
  Nissan: { kinds: ['car', 'truck', 'ev'], models: ['Sentra', 'Versa', 'Altima', 'Kicks', 'X-Trail', 'Pathfinder', 'Frontier', 'Navara', 'Patrol', 'Leaf'] },
  Mitsubishi: { kinds: ['car', 'truck'], models: ['Lancer', 'Mirage', 'ASX', 'Outlander', 'Montero', 'Montero Sport', 'L200'] },
  Suzuki: { kinds: ['car', 'motorcycle'], models: ['Swift', 'Vitara', 'Jimny', 'Ertiga', 'Celerio', 'Gixxer', 'AX100'] },
  Mazda: { kinds: ['car'], models: ['Mazda2', 'Mazda3', 'Mazda6', 'CX-3', 'CX-30', 'CX-5', 'CX-9', 'BT-50'] },
  Ford: { kinds: ['car', 'truck', 'ev'], models: ['Ranger', 'F-150', 'Explorer', 'Escape', 'Edge', 'Bronco', 'Mustang', 'Mustang Mach-E', 'Expedition'] },
  Chevrolet: { kinds: ['car', 'truck', 'ev'], models: ['Spark', 'Aveo', 'Onix', 'Cruze', 'Tracker', 'Equinox', 'Colorado', 'Silverado', 'Tahoe', 'Bolt'] },
  Jeep: { kinds: ['car'], models: ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass', 'Renegade', 'Gladiator'] },
  'Mercedes-Benz': { kinds: ['car', 'ev', 'truck'], models: ['Clase A', 'Clase C', 'Clase E', 'Clase S', 'GLA', 'GLC', 'GLE', 'G 63', 'EQB', 'Sprinter'] },
  BMW: { kinds: ['car', 'motorcycle', 'ev'], models: ['Serie 1', 'Serie 3', 'Serie 5', 'X1', 'X3', 'X5', 'X6', 'i4', 'iX', 'R 1250 GS'] },
  Audi: { kinds: ['car', 'ev'], models: ['A3', 'A4', 'A6', 'Q3', 'Q5', 'Q7', 'Q8', 'e-tron'] },
  Lexus: { kinds: ['car'], models: ['IS', 'ES', 'NX', 'RX', 'GX', 'LX', 'UX'] },
  Volkswagen: { kinds: ['car'], models: ['Gol', 'Jetta', 'Golf', 'Tiguan', 'Amarok', 'T-Cross', 'Taos'] },
  Isuzu: { kinds: ['truck', 'car'], models: ['D-Max', 'MU-X', 'NPR', 'NQR'] },
  Tesla: { kinds: ['ev'], models: ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck'] },
  BYD: { kinds: ['ev'], models: ['Dolphin', 'Seagull', 'Atto 3', 'Seal', 'Song Plus', 'Han', 'Tang'] },
  Geely: { kinds: ['car', 'ev'], models: ['Coolray', 'Azkarra', 'Emgrand', 'Geometry C'] },
  Changan: { kinds: ['car'], models: ['CS35 Plus', 'CS55 Plus', 'Alsvin', 'Hunter'] },
  Chery: { kinds: ['car'], models: ['Tiggo 2', 'Tiggo 4', 'Tiggo 7', 'Tiggo 8'] },
  JAC: { kinds: ['car', 'truck', 'ev'], models: ['JS4', 'T8', 'E10X', 'X200'] },
  Yamaha: { kinds: ['motorcycle'], models: ['YZF-R3', 'MT-03', 'MT-07', 'FZ', 'XTZ 125', 'NMAX', 'Crypton'] },
  Kawasaki: { kinds: ['motorcycle'], models: ['Ninja 400', 'Z650', 'Versys 650', 'KLX 150'] },
  Bajaj: { kinds: ['motorcycle'], models: ['Pulsar 200', 'Boxer', 'Dominar 400', 'Discover'] },
  'Harley-Davidson': { kinds: ['motorcycle'], models: ['Sportster', 'Street Glide', 'Fat Boy', 'Iron 883'] },
  Ducati: { kinds: ['motorcycle'], models: ['Monster', 'Panigale V2', 'Scrambler', 'Multistrada'] },
  Freightliner: { kinds: ['truck'], models: ['Cascadia', 'M2 106', 'Columbia'] },
  Mack: { kinds: ['truck'], models: ['Granite', 'Anthem', 'Pinnacle'] },
  Hino: { kinds: ['truck'], models: ['Serie 300', 'Serie 500'] },
  Daihatsu: { kinds: ['car', 'truck'], models: ['Terios', 'Hijet', 'Sirion'] },
};

function fold(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Sugerencias que empiezan (o contienen) lo escrito; primero las del tipo
// elegido.
export function suggestMakes(typed: string, kind?: VehicleKind, limit = 6): string[] {
  const query = fold(typed);
  if (!query) return [];
  const all = Object.keys(VEHICLE_MAKES);
  const scored = all
    .map((make) => {
      const name = fold(make);
      const score = name.startsWith(query) ? 2 : name.includes(query) ? 1 : 0;
      const kindBonus = kind && VEHICLE_MAKES[make].kinds.includes(kind) ? 0.5 : 0;
      return { make, score: score ? score + kindBonus : 0 };
    })
    .filter((item) => item.score > 0 && fold(item.make) !== query)
    .sort((a, b) => b.score - a.score || a.make.localeCompare(b.make));
  return scored.slice(0, limit).map((item) => item.make);
}

export function suggestModels(make: string, typed: string, limit = 6): string[] {
  const key = Object.keys(VEHICLE_MAKES).find((name) => fold(name) === fold(make));
  if (!key) return [];
  const query = fold(typed);
  return VEHICLE_MAKES[key].models
    .filter((model) => (query ? fold(model).includes(query) && fold(model) !== query : true))
    .slice(0, limit);
}
