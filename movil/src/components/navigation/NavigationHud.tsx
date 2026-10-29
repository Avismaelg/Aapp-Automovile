import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, IconButton } from '@/src/components/ui';
import type { RouteInstructionIcon } from '@/src/lib/map-html';
import { formatInstructionDistance, type nextInstruction } from '@/src/lib/route-instructions';
import { colors, radius, spacing } from '@/src/theme';

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

type Props = {
  upcoming: UpcomingInstruction | null;
  offRoute: boolean;
  hasRoute: boolean;
  remainingLabel: string;
  destinationLabel: string;
  speedLabel: string;
  limitKmh: number | null;
  northUp: boolean;
  bottomInset: number;
  onToggleNorth: () => void;
  onChangeRoute: () => void;
  onClose: () => void;
};

// Navegación activa: próxima maniobra arriba, velocidad y destino abajo.
export function NavigationHud({
  upcoming,
  offRoute,
  hasRoute,
  remainingLabel,
  destinationLabel,
  speedLabel,
  limitKmh,
  northUp,
  bottomInset,
  onToggleNorth,
  onChangeRoute,
  onClose,
}: Props) {
  return (
    <View pointerEvents="box-none" style={styles.navLayer}>
      <View style={styles.navTop}>
        <View style={styles.navInstructionRow}>
          <View style={styles.navInstructionIcon}>
            <Ionicons
              name={upcoming ? instructionIcons[upcoming.icon] : 'navigate'}
              size={24}
              color="#120802"
            />
          </View>
          <View style={styles.navInstructionText}>
            <AppText variant="h2" numberOfLines={2}>
              {upcoming ? upcoming.text : 'Sigue la ruta'}
            </AppText>
            {upcoming?.road && upcoming.icon !== 'arrive' ? (
              <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                {upcoming.road}
              </AppText>
            ) : null}
          </View>
          {upcoming ? (
            <AppText variant="h2" color={colors.lime} style={styles.navInstructionDistance}>
              {formatInstructionDistance(upcoming.remainingM)}
            </AppText>
          ) : null}
        </View>
        <View style={styles.navMetaRow}>
          <AppText variant="caption" color={colors.textSoft} numberOfLines={1}>
            {offRoute
              ? 'Fuera de ruta · recalculando…'
              : hasRoute
              ? remainingLabel
              : 'Calculando ruta por calles…'}
          </AppText>
          <View style={styles.navMetaDot} />
          <AppText
            variant="caption"
            color={colors.muted}
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {destinationLabel}
          </AppText>
        </View>
      </View>
      <View style={styles.navSpeed}>
        <View style={styles.speedRow}>
          <AppText variant="display" style={styles.navSpeedValue}>
            {speedLabel}
          </AppText>
          {limitKmh != null ? (
            <View style={styles.speedLimit}>
              <AppText variant="label" style={styles.speedLimitText}>
                {limitKmh}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="label" color={colors.muted}>
          km/h
        </AppText>
      </View>
      <Pressable
        style={[styles.navCompass, northUp && styles.navCompassActive]}
        onPress={onToggleNorth}
        accessibilityRole="button"
        accessibilityLabel="Orientar el mapa al norte"
      >
        <AppText variant="label" color={northUp ? '#120802' : colors.text} style={styles.modeText}>
          N
        </AppText>
      </Pressable>
      <View style={[styles.navBottomCard, { paddingBottom: bottomInset + spacing.md }]}>
        <View style={styles.navBottomSummary}>
          <View style={styles.navBottomText}>
            <AppText variant="label" color={colors.muted}>DESTINO</AppText>
            <AppText variant="h3" numberOfLines={1}>
              {destinationLabel}
            </AppText>
            <AppText variant="caption" color={offRoute ? colors.accent : colors.textSoft} numberOfLines={1}>
              {offRoute
                ? 'Recalculando una ruta nueva…'
                : remainingLabel}
            </AppText>
          </View>
          <IconButton
            icon="close"
            size={38}
            tone="ghost"
            onPress={onClose}
            accessibilityLabel="Cerrar navegación"
          />
        </View>
        <View style={styles.navActions}>
          <Pressable
            style={styles.navButtonDark}
            onPress={onChangeRoute}
            accessibilityRole="button"
            accessibilityLabel="Cambiar ruta"
          >
            <Ionicons name="swap-horizontal" size={18} color={colors.text} />
            <AppText variant="bodyStrong" color={colors.text}>
              Cambiar ruta
            </AppText>
          </Pressable>
          <Pressable
            style={styles.navButtonLime}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar ruta"
          >
            <Ionicons name="close" size={18} color="#120802" />
            <AppText variant="bodyStrong" color="#120802">
              Cerrar ruta
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  speedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  speedLimit: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#ff4d5e',
    backgroundColor: '#f4f6f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedLimitText: { fontSize: 11, color: '#0b0f14' },
  navCompass: {
    position: 'absolute',
    right: 0,
    bottom: 164,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,8,11,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  navCompassActive: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
  },
  modeText: { fontSize: 11 },
  navLayer: { flex: 1 },
  navTop: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(6,8,11,0.72)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201,255,77,0.25)',
  },
  navInstructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  navInstructionIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navInstructionText: { flex: 1 },
  navInstructionDistance: { fontSize: 22 },
  navMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  navMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.dim,
  },
  navSpeed: {
    position: 'absolute',
    left: 0,
    bottom: 164,
    alignItems: 'center',
    backgroundColor: 'rgba(6,8,11,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  navSpeedValue: { fontSize: 40, lineHeight: 44 },
  navBottomCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6,8,11,0.94)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(201,255,77,0.24)',
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  navBottomSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  navBottomText: { flex: 1, gap: 2 },
  navActions: {
    flexDirection: 'row',
    gap: 10,
  },
  navButtonDark: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    backgroundColor: 'rgba(6,8,11,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.xl,
  },
  navButtonLime: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    backgroundColor: colors.lime,
    borderRadius: radius.xl,
  },
});
