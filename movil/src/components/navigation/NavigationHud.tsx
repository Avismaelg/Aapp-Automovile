import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import { useMapChrome } from '@/src/components/navigation/glass';
import type { RouteInstruction, RouteInstructionIcon } from '@/src/lib/map-html';
import { curveSpeedLabel } from '@/src/lib/driving-line';
import { formatInstructionDistance, type nextInstruction } from '@/src/lib/route-instructions';
import { radius, spacing } from '@/src/theme';
import { displaySpeed, formatManeuverDistance, speedUnit, t } from '@/src/i18n';

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

// Paleta de navegación (negro OLED y naranja): paneles del color del mapa
// (negros de noche, blancos de día) y la maniobra en un bloque naranja.
const ALERT = '#e11d48';

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
  // Próxima curva de la línea de conducción que pide bajar la velocidad.
  curve: { distanceM: number; speedKmh: number } | null;
  northUp: boolean;
  // false cuando has movido el mapa a mano: aparece «Centrar».
  mapFollowing: boolean;
  onRecenter: () => void;
  muted: boolean;
  bottomInset: number;
  onToggleNorth: () => void;
  onToggleMute: () => void;
  onChangeRoute: () => void;
  onAddStop: () => void;
  onClose: () => void;
};

// Navegación activa: la maniobra manda arriba (flecha y distancia grandes,
// calle debajo) y abajo solo lo esencial: tiempo, distancia y llegada.
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
  curve,
  northUp,
  mapFollowing,
  onRecenter,
  muted,
  bottomInset,
  onToggleNorth,
  onToggleMute,
  onChangeRoute,
  onAddStop,
  onClose,
}: Props) {
  const speedNow = Number(speedLabel);
  const overLimit = limitKmh != null && Number.isFinite(speedNow) && speedNow > displaySpeed(limitKmh + 5);
  const curveUrgent = curve != null && Number.isFinite(speedNow) && speedNow > displaySpeed(curve.speedKmh + 15);
  const recalculating = offRoute || !hasRoute;
  const chrome = useMapChrome();
  const panel = { backgroundColor: chrome.bg, borderColor: chrome.border, borderWidth: 1 };

  return (
    <View pointerEvents="box-none" style={styles.navLayer}>
      <View style={[styles.maneuverCard, panel]}>
        {recalculating ? (
          <View style={styles.maneuverRow}>
            <View style={[styles.maneuverIcon, { backgroundColor: chrome.accent }]}>
              <Ionicons name="sync" size={30} color={chrome.onAccent} />
            </View>
            <AppText variant="h2" color={chrome.text} style={styles.flex}>
              {offRoute ? 'Recalculando…' : t('Calculando ruta…')}
            </AppText>
          </View>
        ) : (
          <View style={styles.maneuverRow}>
            <View style={[styles.maneuverIcon, { backgroundColor: chrome.accent }]}>
              <Ionicons name={upcoming ? instructionIcons[upcoming.icon] : 'arrow-up'} size={40} color={chrome.onAccent} />
            </View>
            <View style={styles.flex}>
              <AppText variant="display" color={chrome.text} style={styles.maneuverDistance}>
                {upcoming ? formatInstructionDistance(upcoming.remainingM) : t('Sigue recto')}
              </AppText>
              <AppText variant="bodyStrong" color={chrome.textSoft} numberOfLines={2} style={styles.road}>
                {upcoming
                  ? upcoming.icon !== 'arrive' && upcoming.road
                    ? upcoming.road
                    : upcoming.text
                  : t('Continúa por la ruta')}
              </AppText>
            </View>
          </View>
        )}
        {following && !recalculating ? (
          <View style={[styles.thenRow, { backgroundColor: chrome.chip }]}>
            <AppText variant="caption" color={chrome.muted}>
              {t('Luego')}
            </AppText>
            <Ionicons name={instructionIcons[following.icon]} size={16} color={chrome.text} />
          </View>
        ) : null}
      </View>

      {curve ? (
        <View style={[styles.curveBadge, curveUrgent && styles.curveBadgeUrgent]}>
          <Ionicons name="warning" size={14} color={curveUrgent ? '#ffffff' : '#422006'} />
          <AppText variant="bodyStrong" color={curveUrgent ? '#ffffff' : '#422006'} style={styles.curveText}>
            {t('Curva en')}{' '}{formatManeuverDistance(curve.distanceM)} ·{' '}
            {curveSpeedLabel(curve.speedKmh)}{' '}{speedUnit()}
          </AppText>
        </View>
      ) : null}

      <View style={styles.leftColumn}>
        {limitKmh != null ? (
          <View style={styles.speedLimit}>
            <AppText variant="bodyStrong" style={styles.speedLimitText}>
              {displaySpeed(limitKmh)}
            </AppText>
          </View>
        ) : null}
        <View style={[styles.speedBubble, panel, overLimit && styles.speedBubbleOver]}>
          <AppText variant="display" color={overLimit ? '#ffffff' : chrome.text} style={styles.speedValue}>
            {speedLabel}
          </AppText>
          <AppText variant="caption" color={overLimit ? '#ffe4e6' : chrome.muted} style={styles.speedUnit}>
            {speedUnit()}
          </AppText>
        </View>
      </View>

      <View style={styles.sideButtons}>
        {!mapFollowing ? (
          <Pressable
            style={[styles.recenterButton, panel]}
            onPress={onRecenter}
            accessibilityRole="button"
            accessibilityLabel={t('Recentrar en tu posición')}
          >
            <Ionicons name="navigate" size={18} color={chrome.accent} />
            <AppText variant="bodyStrong" color={chrome.text} style={styles.recenterText}>
              {t('Centrar')}
            </AppText>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.roundButton, panel, northUp && { backgroundColor: chrome.accent }]}
          onPress={onToggleNorth}
          accessibilityRole="button"
          accessibilityLabel={t('Orientar el mapa al norte')}
        >
          <Ionicons name="compass-outline" size={22} color={northUp ? chrome.onAccent : chrome.text} />
        </Pressable>
        <Pressable
          style={[styles.roundButton, panel, muted && { backgroundColor: chrome.accent }]}
          onPress={onToggleMute}
          accessibilityRole="button"
          accessibilityLabel={muted ? t('Activar la voz') : t('Silenciar la voz')}
        >
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color={muted ? chrome.onAccent : chrome.text} />
        </Pressable>
      </View>

      <View
        style={[
          styles.bottomCard,
          { backgroundColor: chrome.bg, borderTopWidth: 1, borderColor: chrome.border },
          { paddingBottom: bottomInset + spacing.lg },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: chrome.border }]} />
        <View style={styles.bottomRow}>
          <Pressable
            style={[styles.closeButton, { backgroundColor: chrome.chip }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('Terminar la navegación')}
          >
            <Ionicons name="close" size={22} color={chrome.text} />
          </Pressable>
          <View style={styles.etaBlock}>
            <AppText variant="display" color={chrome.accent} style={styles.etaTime}>
              {remainingTimeLabel}
            </AppText>
            <AppText variant="body" color={chrome.textSoft} numberOfLines={1}>
              {remainingDistanceLabel}
              {arrivalLabel ? ` · ${arrivalLabel}` : ''}
            </AppText>
            <AppText variant="caption" color={chrome.textSoft} numberOfLines={1} style={styles.destination}>
              {destinationLabel}
            </AppText>
          </View>
          <Pressable
            style={[styles.closeButton, { backgroundColor: chrome.chip }]}
            onPress={onAddStop}
            accessibilityRole="button"
            accessibilityLabel={t('Añadir parada')}
          >
            <Ionicons name="add-circle-outline" size={22} color={chrome.text} />
          </Pressable>
          <Pressable
            style={[styles.closeButton, { backgroundColor: chrome.chip }]}
            onPress={onChangeRoute}
            accessibilityRole="button"
            accessibilityLabel={t('Cambiar destino')}
          >
            <Ionicons name="search" size={20} color={chrome.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.2,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
};

const styles = StyleSheet.create({
  navLayer: { flex: 1 },
  flex: { flex: 1 },
  maneuverCard: {
    borderRadius: radius['2xl'],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
    ...SHADOW,
  },
  maneuverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  maneuverIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maneuverDistance: { fontSize: 38, lineHeight: 42 },
  road: { fontSize: 17, lineHeight: 22 },
  thenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  curveBadge: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fde047',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    ...SHADOW,
  },
  curveBadgeUrgent: { backgroundColor: ALERT },
  curveText: { fontSize: 13 },
  leftColumn: { position: 'absolute', left: 0, bottom: 168, alignItems: 'center', gap: spacing.sm },
  speedBubble: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW,
  },
  speedBubbleOver: { backgroundColor: ALERT },
  speedValue: { fontSize: 26, lineHeight: 28 },
  speedUnit: { fontSize: 10, marginTop: -2 },
  speedLimit: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: ALERT,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW,
  },
  speedLimitText: { fontSize: 15, color: '#0b1422' },
  sideButtons: { position: 'absolute', right: 0, bottom: 168, gap: spacing.sm, alignItems: 'flex-end' },
  recenterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    ...SHADOW,
  },
  recenterText: { fontSize: 15 },
  roundButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    ...SHADOW,
  },
  bottomCard: {
    position: 'absolute',
    left: -spacing.lg,
    right: -spacing.lg,
    bottom: -spacing.md,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#e2e8f0',
    marginBottom: spacing.sm,
  },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaBlock: { flex: 1, alignItems: 'center' },
  etaTime: { fontSize: 30, lineHeight: 34 },
  destination: { marginTop: 1 },
});
