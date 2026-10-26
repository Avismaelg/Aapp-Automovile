import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WorldMap } from '@/src/components/WorldMap';
import { AppText, Avatar, IconButton } from '@/src/components/ui';
import { activeParty, partyMembers } from '@/src/data/mock';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useGarageVehicles } from '@/src/hooks/useGarage';
import { useGraphHopperRoute } from '@/src/hooks/useGraphHopperRoute';
import { useLiveLocation } from '@/src/hooks/useLiveLocation';
import { useActiveParty, usePartyLocation } from '@/src/hooks/useParty';
import { formatRouteDistance, formatRouteTime } from '@/src/lib/graphhopper';
import type {
  WorldMapDestination,
  WorldMapMember,
  WorldMapMode,
} from '@/src/lib/map-html';
import { colors, radius, shadows, spacing } from '@/src/theme';

const GLASS = 'rgba(6,8,11,0.74)';

const quickActions = [
  { label: 'Party', icon: 'radio' as const, color: colors.accent, href: '/(tabs)/party' },
  { label: 'Retos', icon: 'flag' as const, color: colors.lime, href: '/(tabs)/challenges' },
  { label: 'Repostar', icon: 'water' as const, color: colors.cyan, href: '/(tabs)/fuel' },
  { label: 'Conducir', icon: 'navigate' as const, color: '#FFB84D', href: '/drive' },
];

