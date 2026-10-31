import { describe, expect, it } from '@jest/globals';

import {
  convoyDestinationAction,
  destinationKey,
  sameDestination,
  shouldShareMyDestination,
  type PartyDestination,
  type Point,
} from '@/src/lib/convoy';

// Varios cambios de ruta seguidos en un convoy de 4, con las mismas reglas
// que la pantalla del mapa (app/(tabs)/index.tsx):
// - quien cambia el destino lo comparte, venga de donde venga el cambio;
// - quien iba siguiendo el convoy cambia solo; quien iba a su aire recibe
//   la oferta; nadie se pisa en bucle.

type Phone = {
  id: string;
  dest: (Point & { label: string; personal?: boolean }) | null;
  navigating: boolean;
  sharedKey: string | null; // sharedKeyRef
  followedKey: string | null; // followedKeyRef
  handledAt: string | null; // handledAtRef / dismissed
  offers: string[];
  autoFollows: string[];
};

const PLACES = {
  malecon: { latitude: 18.4735, longitude: -69.8857, label: 'Malecón' },
  cafe: { latitude: 18.4801, longitude: -69.8702, label: 'Café' },
  playa: { latitude: 18.4402, longitude: -69.6501, label: 'Playa' },
  gasolinera: { latitude: 18.4601, longitude: -69.9302, label: 'Gasolinera' },
  miCoche: { latitude: 18.4861, longitude: -69.9312, label: 'Mi coche', personal: true },
};

function world() {
  let party: PartyDestination | null = null;
  let writes = 0;
  let clock = 0;
  const phones: Phone[] = ['ismael', 'laura', 'pedro', 'marta'].map((id) => ({
    id,
    dest: null,
    navigating: false,
    sharedKey: null,
    followedKey: null,
    handledAt: null,
    offers: [],
    autoFollows: [],
  }));

  // Un «render + efectos» de un teléfono tras cualquier cambio.
  const settle = (phone: Phone) => {
    // Efecto de compartir.
    const decision = shouldShareMyDestination({
      previousKey: phone.sharedKey,
      mine: phone.dest,
      party,
      navigating: phone.navigating,
      personal: Boolean(phone.dest?.personal),
    });
    phone.sharedKey = decision.key;
    if (decision.share && phone.dest) {
      writes += 1;
      clock += 1;
      party = {
        latitude: phone.dest.latitude,
        longitude: phone.dest.longitude,
        label: phone.dest.label,
        setBy: phone.id,
        setAt: `t${clock}`,
      };
    }
    // Efecto «recuerda lo que sigues».
    if (phone.navigating && party && sameDestination(phone.dest, party)) {
      phone.followedKey = destinationKey(phone.dest);
      phone.handledAt = party.setAt;
    }
    // Efecto «cambia solo si lo seguías».
    const action = convoyDestinationAction({
      me: phone.id,
      party,
      mine: phone.dest,
      navigating: phone.navigating,
      handledAt: phone.handledAt,
      followedKey: phone.followedKey,
    });
    if (action === 'follow' && party) {
      phone.handledAt = party.setAt;
      phone.dest = { latitude: party.latitude, longitude: party.longitude, label: party.label };
      phone.autoFollows.push(party.label);
      settle(phone);
    } else if (action === 'offer' && party && phone.offers[phone.offers.length - 1] !== party.setAt) {
      phone.offers.push(party.setAt!);
    }
  };
  const settleAll = () => {
    for (let round = 0; round < 3; round += 1) phones.forEach(settle);
  };
  const navigate = (phone: Phone, place: Phone['dest']) => {
    phone.dest = place;
    phone.navigating = true;
    settleAll();
  };
  const acceptOffer = (phone: Phone) => {
    if (!party) return;
    phone.handledAt = party.setAt;
    navigate(phone, { latitude: party.latitude, longitude: party.longitude, label: party.label });
  };
  return { phones, navigate, acceptOffer, settleAll, get party() { return party; }, get writes() { return writes; } };
}

describe('cambios de ruta en el convoy', () => {
  it('cada cambio llega a todos, no solo el primero', () => {
    const w = world();
    const [ismael, laura, pedro, marta] = w.phones;

    // 1. Ismael elige el Malecón: a los demás les sale «Ir con el convoy».
    w.navigate(ismael, PLACES.malecon);
    expect(w.party?.label).toBe('Malecón');
    for (const phone of [laura, pedro, marta]) expect(phone.offers).toHaveLength(1);
    w.acceptOffer(laura);
    w.acceptOffer(pedro);
    w.acceptOffer(marta);

    // 2. Ismael cambia a Café (desde el buscador, navegando): los 3 cambian solos.
    w.navigate(ismael, PLACES.cafe);
    expect(w.party?.label).toBe('Café');
    for (const phone of [laura, pedro, marta]) {
      expect(phone.dest?.label).toBe('Café');
      expect(phone.autoFollows).toEqual(['Café']);
    }

    // 3. Y otra vez, a la Playa.
    w.navigate(ismael, PLACES.playa);
    for (const phone of [laura, pedro, marta]) expect(phone.dest?.label).toBe('Playa');

    // 4. Ahora es Laura quien cambia (a la gasolinera): todos la siguen.
    w.navigate(laura, PLACES.gasolinera);
    expect(w.party?.label).toBe('Gasolinera');
    expect(w.party?.setBy).toBe('laura');
    for (const phone of [ismael, pedro, marta]) expect(phone.dest?.label).toBe('Gasolinera');

    // 4 cambios = 4 escrituras: nadie reenvía el destino que acaba de seguir.
    expect(w.writes).toBe(4);
  });

  it('quien va a su aire no cambia solo: recibe la oferta de cada cambio', () => {
    const w = world();
    const [ismael, laura] = w.phones;
    w.navigate(ismael, PLACES.malecon);
    w.navigate(laura, PLACES.miCoche); // va a por su coche (personal)
    expect(w.party?.label).toBe('Malecón'); // no se compartió «Mi coche»
    w.navigate(ismael, PLACES.cafe);
    w.navigate(ismael, PLACES.playa);
    expect(laura.dest?.label).toBe('Mi coche');
    expect(laura.offers.length).toBeGreaterThanOrEqual(3);
    expect(w.writes).toBe(3);
  });

  it('un destino personal o de prueba nunca se comparte', () => {
    const w = world();
    const [ismael] = w.phones;
    w.navigate(ismael, PLACES.miCoche);
    w.navigate(ismael, { ...PLACES.cafe, personal: true });
    expect(w.party).toBeNull();
    expect(w.writes).toBe(0);
  });

  it('volver a elegir el mismo destino no vuelve a escribir', () => {
    const w = world();
    const [ismael] = w.phones;
    w.navigate(ismael, PLACES.malecon);
    w.navigate(ismael, PLACES.malecon);
    w.settleAll();
    expect(w.writes).toBe(1);
  });
});
