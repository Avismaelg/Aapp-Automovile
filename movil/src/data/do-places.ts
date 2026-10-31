// Destinos de República Dominicana para el buscador: aparecen al momento,
// sin conexión y aunque escribas con faltas («punta cna», «bavaro»).
// Coordenadas sacadas de OpenStreetMap (Photon) el 31-10-2026 y revisadas.

export type KnownPlaceKind =
  | 'city'
  | 'town'
  | 'district'
  | 'airport'
  | 'beach'
  | 'island'
  | 'mall'
  | 'park'
  | 'street'
  | 'stadium'
  | 'monument'
  | 'lake'
  | 'peak'
  | 'waterfall'
  | 'landmark';

export type KnownPlace = {
  name: string;
  detail: string;
  latitude: number;
  longitude: number;
  kind: KnownPlaceKind;
  aliases: string[];
};

export const DOMINICAN_PLACES: KnownPlace[] = [
  { name: 'Punta Cana', detail: 'Pueblo · Higüey, La Altagracia', latitude: 18.55655, longitude: -68.36916, kind: 'town', aliases: ['puntacana'] },
  { name: 'Bávaro', detail: 'Pueblo · Higüey, La Altagracia', latitude: 18.68619, longitude: -68.41975, kind: 'town', aliases: ['bavaro'] },
  { name: 'Cap Cana', detail: 'Pueblo · Higüey, La Altagracia', latitude: 18.50444, longitude: -68.38301, kind: 'town', aliases: ['capcana'] },
  { name: 'Aeropuerto de Punta Cana', detail: 'Aeropuerto · Punta Cana, La Altagracia', latitude: 18.56979, longitude: -68.36663, kind: 'airport', aliases: ['puj', 'aeropuerto punta cana'] },
  { name: 'Aeropuerto Las Américas', detail: 'Aeropuerto · Boca Chica, Santo Domingo', latitude: 18.4293, longitude: -69.67151, kind: 'airport', aliases: ['aila', 'aeropuerto las americas'] },
  { name: 'Aeropuerto del Cibao', detail: 'Aeropuerto · Licey al Medio, Santiago', latitude: 19.40548, longitude: -70.60372, kind: 'airport', aliases: ['sti', 'aeropuerto santiago'] },
  { name: 'Aeropuerto de Puerto Plata', detail: 'Aeropuerto · Sosúa, Puerto Plata', latitude: 19.75755, longitude: -70.56892, kind: 'airport', aliases: ['pop', 'aeropuerto puerto plata'] },
  { name: 'Aeropuerto de La Romana', detail: 'Aeropuerto · La Romana', latitude: 18.4518, longitude: -68.91334, kind: 'airport', aliases: ['lrm'] },
  { name: 'Aeropuerto del Higüero', detail: 'Aeropuerto · Santo Domingo Norte, Santo Domingo', latitude: 18.57136, longitude: -69.98602, kind: 'airport', aliases: ['jbq', 'higuero'] },
  { name: 'Aeropuerto de Samaná (El Catey)', detail: 'Aeropuerto · El Catey, Sánchez, Samaná', latitude: 19.26877, longitude: -69.74114, kind: 'airport', aliases: ['el catey'] },
  { name: 'Higüey', detail: 'Ciudad · La Altagracia', latitude: 18.61313, longitude: -68.71145, kind: 'city', aliases: ['higuey'] },
  { name: 'La Romana', detail: 'Ciudad · La Romana', latitude: 18.42273, longitude: -68.96635, kind: 'city', aliases: [] },
  { name: 'Bayahíbe', detail: 'Pueblo · San Rafael del Yuma, La Altagracia', latitude: 18.36871, longitude: -68.83969, kind: 'town', aliases: ['bayahibe'] },
  { name: 'Dominicus', detail: 'Pueblo · San Rafael del Yuma, La Altagracia', latitude: 18.34973, longitude: -68.82884, kind: 'town', aliases: [] },
  { name: 'Isla Saona', detail: 'Isla · Adamanay, La Altagracia', latitude: 18.15446, longitude: -68.67677, kind: 'island', aliases: ['saona'] },
  { name: 'Isla Catalina', detail: 'Isla · La Romana', latitude: 18.35887, longitude: -69.0081, kind: 'island', aliases: ['catalina'] },
  { name: 'Juan Dolio', detail: 'Pueblo · Guayacanes, San Pedro de Macorís', latitude: 18.42689, longitude: -69.41621, kind: 'town', aliases: [] },
  { name: 'Boca Chica', detail: 'Pueblo · Santo Domingo', latitude: 18.45369, longitude: -69.61112, kind: 'town', aliases: [] },
  { name: 'Guayacanes', detail: 'Pueblo · San Pedro de Macorís', latitude: 18.42137, longitude: -69.45867, kind: 'town', aliases: [] },
  { name: 'San Pedro de Macorís', detail: 'Ciudad · San Pedro de Macorís', latitude: 18.46171, longitude: -69.30318, kind: 'city', aliases: ['san pedro', 'macoris'] },
  { name: 'Miches', detail: 'Pueblo · El Seibo', latitude: 18.9851, longitude: -69.04986, kind: 'town', aliases: [] },
  { name: 'Sabana de la Mar', detail: 'Pueblo · Hato Mayor', latitude: 19.05645, longitude: -69.38696, kind: 'town', aliases: [] },
  { name: 'Hato Mayor', detail: 'Ciudad · Hato Mayor', latitude: 18.76247, longitude: -69.2563, kind: 'city', aliases: ['hato mayor'] },
  { name: 'El Seibo', detail: 'Ciudad', latitude: 18.78542, longitude: -69.01968, kind: 'city', aliases: ['seibo'] },
  { name: 'Uvero Alto', detail: 'Pueblo · Higüey, La Altagracia', latitude: 18.80686, longitude: -68.58082, kind: 'town', aliases: [] },
  { name: 'Santo Domingo', detail: 'Ciudad · Distrito Nacional', latitude: 18.47139, longitude: -69.89184, kind: 'city', aliases: ['sto dgo', 'santo domingo de guzman'] },
  { name: 'Santo Domingo Este', detail: 'Ciudad · Santo Domingo', latitude: 18.49365, longitude: -69.83837, kind: 'city', aliases: ['sde'] },
  { name: 'Santo Domingo Norte', detail: 'Ciudad · Santo Domingo', latitude: 18.61219, longitude: -69.91151, kind: 'city', aliases: [] },
  { name: 'Santo Domingo Oeste', detail: 'Ciudad · Santo Domingo', latitude: 18.4845, longitude: -69.99845, kind: 'city', aliases: [] },
  { name: 'Zona Colonial', detail: 'Barrio · Santa Domingo, Distrito Nacional', latitude: 18.47148, longitude: -69.88682, kind: 'district', aliases: ['ciudad colonial'] },
  { name: 'Malecón de Santo Domingo', detail: 'Paseo · Santo Domingo, Distrito Nacional', latitude: 18.45456, longitude: -69.91756, kind: 'street', aliases: ['malecon'] },
  { name: 'Los Tres Ojos', detail: 'Parque · Santo Domingo Este, Santo Domingo', latitude: 18.48139, longitude: -69.84358, kind: 'park', aliases: ['tres ojos'] },
  { name: 'Jardín Botánico Nacional', detail: 'Parque · Santo Domingo, Distrito Nacional', latitude: 18.49488, longitude: -69.95414, kind: 'park', aliases: ['jardin botanico'] },
  { name: 'Parque Mirador Sur', detail: 'Parque · Santo Domingo, Distrito Nacional', latitude: 18.44447, longitude: -69.94929, kind: 'park', aliases: ['mirador sur'] },
  { name: 'Estadio Quisqueya', detail: 'Estadio · Santo Domingo, Distrito Nacional', latitude: 18.48858, longitude: -69.92615, kind: 'stadium', aliases: [] },
  { name: 'Faro a Colón', detail: 'Monumento · Santo Domingo Este, Santo Domingo', latitude: 18.47856, longitude: -69.86804, kind: 'monument', aliases: ['faro a colon'] },
  { name: 'Ágora Mall', detail: 'Centro comercial · Santo Domingo, Distrito Nacional', latitude: 18.48283, longitude: -69.94, kind: 'mall', aliases: ['agora'] },
  { name: 'Blue Mall', detail: 'Centro comercial · Santo Domingo, Distrito Nacional', latitude: 18.47278, longitude: -69.94102, kind: 'mall', aliases: [] },
  { name: 'Sambil', detail: 'Centro comercial · Santo Domingo, Distrito Nacional', latitude: 18.4832, longitude: -69.91184, kind: 'mall', aliases: ['sambil'] },
  { name: 'Megacentro', detail: 'Centro comercial · Santo Domingo Este, Santo Domingo', latitude: 18.50723, longitude: -69.85657, kind: 'mall', aliases: [] },
  { name: 'Galería 360', detail: 'Centro comercial · Santo Domingo, Distrito Nacional', latitude: 18.48569, longitude: -69.93618, kind: 'mall', aliases: ['galeria 360'] },
  { name: 'Downtown Center', detail: 'Centro comercial · Santo Domingo, Distrito Nacional', latitude: 18.45064, longitude: -69.95286, kind: 'mall', aliases: ['downtown'] },
  { name: 'Acrópolis Center', detail: 'Centro comercial · Santo Domingo, Distrito Nacional', latitude: 18.4696, longitude: -69.93927, kind: 'mall', aliases: ['acropolis'] },
  { name: 'Bella Vista Mall', detail: 'Centro comercial · Santo Domingo, Distrito Nacional', latitude: 18.45336, longitude: -69.94187, kind: 'mall', aliases: [] },
  { name: 'San Cristóbal', detail: 'Ciudad · San Cristóbal', latitude: 18.41596, longitude: -70.11022, kind: 'city', aliases: ['san cristobal'] },
  { name: 'Baní', detail: 'Ciudad · Peravia', latitude: 18.27772, longitude: -70.33207, kind: 'city', aliases: ['bani'] },
  { name: 'Las Salinas (Baní)', detail: 'Pueblo · Baní, Peravia', latitude: 18.21163, longitude: -70.54882, kind: 'town', aliases: [] },
  { name: 'Azua', detail: 'Ciudad · Azua', latitude: 18.45937, longitude: -70.75418, kind: 'city', aliases: ['azua'] },
  { name: 'Barahona', detail: 'Ciudad', latitude: 18.18935, longitude: -71.2286, kind: 'city', aliases: [] },
  { name: 'Paraíso (Barahona)', detail: 'Pueblo · Barahona', latitude: 18.03509, longitude: -71.21017, kind: 'town', aliases: ['paraiso'] },
  { name: 'Los Patos', detail: 'Pueblo · Paraíso, Barahona', latitude: 17.95644, longitude: -71.18568, kind: 'town', aliases: [] },
  { name: 'San Rafael (Barahona)', detail: 'Playa · Paraíso, Barahona', latitude: 18.03019, longitude: -71.13914, kind: 'beach', aliases: ['san rafael'] },
  { name: 'Pedernales', detail: 'Ciudad', latitude: 17.97237, longitude: -71.54543, kind: 'city', aliases: [] },
  { name: 'Bahía de las Águilas', detail: 'Playa · oviedo, Pedernales', latitude: 17.82071, longitude: -71.70125, kind: 'beach', aliases: ['bahia de las aguilas'] },
  { name: 'Lago Enriquillo', detail: 'Lago · Bahoruco', latitude: 18.48535, longitude: -71.58135, kind: 'lake', aliases: ['enriquillo'] },
  { name: 'Neiba', detail: 'Ciudad · Bahoruco', latitude: 18.47961, longitude: -71.42137, kind: 'city', aliases: [] },
  { name: 'Jimaní', detail: 'Ciudad · Independencia', latitude: 18.4937, longitude: -71.85049, kind: 'city', aliases: ['jimani'] },
  { name: 'San Juan de la Maguana', detail: 'Ciudad · San Juan', latitude: 18.89739, longitude: -71.24117, kind: 'city', aliases: ['san juan'] },
  { name: 'Santiago de los Caballeros', detail: 'Ciudad · Santiago', latitude: 19.45085, longitude: -70.69474, kind: 'city', aliases: ['santiago'] },
  { name: 'Monumento de Santiago', detail: 'Monumento · Santiago de los Caballeros, Santiago', latitude: 19.45091, longitude: -70.69468, kind: 'monument', aliases: ['monumento santiago'] },
  { name: 'La Vega', detail: 'Ciudad', latitude: 19.03115, longitude: -70.72742, kind: 'city', aliases: [] },
  { name: 'Jarabacoa', detail: 'Pueblo · La Vega', latitude: 19.12094, longitude: -70.64193, kind: 'town', aliases: [] },
  { name: 'Constanza', detail: 'Pueblo · La Vega', latitude: 18.86508, longitude: -70.69128, kind: 'town', aliases: [] },
  { name: 'Bonao', detail: 'Ciudad · Monseñor Nouel', latitude: 18.94178, longitude: -70.41129, kind: 'city', aliases: [] },
  { name: 'Moca', detail: 'Ciudad · Espaillat', latitude: 19.39465, longitude: -70.52616, kind: 'city', aliases: [] },
  { name: 'San Francisco de Macorís', detail: 'Ciudad · Duarte', latitude: 19.29744, longitude: -70.25733, kind: 'city', aliases: ['sfm', 'san francisco'] },
  { name: 'Cotuí', detail: 'Ciudad · Sánchez Ramírez', latitude: 19.05847, longitude: -70.15337, kind: 'city', aliases: ['cotui'] },
  { name: 'Salcedo', detail: 'Ciudad · Hermanas Mirabal', latitude: 19.44675, longitude: -70.38906, kind: 'city', aliases: [] },
  { name: 'Nagua', detail: 'Ciudad · Nagua, María Trinidad Sánchez', latitude: 19.37693, longitude: -69.84626, kind: 'city', aliases: [] },
  { name: 'Puerto Plata', detail: 'Ciudad · Puerto Plata', latitude: 19.79766, longitude: -70.69326, kind: 'city', aliases: ['pto plata'] },
  { name: 'Sosúa', detail: 'Pueblo · Puerto Plata', latitude: 19.76665, longitude: -70.51262, kind: 'town', aliases: ['sosua'] },
  { name: 'Cabarete', detail: 'Pueblo · Sosúa, Puerto Plata', latitude: 19.74962, longitude: -70.41393, kind: 'town', aliases: [] },
  { name: 'Río San Juan', detail: 'Pueblo · María Trinidad Sánchez', latitude: 19.64521, longitude: -70.07905, kind: 'town', aliases: ['rio san juan'] },
  { name: 'Cabrera', detail: 'Pueblo · María Trinidad Sánchez', latitude: 19.58064, longitude: -69.9801, kind: 'town', aliases: [] },
  { name: 'Luperón', detail: 'Pueblo · Puerto Plata', latitude: 19.89213, longitude: -70.96159, kind: 'town', aliases: ['luperon'] },
  { name: 'Montecristi', detail: 'Ciudad · Monte Cristi', latitude: 19.84838, longitude: -71.64567, kind: 'city', aliases: ['monte cristi'] },
  { name: 'Dajabón', detail: 'Ciudad', latitude: 19.43666, longitude: -71.57037, kind: 'city', aliases: ['dajabon'] },
  { name: 'Mao', detail: 'Ciudad · Valverde', latitude: 19.53365, longitude: -71.04165, kind: 'city', aliases: [] },
  { name: 'Samaná', detail: 'Ciudad', latitude: 19.17808, longitude: -69.65108, kind: 'city', aliases: ['samana', 'santa barbara de samana'] },
  { name: 'Las Terrenas', detail: 'Pueblo · Samaná', latitude: 19.31101, longitude: -69.54307, kind: 'town', aliases: [] },
  { name: 'Las Galeras', detail: 'Pueblo · Samaná', latitude: 19.29086, longitude: -69.19972, kind: 'town', aliases: [] },
  { name: 'Playa Rincón', detail: 'Playa · Samaná', latitude: 19.29109, longitude: -69.25178, kind: 'beach', aliases: ['rincon'] },
  { name: 'Cayo Levantado', detail: 'Isla · Samaná', latitude: 19.16631, longitude: -69.27466, kind: 'island', aliases: [] },
  { name: 'Salto El Limón', detail: 'Cascada · Samaná', latitude: 19.2703, longitude: -69.44617, kind: 'waterfall', aliases: ['salto el limon'] },
  { name: 'Monte Plata', detail: 'Ciudad · Monte Plata', latitude: 18.81015, longitude: -69.78451, kind: 'city', aliases: [] },
  { name: 'Pico Duarte', detail: 'Montaña · San José de las Matas, Santiago', latitude: 19.02299, longitude: -70.99805, kind: 'peak', aliases: [] },
  { name: 'Playa Dorada', detail: 'Playa · Puerto Plata', latitude: 19.77814, longitude: -70.65576, kind: 'beach', aliases: [] },
  { name: 'Playa Grande', detail: 'Playa · Río San Juan, María Trinidad Sánchez', latitude: 19.67822, longitude: -70.01645, kind: 'beach', aliases: ['playa grande'] },
  { name: 'Playa Juanillo', detail: 'Playa · Higüey, La Altagracia', latitude: 18.49973, longitude: -68.37808, kind: 'beach', aliases: ['juanillo'] },
  { name: 'Playa Bávaro', detail: 'Playa · Higüey, La Altagracia', latitude: 18.71227, longitude: -68.4434, kind: 'beach', aliases: ['playa bavaro'] },
  { name: 'Playa Macao', detail: 'Playa · Higüey, La Altagracia', latitude: 18.77425, longitude: -68.53774, kind: 'beach', aliases: [] },
  { name: 'Playa Caletón', detail: 'Playa · La Romana', latitude: 18.41521, longitude: -68.95312, kind: 'beach', aliases: ['caleton'] },
  { name: 'Playa Guayacanes', detail: 'Playa · Guayacanes, San Pedro de Macorís', latitude: 18.42054, longitude: -69.4525, kind: 'beach', aliases: [] },
  { name: 'Playa Najayo', detail: 'Playa · San Gregorio de Nigua, San Cristóbal', latitude: 18.30094, longitude: -70.10639, kind: 'beach', aliases: ['najayo'] },
  { name: 'Playa Palenque', detail: 'Playa · Sabana Grande de Palenque, San Cristóbal', latitude: 18.23492, longitude: -70.16373, kind: 'beach', aliases: ['palenque'] },
  { name: 'Playa Frontón', detail: 'Playa · Samaná', latitude: 19.29715, longitude: -69.15159, kind: 'beach', aliases: ['fronton'] },
  { name: 'Playa Cosón', detail: 'Playa · Las Terrenas, Samaná', latitude: 19.29402, longitude: -69.61842, kind: 'beach', aliases: ['coson'] },
  { name: 'Playa Bonita', detail: 'Playa · Las Terrenas, Samaná', latitude: 19.31478, longitude: -69.56353, kind: 'beach', aliases: [] },
  { name: 'Altos de Chavón', detail: 'Lugar de interés · La Romana', latitude: 18.42125, longitude: -68.89173, kind: 'landmark', aliases: ['chavon'] },
  { name: 'Casa de Campo', detail: 'Lugar de interés · La Romana', latitude: 18.4163, longitude: -68.92324, kind: 'landmark', aliases: [] },
  { name: 'Teleférico de Puerto Plata', detail: 'Lugar de interés · Puerto Plata', latitude: 19.77675, longitude: -70.71051, kind: 'landmark', aliases: ['teleferico'] },
  { name: '27 Charcos', detail: 'Parque · Esperanza, Valverde', latitude: 19.65249, longitude: -70.99711, kind: 'park', aliases: ['27 charcos', 'damajagua'] },
  { name: 'Hoyo Azul', detail: 'Parque · Higüey, La Altagracia', latitude: 18.4787, longitude: -68.44101, kind: 'park', aliases: [] },
  { name: 'Scape Park', detail: 'Parque · Higüey, La Altagracia', latitude: 18.4841, longitude: -68.44093, kind: 'park', aliases: [] },
  { name: 'Ojos Indígenas', detail: 'Parque · Higüey, La Altagracia', latitude: 18.51133, longitude: -68.37706, kind: 'park', aliases: ['ojos indigenas'] },
];