export default function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useCurrentUser();
  const live = useLiveLocation();
  const { party, isDemo } = useActiveParty();
  const { vehicles } = useGarageVehicles();
  const [mode, setMode] = useState<WorldMapMode>('3d');
  const [following, setFollowing] = useState(true);
  const [recenterToken, setRecenterToken] = useState(0);
  const [mapKey, setMapKey] = useState(0);
  const [mapError, setMapError] = useState<string | null>(null);

  usePartyLocation(party?.id, live.location, Boolean(party) && !isDemo && live.isLive);

  const mapMembers = useMemo<WorldMapMember[]>(() => {
    if (isDemo) {
      return partyMembers
        .filter((member) => member.username !== me.username)
        .map((member) => ({
          id: member.id,
          name: member.name,
          color: member.color,
          latitude: member.latitude,
          longitude: member.longitude,
          isTalking: member.isTalking,
          battery: member.battery,
        }));
    }
    return (party?.members ?? [])
      .filter((member) => !member.isMe && member.lastLat != null && member.lastLng != null)
      .map((member) => ({
        id: member.userId,
        name: member.profile.displayName,
        color: member.color,
        latitude: member.lastLat as number,
        longitude: member.lastLng as number,
        isTalking: false,
      }));
  }, [isDemo, me.username, party]);

  const destination = useMemo<WorldMapDestination | null>(() => {
    if (isDemo) {
      return {
        latitude: activeParty.destinationLatitude,
        longitude: activeParty.destinationLongitude,
        label: activeParty.destination.split(',')[0],
      };
    }
    if (party?.destinationLat != null && party.destinationLng != null) {
      return {
        latitude: party.destinationLat,
        longitude: party.destinationLng,
        label: party.destinationLabel ?? 'Destino',
      };
    }
    return null;
  }, [isDemo, party]);

  const route = useGraphHopperRoute({
    origin: live.location,
    destination: destination ?? live.location,
    enabled: Boolean(destination),
  });

  const primaryVehicle = vehicles.find((vehicle) => vehicle.isPrimary) ?? vehicles[0];
  const vehicleLabel = primaryVehicle
    ? primaryVehicle.nickname.trim() || `${primaryVehicle.make} ${primaryVehicle.model}`
    : 'Añade tu vehículo';
  const speedLabel =
    live.location.speedKmh == null ? '--' : String(Math.round(live.location.speedKmh));
  const inParty = Boolean(party) || isDemo;
  const partyName = isDemo ? activeParty.name : (party?.name ?? 'Party');
  const crewCount = isDemo ? partyMembers.length : (party?.members.length ?? 0);
  const routeLine = route.route
    ? `${formatRouteDistance(route.route.distanceM)} · ${formatRouteTime(route.route.timeMs)}`
    : null;
  const partySubtitle = [
    destination?.label ?? 'Sin destino',
    routeLine,
    `${crewCount} ${crewCount === 1 ? 'piloto' : 'pilotos'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const handleFollowChange = useCallback((value: boolean) => setFollowing(value), []);
  const handleMapError = useCallback((message: string) => setMapError(message), []);

  const recenter = () => {
    setFollowing(true);
    setRecenterToken((value) => value + 1);
  };

  const toggleMode = () => setMode((value) => (value === '3d' ? '2d' : '3d'));

  const retryMap = () => {
    setMapError(null);
    setFollowing(true);
    setMapKey((value) => value + 1);
  };

  return (
    <View style={styles.root}>
      <WorldMap
        key={mapKey}
        members={mapMembers}
        destination={destination}
        location={live.location}
        route={route.route}
        mode={mode}
        recenterToken={recenterToken}
        onFollowChange={handleFollowChange}
        onError={handleMapError}
        style={StyleSheet.absoluteFill}
      />

      <View
        pointerEvents="box-none"
        style={[
          styles.overlay,
          { paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md },
        ]}
      >
        <View style={styles.topRow}>
          <Pressable onPress={() => router.push('/(tabs)/profile')} hitSlop={6}>
            <Avatar
              name={me.name}
              color={me.color}
              size={42}
              uri={me.avatarUrl}
              ring={colors.border}
              online={live.isLive}
            />
          </Pressable>
          <Pressable style={styles.vehiclePill} onPress={() => router.push('/(tabs)/garage')}>
            <Ionicons name="car-sport" size={16} color={colors.accent} />
            <AppText variant="bodyStrong" numberOfLines={1} style={styles.vehicleText}>
              {vehicleLabel}
            </AppText>
            <Ionicons name="chevron-down" size={14} color={colors.muted} />
          </Pressable>
          <IconButton
            icon="newspaper-outline"
            size={42}
            onPress={() => router.push('/actividad' as Href)}
          />
        </View>

        {!live.isLive ? (
          <View style={styles.banner}>
            <View style={styles.bannerDot} />
            <AppText variant="caption" color={colors.textSoft} numberOfLines={2} style={styles.bannerText}>
              {live.message}
            </AppText>
            {live.status !== 'locating' ? (
              <Pressable onPress={live.retry} hitSlop={8}>
                <AppText variant="label" color={colors.lime} style={styles.retryText}>
                  REINTENTAR
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {mapError ? (
          <View style={[styles.banner, styles.bannerError]}>
            <Ionicons name="warning-outline" size={16} color={colors.accent} />
            <AppText variant="caption" color={colors.textSoft} numberOfLines={2} style={styles.bannerText}>
              {mapError}
            </AppText>
            <Pressable onPress={retryMap} hitSlop={8}>
              <AppText variant="label" color={colors.lime} style={styles.retryText}>
                REINTENTAR
              </AppText>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.spacer} pointerEvents="none" />

        <View style={styles.sideRow}>
          <View style={styles.speedHud}>
            <AppText variant="display" style={styles.speedValue}>
              {speedLabel}
            </AppText>
            <View style={styles.speedMeta}>
              <View style={[styles.liveDot, !live.isLive && styles.liveDotOff]} />
              <AppText variant="label" color={colors.muted} style={styles.speedUnit}>
                km/h · {live.isLive ? 'GPS' : 'DEMO'}
              </AppText>
            </View>
          </View>

          <View style={styles.controls}>
            <Pressable
              style={styles.roundControl}
              onPress={toggleMode}
              accessibilityRole="button"
              accessibilityLabel={mode === '3d' ? 'Cambiar a vista 2D' : 'Cambiar a vista 3D'}
            >
              <AppText variant="label" color={colors.text} style={styles.modeText}>
                {mode === '3d' ? '3D' : '2D'}
              </AppText>
            </Pressable>
            {!following ? (
              <Pressable
                style={[styles.roundControl, styles.roundControlAccent]}
                onPress={recenter}
                accessibilityRole="button"
                accessibilityLabel="Recentrar mapa"
              >
                <Ionicons name="navigate" size={20} color="#120802" />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.bottomCard}>
          <Pressable style={styles.partyRow} onPress={() => router.push('/(tabs)/party')}>
            <View style={[styles.partyIcon, !inParty && styles.partyIconEmpty]}>
              <Ionicons
                name={inParty ? 'radio' : 'add'}
                size={18}
                color={inParty ? '#120802' : colors.accent}
              />
            </View>
            <View style={styles.partyText}>
              <AppText variant="label" color={colors.muted} style={styles.partyLabel}>
                {inParty ? 'Party en vivo' : 'Sin party activa'}
              </AppText>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {inParty ? partyName : 'Crea o únete a una caravana'}
              </AppText>
              <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                {inParty ? partySubtitle : 'Invita a tus amigos con un código'}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>

          <View style={styles.quickRow}>
            {quickActions.map((action) => (
              <Pressable
                key={action.label}
                style={({ pressed }) => [styles.quickItem, pressed && { opacity: 0.7 }]}
                onPress={() => router.push(action.href as Href)}
              >
                <View
                  style={[
                    styles.quickIcon,
                    { backgroundColor: `${action.color}1F`, borderColor: `${action.color}40` },
                  ]}
                >
                  <Ionicons name={action.icon} size={18} color={action.color} />
                </View>
                <AppText variant="caption" color={colors.textSoft}>
                  {action.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable
          style={styles.attribution}
          hitSlop={6}
          onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}
        >
          <AppText variant="caption" color={colors.dim} style={styles.attributionText}>
            © OpenFreeMap · © OpenMapTiles · © OpenStreetMap · Relieve Mapzen
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  vehiclePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 42,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
  },
  vehicleText: { flex: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bannerError: { borderColor: 'rgba(255,90,31,0.4)' },
  bannerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  bannerText: { flex: 1 },
  retryText: { fontSize: 9 },
  spacer: { flex: 1 },
  sideRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  speedHud: {
    minWidth: 128,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  speedValue: { fontSize: 40, lineHeight: 44 },
  speedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  liveDotOff: { backgroundColor: colors.dim },
  speedUnit: { fontSize: 9 },
  controls: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  roundControl: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  roundControlAccent: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
  },
  modeText: { fontSize: 11 },
  bottomCard: {
    backgroundColor: 'rgba(11,15,20,0.94)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius['2xl'],
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  partyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyIconEmpty: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.3)',
  },
  partyText: { flex: 1 },
  partyLabel: { fontSize: 9 },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attribution: {
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  attributionText: { fontSize: 9 },
});
