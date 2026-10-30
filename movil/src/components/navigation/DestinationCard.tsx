import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import { useMapChrome } from '@/src/components/navigation/glass';
import { radius, spacing } from '@/src/theme';

export type RouteOption = {
  timeLabel: string;
  distanceLabel: string;
  // Minutos más que la más rápida; 0 en la más rápida.
  extraMinutes: number;
};

const GO = '#1a73e8';
const FAST = '#16a34a';

// Vista previa de la ruta: hoja inferior con el tiempo en grande, las
// opciones de ruta y un único botón principal para empezar.
export function DestinationCard({
  label,
  timeLabel,
  distanceLabel,
  arrivalLabel,
  loading,
  error,
  options,
  selected,
  canConfirm,
  bottomInset,
  onRetry,
  onSelect,
  onConfirm,
  onShare,
  onClose,
}: {
  label: string;
  timeLabel: string | null;
  distanceLabel: string | null;
  arrivalLabel: string | null;
  loading: boolean;
  error: string | null;
  options: RouteOption[];
  selected: number;
  canConfirm: boolean;
  bottomInset: number;
  onRetry: () => void;
  onSelect: (index: number) => void;
  onConfirm: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  const chrome = useMapChrome();
  const failed = Boolean(error) && !loading;

  return (
    <View style={[styles.sheet, chrome.surface, { paddingBottom: bottomInset + spacing.lg }]}>
      <View style={[styles.handle, { backgroundColor: chrome.border }]} />

      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <AppText variant="caption" color={chrome.muted}>
            Destino
          </AppText>
          <AppText variant="h2" color={chrome.text} numberOfLines={1} style={styles.title}>
            {label}
          </AppText>
        </View>
        <Pressable
          onPress={onShare}
          hitSlop={6}
          style={[styles.iconButton, { backgroundColor: chrome.chip }]}
          accessibilityRole="button"
          accessibilityLabel="Compartir ruta"
        >
          <Ionicons name="share-outline" size={19} color={chrome.text} />
        </Pressable>
        <Pressable
          onPress={onClose}
          hitSlop={6}
          style={[styles.iconButton, { backgroundColor: chrome.chip }]}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        >
          <Ionicons name="close" size={20} color={chrome.text} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.stateRow}>
          <ActivityIndicator color={GO} />
          <AppText variant="body" color={chrome.muted}>
            Buscando la mejor ruta…
          </AppText>
        </View>
      ) : failed ? (
        <View style={styles.stateRow}>
          <Ionicons name="cloud-offline-outline" size={20} color="#e11d48" />
          <AppText variant="body" color={chrome.textSoft} numberOfLines={2} style={styles.flex}>
            {error}
          </AppText>
        </View>
      ) : timeLabel ? (
        <View style={styles.summary}>
          <AppText variant="display" color={FAST} style={styles.time}>
            {timeLabel}
          </AppText>
          <AppText variant="body" color={chrome.muted} style={styles.summaryDetail}>
            {distanceLabel}
            {arrivalLabel ? ` · llegas ${arrivalLabel}` : ''}
          </AppText>
        </View>
      ) : null}

      {options.length > 1 && !loading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>
          {options.map((option, index) => {
            const active = index === selected;
            return (
              <Pressable
                key={index}
                style={[
                  styles.option,
                  { borderColor: active ? GO : chrome.border, backgroundColor: active ? `${GO}14` : 'transparent' },
                ]}
                onPress={() => onSelect(index)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Ruta ${index + 1}: ${option.timeLabel}, ${option.distanceLabel}`}
              >
                <AppText variant="bodyStrong" color={active ? GO : chrome.text}>
                  {option.timeLabel}
                </AppText>
                <AppText variant="caption" color={chrome.muted}>
                  {option.extraMinutes === 0 ? 'Más rápida' : `+${option.extraMinutes} min`} · {option.distanceLabel}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {failed ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Ionicons name="refresh" size={20} color="#ffffff" />
          <AppText variant="bodyStrong" color="#ffffff" style={styles.primaryText}>
            Reintentar
          </AppText>
        </Pressable>
      ) : (
        <Pressable
          onPress={onConfirm}
          disabled={!canConfirm}
          style={({ pressed }) => [styles.primary, !canConfirm && styles.disabled, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canConfirm }}
        >
          <Ionicons name="navigate" size={20} color="#ffffff" />
          <AppText variant="bodyStrong" color="#ffffff" style={styles.primaryText}>
            Iniciar
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    marginHorizontal: -spacing.lg,
    marginBottom: -spacing.md,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderBottomWidth: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titleBlock: { flex: 1 },
  title: { fontSize: 22, lineHeight: 28 },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  flex: { flex: 1 },
  summary: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md, flexWrap: 'wrap' },
  time: { fontSize: 34, lineHeight: 40 },
  summaryDetail: { fontSize: 15 },
  options: { gap: spacing.sm },
  option: {
    minWidth: 128,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  primary: {
    height: 56,
    borderRadius: 28,
    backgroundColor: GO,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryText: { fontSize: 17 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
});
