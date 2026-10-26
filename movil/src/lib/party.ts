export type PartyDestination = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

export type PartyVoiceChannelSlug = 'convoy' | 'route' | 'chat';

export const partyVoiceChannels: {
  slug: PartyVoiceChannelSlug;
  name: string;
  shortName: string;
  description: string;
}[] = [
  {
    slug: 'convoy',
    name: 'Convoy',
    shortName: 'Convoy',
    description: 'Coordinación general de la caravana.',
  },
  {
    slug: 'route',
    name: 'Ruta',
    shortName: 'Ruta',
    description: 'Avisos de tráfico, paradas y navegación.',
  },
  {
    slug: 'chat',
    name: 'Charla',
    shortName: 'Charla',
    description: 'Conversación distendida del grupo.',
  },
];


export const partyDestinations: PartyDestination[] = [
  {
    id: 'constanza',
    label: 'Constanza',
    latitude: 18.9092,
    longitude: -70.7449,
  },
  {
    id: 'boca-chica',
    label: 'Boca Chica',
    latitude: 18.4539,
    longitude: -69.61,
  },
  {
    id: 'jarabacoa',
    label: 'Jarabacoa',
    latitude: 19.1215,
    longitude: -70.6422,
  },
  {
    id: 'punta-cana',
    label: 'Punta Cana',
    latitude: 18.582,
    longitude: -68.4055,
  },
  {
    id: 'santiago',
    label: 'Santiago',
    latitude: 19.4517,
    longitude: -70.697,
  },
];
