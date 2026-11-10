import { useEffect, useRef, useState } from 'react';

import { useSetPartyDestination, type PartyView } from '@/src/hooks/useParty';
import { t } from '@/src/i18n';
import { markAlertsSeen } from '@/src/lib/background-alerts';
import {
  convoyDestinationAction,
  destinationKey as convoyDestinationKey,
  reachedConvoyGoal,
  sameDestination,
  shouldShareMyDestination,
  type PartyDestination,
  type Point,
} from '@/src/lib/convoy';
import { setConvoyProgress } from '@/src/lib/live-share';
import { useChosenDestination, type ChosenDestination } from '@/src/store/destination';

// El destino del convoy en los dos sentidos: el tuyo se comparte con la party
// (si te toca fijarlo) y el que fija otro piloto te llega (cambias solo si lo
// ibas siguiendo; si no, «Ir con el convoy»). También publica tu ETA hacia la
// meta común. Sale de la pantalla del mapa (app/(tabs)/index.tsx) tal cual.
export function useConvoySync({
  party,
  isDemo,
  meId,
  location,
  destination,
  partyDestination,
  isNavigating,
  remainingRouteM,
  remainingTimeMs,
  beginNavigation,
}: {
  party: PartyView | null | undefined;
  isDemo: boolean;
  meId: string;
  location: Point;
  destination: ChosenDestination | null;
  partyDestination: PartyDestination | null;
  isNavigating: boolean;
  remainingRouteM: number | null;
  remainingTimeMs: number | null;
  // Seguir el mapa, centrarlo en ti y arrancar la navegación.
  beginNavigation: () => void;
}) {
  // CONV-04: tu ETA y lo que te queda hasta la meta común viajan con tu
  // posición (también con la pantalla bloqueada). Solo si vas hacia la meta.
  const headingToConvoyGoal =
    Boolean(party) && !isDemo && isNavigating && Boolean(destination) && sameDestination(destination, partyDestination);
  const convoyArrived = headingToConvoyGoal && reachedConvoyGoal(location, partyDestination, remainingRouteM);
  useEffect(() => {
    if (!headingToConvoyGoal || remainingRouteM == null || remainingTimeMs == null) {
      setConvoyProgress(null);
      return;
    }
    setConvoyProgress({
      etaS: remainingTimeMs / 1000,
      remainingM: remainingRouteM,
      arrived: convoyArrived,
    });
  }, [headingToConvoyGoal, remainingRouteM, remainingTimeMs, convoyArrived]);

  // En una party, el destino que eliges se comparte con el convoy (salvo ir
  // a por tu coche, que es solo tuyo).
  const setPartyDestination = useSetPartyDestination();
  const shareDestinationWithConvoy = setPartyDestination.mutate;

  // Cada destino nuevo que eliges navegando se comparte con el convoy, venga
  // de donde venga (antes solo el primero, al pulsar Ir en el mapa). Al abrir
  // la app se toma el destino actual como ya compartido: así un destino viejo
  // no pisa el que haya puesto otro piloto mientras tanto.
  const sharedKeyRef = useRef<string | null | undefined>(undefined);
  // CONV-02: solo el anfitrión o un copiloto cambian el destino del convoy.
  const canSetConvoyDestination =
    Boolean(party?.isHost) || party?.members.find((member) => member.isMe)?.role === 'sweeper';
  const partyIdForShare = party && !isDemo && canSetConvoyDestination ? party.id : null;
  useEffect(() => {
    if (!partyIdForShare) {
      sharedKeyRef.current = undefined;
      return;
    }
    if (sharedKeyRef.current === undefined) {
      sharedKeyRef.current = isNavigating ? convoyDestinationKey(destination) : null;
      return;
    }
    const decision = shouldShareMyDestination({
      previousKey: sharedKeyRef.current,
      mine: destination,
      party: partyDestination,
      navigating: isNavigating,
      personal: Boolean(destination?.personal),
    });
    sharedKeyRef.current = decision.key;
    if (decision.share && destination) {
      shareDestinationWithConvoy({
        partyId: partyIdForShare,
        label: destination.label,
        lat: destination.latitude,
        lng: destination.longitude,
      });
    }
  }, [partyIdForShare, isNavigating, destination, partyDestination, shareDestinationWithConvoy]);

  // Otro piloto fijó o cambió el destino. Si ibas siguiendo el convoy,
  // cambias solo (con un aviso); si no, «Ir con el convoy» con un toque.
  const [dismissedConvoyAt, setDismissedConvoyAt] = useState<string | null>(null);
  const [convoyNotice, setConvoyNotice] = useState<{ name: string; label: string } | null>(null);
  const followedKeyRef = useRef<string | null>(null);
  const handledAtRef = useRef<string | null>(null);
  const convoyDestinationSetter = party?.members.find((member) => member.userId === partyDestination?.setBy);
  const setterName = convoyDestinationSetter?.profile.displayName ?? t('Un piloto');

  // Recuerda el destino del convoy que vas siguiendo.
  useEffect(() => {
    if (isNavigating && partyDestination && sameDestination(destination, partyDestination)) {
      followedKeyRef.current = convoyDestinationKey(destination);
      handledAtRef.current = partyDestination.setAt;
    }
  }, [isNavigating, destination, partyDestination]);

  // En pantalla: sin saber si lo ibas siguiendo, como mucho «ofrecer»; si lo
  // seguías, el efecto de abajo te cambia al momento y la oferta desaparece.
  const convoyAction = isDemo
    ? 'none'
    : convoyDestinationAction({
        me: meId,
        party: partyDestination,
        mine: destination,
        navigating: isNavigating,
        handledAt: dismissedConvoyAt,
        followedKey: null,
      });

  useEffect(() => {
    if (isDemo || !partyDestination) return;
    const action = convoyDestinationAction({
      me: meId,
      party: partyDestination,
      mine: destination,
      navigating: isNavigating,
      handledAt: handledAtRef.current,
      followedKey: followedKeyRef.current,
    });
    if (action !== 'follow') return;
    handledAtRef.current = partyDestination.setAt;
    useChosenDestination.getState().setDestination({
      latitude: partyDestination.latitude,
      longitude: partyDestination.longitude,
      label: partyDestination.label,
    });
    const notice = { name: setterName.split(' ')[0], label: partyDestination.label };
    const show = setTimeout(() => setConvoyNotice(notice), 0);
    const hide = setTimeout(() => setConvoyNotice(null), 7_000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [isDemo, meId, partyDestination, destination, isNavigating, setterName]);

  const offerConvoyDestination = convoyAction === 'offer' && partyDestination != null;
  // Lo que ya ves en pantalla no te llega luego como notificación.
  const partyIdForAlerts = party?.id;
  const destinationSetAt = partyDestination?.setAt;
  useEffect(() => {
    if (partyIdForAlerts && destinationSetAt) {
      void markAlertsSeen([`destination:${partyIdForAlerts}:${destinationSetAt}`]);
    }
  }, [partyIdForAlerts, destinationSetAt]);

  const followConvoyDestination = () => {
    if (!partyDestination) return;
    useChosenDestination.getState().setDestination({
      latitude: partyDestination.latitude,
      longitude: partyDestination.longitude,
      label: partyDestination.label,
    });
    setDismissedConvoyAt(partyDestination.setAt);
    beginNavigation();
  };

  return {
    convoyNotice,
    setterName,
    offerConvoyDestination,
    followConvoyDestination,
    // «Ahora no»: esa oferta no vuelve a salir.
    dismissConvoyDestination: setDismissedConvoyAt,
  };
}
