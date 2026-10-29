// Modelos de dominio de la app. Los datos de demo viven en src/data/mock.ts.

export type Friend = {
  id: string;
  name: string;
  username: string;
  color: string;
  car: string;
  vehicleKind: VehicleKind;
  online: boolean;
  distanceKm?: number;
  status?: string;
};

export type PartyMember = Friend & {
  x: number;
  y: number;
  latitude: number;
  longitude: number;
  isHost?: boolean;
  isTalking?: boolean;
  battery?: number;
  role?: 'host' | 'sweeper' | 'member';
};

export type VehicleKind = 'car' | 'motorcycle' | 'ev' | 'truck';
export type FuelKind = 'gasoline' | 'diesel' | 'electric';
export type EnergyKind = 'fuel' | 'electric';

export type Vehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  nickname: string;
  color: string;
  odometerKm: number;
  kind: VehicleKind;
  fuel: FuelKind;
  efficiency: number;
  efficiencyUnit: 'km_l' | 'kwh_100km';
  qrSlug: string;
  qr: string;
  photoUrl?: string | null;
  isPrimary?: boolean;
  ownerId?: string;
  ownerUsername?: string;
  ownerName?: string;
  acquiredAt?: string;
};

export type ChallengeCategory = VehicleKind | 'mixed';

export type ChallengeParticipant = {
  id: string;
  name: string;
  username: string;
  color: string;
  vehicleKind: VehicleKind;
  vehicle: string;
  progress: number;
  etaMin: number;
  isMe?: boolean;
  rank?: number;
};

export type Challenge = {
  id: string;
  code: string;
  title: string;
  fromLabel: string;
  toLabel: string;
  distanceKm: number;
  category: ChallengeCategory;
  status: 'pending' | 'live' | 'finished';
  mode?: 'scheduled' | 'instant';
  elapsedSeconds: number;
  participants: ChallengeParticipant[];
  note?: string;
};

export type ChallengeRoute = {
  id: string;
  fromLabel: string;
  toLabel: string;
  distanceKm: number;
  etaMin: number;
};

export type FeedItem =
  | {
      id: string;
      type: 'drive';
      author: Friend;
      createdAt: string;
      title: string;
      distanceKm: number;
      durationMin: number;
      avgSpeed: number;
      likes: number;
      comments: number;
      note?: string;
      routeSeed: number;
    }
  | {
      id: string;
      type: 'photo';
      author: Friend;
      createdAt: string;
      caption: string;
      likes: number;
      comments: number;
      gradient: [string, string];
    }
  | {
      id: string;
      type: 'party';
      author: Friend;
      createdAt: string;
      title: string;
      members: number;
      distanceKm: number;
      likes: number;
      comments: number;
    }
  | {
      id: string;
      type: 'achievement';
      author: Friend;
      createdAt: string;
      title: string;
      subtitle: string;
      likes: number;
      comments: number;
    };

export type FuelLog = {
  id: string;
  vehicleId: string;
  kind: EnergyKind;
  date: string;
  station: string;
  /** Litros para gasolina/diésel; 0 en una carga eléctrica. */
  liters: number;
  /** kWh en una carga eléctrica. */
  kwh?: number;
  /** Precio por litro o por kWh. */
  pricePerLiter: number;
  total: number;
  odometer: number;
  fullTank: boolean;
};

export type MaintenanceKind =
  | 'oil'
  | 'tires'
  | 'brakes'
  | 'battery'
  | 'filters'
  | 'inspection'
  | 'other';

export type MaintenanceRecord = {
  id: string;
  vehicleId: string;
  kind: MaintenanceKind;
  title: string;
  date: string;
  odometerKm: number;
  cost: number;
  shop: string;
  notes?: string;
  nextKm?: number;
};
