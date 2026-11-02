import { t } from "@/src/i18n";
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
    name: t('Convoy'),
    shortName: t('Convoy'),
    description: t('Coordinación general de la caravana.'),
  },
  {
    slug: 'route',
    name: t('Ruta'),
    shortName: t('Ruta'),
    description: t('Avisos de tráfico, paradas y navegación.'),
  },
  {
    slug: 'chat',
    name: t('Charla'),
    shortName: t('Charla'),
    description: t('Conversación distendida del grupo.'),
  },
];


export const partyDestinations: PartyDestination[] = [
  {
    id: 'constanza',
    label: t('Constanza'),
    latitude: 18.9092,
    longitude: -70.7449,
  },
  {
    id: 'boca-chica',
    label: t('Boca Chica'),
    latitude: 18.4539,
    longitude: -69.61,
  },
  {
    id: 'jarabacoa',
    label: t('Jarabacoa'),
    latitude: 19.1215,
    longitude: -70.6422,
  },
  {
    id: 'punta-cana',
    label: t('Punta Cana'),
    latitude: 18.582,
    longitude: -68.4055,
  },
  {
    id: 'santiago',
    label: t('Santiago'),
    latitude: 19.4517,
    longitude: -70.697,
  },
];
