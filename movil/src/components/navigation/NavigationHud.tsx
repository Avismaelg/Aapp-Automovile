import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import type { RouteInstruction, RouteInstructionIcon } from '@/src/lib/map-html';
import { formatInstructionDistance, type nextInstruction } from '@/src/lib/route-instructions';
import { radius, spacing } from '@/src/theme';

type UpcomingInstruction = NonNullable<ReturnType<typeof nextInstruction>>;

const instructionIcons: Record<RouteInstructionIcon, keyof typeof Ionicons.glyphMap> = {
  straight: 'arrow-up',
  left: 'arrow-back',
  right: 'arrow-forward',
  'slight-left': 'return-up-back',
  'slight-right': 'return-up-forward',
  'sharp-left': 'arrow-back',
  'sharp-right': 'arrow-forward',
  uturn: 'refresh',
  roundabout: 'sync',
  merge: 'git-merge',
  arrive: 'flag',
  depart: 'navigate',
};

const ROUTE_BLUE = '#2f8cff';
const INK = '#0b1422';

type Props = {
  upcoming: UpcomingInstruction | null;
  following: RouteInstruction | null;
  offRoute: boolean;
  hasRoute: boolean;
  arrivalLabel: string | null;
  remainingTimeLabel: string;
  remainingDistanceLabel: string;
  destinationLabel: string;
  speedLabel: string;
  limitKmh: number | null;
  northUp: boolean;
  muted: boolean;
  bottomInset: number;
  onToggleNorth: () => void;
  onToggleMute: () => void;
  onChangeRoute: () => void;
  onClose: () => void;
};

// Navegación activa: la maniobra manda arriba (distancia grande, calle
// debajo) y abajo solo lo esencial: hora de llegada, tiempo y distancia.
export function NavigationHud({
  upcoming,
  following,
  offRoute,
  hasRoute,
  arrivalLabel,
  remainingTimeLabel,
  remainingDistanceLabel,
  destinationLabel,
  speedLabel,
  limitKmh,
  northUp,
  muted,
  bottomInset,
  onToggleNorth,
  onToggleMute,
  onChangeRoute,
  onClose,
}: Props) {
  const overLimit = limitKmh != null && Number(speedLabel) > limitKmh + 5;

  return (
    <View pointerEvents="box-none" style={styles.navLayer}>
      <View style={styles.maneuverCard}>
        {offRoute || !hasRoute ? (
          <View style={styles.maneuverRow}>
            <Ionicons name="reload" size={30} color="#ffffff" />
            <AppText variant="h2" color="#ffffff" style={styles.maneuverFlex}>
              {offRoute ? 'Recalculando ruta…' : 'Calculando ruta…'}
            </AppText>
          </View>
        ) : (
          <View style={styles.maneuverRow}>
            <View style={styles.maneuverIcon}>
              <Ionicons
                name={upcoming ? instructionIcons[upcoming.icon] : 'arrow-up'}
                size={38}
                color={ROUTE_BLUE}
              />
            </View>
            <View style={styles.maneuverFlex}>
              <AppText variant="display" color="#ffffff" style={styles.maneuverDistance}>
                {upcoming ? formatInstructionDistance(upcoming.remainingM) : 'Sigue recto'}
              </AppText>
              <AppText variant="bodyStrong" color="#ffffff" numberOfLines={2}>
                {upcoming
                  ? upcoming.icon !== 'arrive' && upcoming.road
                    ? upcoming.road
                    : upcoming.text
                  : 'Continúa por la ruta'}
              </AppText>
            </View>
          </View>
        )}
      </View>
      {following && !offRoute ? (
        <View style={styles.thenPill}>
          <AppText variant="caption" color="#ffffff">
            Luego
          </AppText>
          <Ionicons name={instructionIcons[following.icon]} size={16} color="#ffffff" />
        </View>
      ) : null}

      <View style={[styles.speedBubble, overLimit && styles.speedBubbleOver]}>
        <AppText variant="h1" color={overLimit ? '#ffffff' : INK} style={styles.speedValue}>
          {speedLabel}
        </AppText>
        <AppText variant="label" color={overLimit ? '#ffffff' : '#5b6675'} style={styles.speedUnit}>
          km/h
        </AppText>
      </View>
      {limitKmh != null ? (
        <View style={styles.speedLimit}>
          <AppText variant="label" style={styles.speedLimitText}>
            {limitKmh}
          </AppText>
        </View>
      ) : null}

      <View style={styles.sideButtons}>
        <Pressable
          style={[styles.roundButton, northUp && styles.roundButtonActive]}
          onPress={onToggleNorth}
          accessibilityRole="button"
          accessibilityLabel="Orientar el mapa al norte"
        >
          <AppText variant="label" color={northUp ? '#ffffff' : INK} style={styles.northText}>
            N
          </AppText>
        </Pressable>
        <Pressable
          style={[styles.roundButton, muted && styles.roundButtonMuted]}
          onPress={onToggleMute}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Activar la voz' : 'Silenciar la voz'}
        >
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color={muted ? '#ffffff' : INK} />
        </Pressable>
      </View>

      <View style={[styles.bottomCard, { paddingBottom: bottomInset + spacing.md }]}>
        <Pressable
          style={styles.closeButton}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Terminar la navegación"
        >
          <Ionicons name="close" size={22} color="#ffffff" />
        </Pressable>
        <View style={styles.etaBlock}>
          <AppText variant="h1" color={INK} style={styles.etaTime}>
            {arrivalLabel ?? '--:--'}
          </AppText>
          <AppText variant="caption" color="#5b6675" numberOfLines={1}>
            {remainingTimeLabel} · {remainingDistanceLabel} · {destinationLabel}
          </AppText>
        </View>
        <Pressable
          style={styles.routesButton}
          onPress={onChangeRoute}
          accessibilityRole="button"
          accessibilityLabel="Cambiar destino"
        >
          <Ionicons name="swap-vertical" size={20} color={INK} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navLayer: { flex: 1 },
  maneuverCard: {
    backgroundColor: ROUTE_BLUE,
    borderRadius: radius['2xl'],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  maneuverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  maneuverIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  maneuverFlex: { flex: 1 },
  maneuverDistance: { fontSize: 34, lineHeight: 38 },
  thenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 6,
    marginLeft: spacing.md,
    backgroundColor: '#1b5fbf',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  speedBubble: {
    position: 'absolute',
    left: 0,
    bottom: 128,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#d7dee7',
    elevation: 5,
  },
  speedBubbleOver: { backgroundColor: '#e5394a', borderColor: '#e5394a' },
  speedValue: { fontSize: 26, lineHeight: 28 },
  speedUnit: { fontSize: 8 },
  speedLimit: {
    position: 'absolute',
    left: 56,
    bottom: 186,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: '#e5394a',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedLimitText: { fontSize: 11, color: INK },
  sideButtons: {
    position: 'absolute',
    right: 0,
    bottom: 128,
    gap: spacing.sm,
  },
  roundButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    elevation: 5,
  },
  roundButtonActive: { backgroundColor: ROUTE_BLUE },
  roundButtonMuted: { backgroundColor: '#5b6675' },
  northText: { fontSize: 13 },
  bottomCard: {
    position: 'absolute',
    left: -spacing.lg,
    right: -spacing.lg,
    bottom: -spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    elevation: 10,
  },
  closeButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#e5394a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaBlock: { flex: 1, alignItems: 'center' },
  etaTime: { fontSize: 28, lineHeight: 32 },
  routesButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#eef2f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
