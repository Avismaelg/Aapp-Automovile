import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import { useMapChrome } from '@/src/components/navigation/glass';
import { colors, radius, spacing } from '@/src/theme';

export type RouteOption = {
  timeLabel: string;
  distanceLabel: string;
  // Minutos más que la más rápida; 0 en la más rápida.
  extraMinutes: number;
};


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
  stops,
  onAddStop,
  onRemoveStop,
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
  stops: { label: string }[];
  onAddStop: () => void;
  onRemoveStop: (index: number) => void;
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
          <ActivityIndicator color={chrome.accent} />
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
          <AppText variant="display" color={chrome.accent} style={styles.time}>
            {timeLabel}
          </AppText>
          <AppText variant="body" color={chrome.muted} style={styles.summaryDetail}>
            {distanceLabel}
            {arrivalLabel ? ` · llegas ${arrivalLabel}` : ''}
          </AppText>
        </View>
      ) : null}

      {stops.map((stop, index) => (
        <View key={`${stop.label}-${index}`} style={styles.stopRow}>
          <View style={styles.stopBadge}>
            <AppText variant="caption" color="#ffffff" style={styles.stopBadgeText}>
              {index + 1}
            </AppText>
          </View>
          <AppText variant="body" color={chrome.text} numberOfLines={1} style={styles.flex}>
            {stop.label}
          </AppText>
          <Pressable
            onPress={() => onRemoveStop(index)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Quitar parada ${stop.label}`}
          >
            <Ionicons name="close" size={18} color={chrome.muted} />
          </Pressable>
        </View>
      ))}
      <Pressable
        onPress={onAddStop}
        style={({ pressed }) => [styles.addStop, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Ionicons name="add-circle-outline" size={18} color={chrome.accent} />
        <AppText variant="bodyStrong" color={chrome.accent} style={styles.addStopText}>
          Añadir parada
        </AppText>
      </Pressable>

      {options.length > 1 && !loading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>
          {options.map((option, index) => {
            const active = index === selected;
            return (
              <Pressable
                key={index}
                style={[
                  styles.option,
                  { borderColor: active ? chrome.accent : chrome.border, backgroundColor: active ? `${chrome.accent}1F` : 'transparent' },
                ]}
                onPress={() => onSelect(index)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Ruta ${index + 1}: ${option.timeLabel}, ${option.distanceLabel}`}
              >
                <AppText variant="bodyStrong" color={active ? chrome.accent : chrome.text}>
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
          style={({ pressed }) => [styles.primary, { backgroundColor: chrome.accent }, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Ionicons name="refresh" size={20} color={chrome.onAccent} />
          <AppText variant="bodyStrong" color={chrome.onAccent} style={styles.primaryText}>
            Reintentar
          </AppText>
        </Pressable>
      ) : (
        <Pressable
          onPress={onConfirm}
          disabled={!canConfirm}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: chrome.accent },
            !canConfirm && styles.disabled,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canConfirm }}
        >
          <Ionicons name="navigate" size={20} color={chrome.onAccent} />
          <AppText variant="bodyStrong" color={chrome.onAccent} style={styles.primaryText}>
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
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stopBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBadgeText: { fontWeight: '800', fontSize: 12 },
  addStop: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 2 },
  addStopText: { fontSize: 14 },
  primary: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryText: { fontSize: 17 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
});
