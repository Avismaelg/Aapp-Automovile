import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, Button, Card, IconButton, Pill, Screen, SectionHeader } from '@/src/components/ui';
import { challengeRoutes } from '@/src/data/mock';
import { ActiveChallengeCard } from '@/src/components/challenges/ActiveChallengeCard';
import { CategoryPicker } from '@/src/components/challenges/CategoryPicker';
import { ChallengeStandings } from '@/src/components/challenges/ChallengeStandings';
import { FriendPicker } from '@/src/components/challenges/FriendPicker';
import { RecentResults } from '@/src/components/challenges/RecentResults';
import { RoutePicker } from '@/src/components/challenges/RoutePicker';
import { colors, radius, spacing } from '@/src/theme';
import { vehicleCategoryLabel } from '@/src/lib/vehicles';
import { useChallengeScreen, type ChallengeMode } from '@/src/hooks/useChallengeScreen';

const modeOptions: { key: ChallengeMode; label: string; icon: keyof typeof Ionicons.glyphMap; detail: string }[] = [
  {
    key: 'instant',
    label: 'Al momento',
    icon: 'flash',
    detail: 'Salida inmediata con 2+ pilotos',
  },
  {
    key: 'scheduled',
    label: 'Programado',
    icon: 'calendar-outline',
    detail: 'Invita a un rival y espera',
  },
];

export default function ChallengesScreen() {
  const {
    active,
    activeHostReady,
    activeIsHost,
    activeIsInvite,
    activeIsWaiting,
    activeReadyToStart,
    category,
    challengeFriends,
    challengeMode,
    challengesError,
    challengesLoading,
    chooseCategory,
    chooseMode,
    filteredFriends,
    finishChallenge,
    finishRealChallenge,
    friendsLoading,
    hasActive,
    isDemo,
    isFriendSelected,
    matchedFriend,
    matching,
    matchmake,
    me,
    pickInstantRivals,
    pressFriend,
    promptInstantStart,
    recentResults,
    refetchChallenges,
    respondChallenge,
    respondToChallenge,
    rival,
    router,
    selectedInstantFriends,
    selectRoute,
    selectedRouteId,
    sendChallenge,
    sentTo,
    shareChallenge,
    standings,
    startChallenge,
    startRealChallenge,
  } = useChallengeScreen();

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <AppText variant="label" color={colors.accent}>RETOS</AppText>
          <AppText variant="h1" style={{ marginTop: 4 }}>Desafía a tus amigos</AppText>
        </View>
        <IconButton icon="trophy-outline" tone="surface" />
      </View>

      {challengesLoading ? (
        <View style={styles.syncRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <AppText variant="caption" color={colors.muted}>Cargando tus retos…</AppText>
        </View>
      ) : null}

      {challengesError ? (
        <Card style={styles.errorCard}>
          <AppText variant="bodyStrong">No pudimos cargar tus retos</AppText>
          <AppText variant="caption" color={colors.muted}>
            Revisa tu conexión y vuelve a intentarlo.
          </AppText>
          <Button
            label="Reintentar"
            size="sm"
            variant="secondary"
            onPress={() => void refetchChallenges()}
            style={{ marginTop: spacing.sm }}
          />
        </Card>
      ) : null}

      <View style={styles.matchmakingPillRow}>
        <Pill
          label={challengeMode === 'instant' ? 'Reto al momento' : 'Modo programado'}
          tone="lime"
          icon={challengeMode === 'instant' ? 'flash' : 'calendar-outline'}
        />
        <Pill label="Punto A → punto B" tone="neutral" icon="flag-outline" />
      </View>

      <View style={styles.modeSwitch}>
        {modeOptions.map((option) => {
          const selected = option.key === challengeMode;
          return (
            <Pressable
              key={option.key}
              onPress={() => chooseMode(option.key)}
              style={[styles.modeOption, selected && styles.modeOptionActive]}
            >
              <View style={[styles.modeIcon, selected && styles.modeIconActive]}>
                <Ionicons
                  name={option.icon}
                  size={17}
                  color={selected ? '#120802' : colors.muted}
                />
              </View>
              <View style={styles.modeText}>
                <AppText
                  variant="bodyStrong"
                  numberOfLines={1}
                  color={selected ? colors.text : colors.textSoft}
                >
                  {option.label}
                </AppText>
                <AppText variant="caption" color={selected ? colors.muted : colors.dim} numberOfLines={1}>
                  {option.detail}
                </AppText>
              </View>
              {selected ? (
                <Ionicons name="checkmark-circle" size={15} color={colors.lime} style={styles.modeCheck} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {hasActive ? (
        <ActiveChallengeCard
          active={active}
          standings={standings}
          isDemo={isDemo}
          activeIsInvite={activeIsInvite}
          activeIsWaiting={activeIsWaiting}
          activeIsHost={activeIsHost}
          activeHostReady={activeHostReady}
          activeReadyToStart={activeReadyToStart}
          respondPending={respondChallenge.isPending}
          startPending={startRealChallenge.isPending}
          finishPending={finishRealChallenge.isPending}
          onRespond={(accept) => void respondToChallenge(accept)}
          onStart={() => void startChallenge()}
          onFinish={() => void finishChallenge()}
          onShare={() => void shareChallenge()}
        />
      ) : (
        <Card style={styles.emptyActive}>
          <View style={styles.emptyActiveIcon}>
            <Ionicons name="flag-outline" size={24} color={colors.accent} />
          </View>
          <AppText variant="h2" align="center">Tu próximo reto empieza abajo</AppText>
          <AppText variant="caption" color={colors.muted} align="center" style={{ marginTop: 6 }}>
            Elige una ruta, una categoría y un piloto. La invitación llega a tu amigo al
            instante.
          </AppText>
        </Card>
      )}

      {sentTo ? (
        <Card style={styles.sentCard}>
          <View style={styles.sentIcon}>
            <Ionicons name="checkmark" size={18} color="#120802" />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">Reto enviado a {sentTo.split(' ')[0]}</AppText>
            <AppText variant="caption" color={colors.muted}>
              Comparte el código {active.code} por WhatsApp mientras esperas.
            </AppText>
          </View>
          <IconButton icon="share-social-outline" size={34} tone="ghost" onPress={shareChallenge} />
        </Card>
      ) : null}

      {hasActive ? <ChallengeStandings standings={standings} status={active.status} /> : null}

      <SectionHeader
        title={challengeMode === 'instant' ? 'Reto al momento' : 'Modo programado'}
        action="Cómo funciona"
        onAction={() =>
          Alert.alert(
            challengeMode === 'instant' ? 'Reto al momento' : 'Cómo funciona',
            challengeMode === 'instant'
              ? 'Elige una ruta A → B, una categoría y uno o más pilotos disponibles. Al confirmar, la sala empieza de inmediato con 2+ participantes y gana quien llegue primero a la meta respetando las normas. No se premia la velocidad máxima.'
              : 'Elige una ruta A → B y una categoría. La app busca un amigo disponible de esa categoría o te deja elegir uno. Al aceptar, ambos comparten progreso y el primero en entrar en la meta gana. No se premia la velocidad máxima.',
          )
        }
      />
      <Card style={styles.matchCard}>
        <View style={styles.matchHeading}>
          <View style={styles.matchIcon}>
            <Ionicons
              name={challengeMode === 'instant' ? 'flash' : 'git-compare-outline'}
              size={22}
              color={colors.accent}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title">
              {challengeMode === 'instant' ? 'Arma la salida ahora' : 'Encuentra tu próximo reto'}
            </AppText>
            <AppText variant="caption" color={colors.muted} style={{ marginTop: 3 }}>
              {challengeMode === 'instant'
                ? 'Ruta, categoría y 2+ pilotos. La sala arranca en cuanto confirmes.'
                : 'Elige ruta y categoría. Emparejamos un amigo disponible o eliges tú.'}
            </AppText>
          </View>
        </View>

        <RoutePicker
          routes={challengeRoutes}
          selectedId={selectedRouteId}
          onSelect={selectRoute}
        />

        <CategoryPicker value={category} onSelect={chooseCategory} />

        <View style={styles.friendHeader}>
          <AppText variant="label" color={colors.muted} style={styles.stepLabel}>
            {challengeMode === 'instant' ? '3 · PILOTOS (2+)' : '3 · RIVAL'}
          </AppText>
          <Pressable
            onPress={challengeMode === 'instant' ? pickInstantRivals : matchmake}
            style={styles.quickMatch}
            disabled={matching}
          >
            {matching && challengeMode === 'scheduled' ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons
                name={challengeMode === 'instant' ? 'shuffle' : 'sparkles'}
                size={14}
                color={colors.lime}
              />
            )}
            <AppText variant="label" color={colors.lime} style={{ fontSize: 9 }}>
              {challengeMode === 'scheduled' && matching
                ? 'BUSCANDO…'
                : challengeMode === 'instant'
                  ? 'ELEGIR 2 ALEATORIOS'
                  : 'EMPAREJAMIENTO RÁPIDO'}
            </AppText>
          </Pressable>
        </View>

        <FriendPicker
          loading={friendsLoading}
          friends={filteredFriends}
          category={category}
          showFindFriends={!isDemo && challengeFriends.length === 0}
          isSelected={isFriendSelected}
          onPress={pressFriend}
          onFindFriends={() => router.push('/friends')}
        />

        {challengeMode === 'instant' ? (
          <>
            {selectedInstantFriends.length > 0 ? (
              <View style={styles.lineupCard}>
                <View style={styles.lineupAvatars}>
                  <Avatar name={me.name} color={me.color} size={38} ring={colors.surface} />
                  {selectedInstantFriends.map((friend, index) => (
                    <View key={friend.id} style={[styles.lineupAvatar, index === 0 && { marginLeft: -8 }]}>
                      <Avatar name={friend.name} color={friend.color} size={38} ring={colors.surface} />
                    </View>
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">
                    {selectedInstantFriends.length + 1} pilotos listos
                  </AppText>
                  <AppText variant="caption" color={colors.muted}>
                    Tú y {selectedInstantFriends.map((friend) => friend.name.split(' ')[0]).join(', ')}
                  </AppText>
                </View>
                <Pill label="2+" tone="lime" icon="people" />
              </View>
            ) : (
              <View style={styles.instantHint}>
                <Ionicons name="flash-outline" size={18} color={colors.accent} />
                <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
                  Elige al menos un piloto para formar una sala de 2+ personas. También puedes usar
                  “Elegir 2 aleatorios”.
                </AppText>
              </View>
            )}

            <Button
              label={
                selectedInstantFriends.length > 0
                  ? `Salir ahora con ${selectedInstantFriends.length + 1} pilotos`
                  : 'Elige 2+ pilotos'
              }
              icon="flash"
              onPress={promptInstantStart}
              disabled={selectedInstantFriends.length === 0}
              style={{ marginTop: spacing.md }}
            />
            <AppText variant="caption" color={colors.dim} align="center" style={{ marginTop: 8 }}>
              La sala empieza al confirmar. Gana quien llega primero a la meta respetando las normas.
            </AppText>
          </>
        ) : (
          <>
            {rival ? (
              <View style={styles.rivalCard}>
                <Avatar name={rival.name} color={rival.color} size={42} online />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">
                    {matchedFriend ? 'Rival encontrado' : 'Rival seleccionado'}: {rival.name}
                  </AppText>
                  <AppText variant="caption" color={colors.muted}>
                    {rival.car} · {vehicleCategoryLabel(rival.vehicleKind)}
                  </AppText>
                </View>
                <Pill
                  label={rival.online ? 'En línea' : 'Disponible'}
                  tone={rival.online ? 'lime' : 'neutral'}
                />
              </View>
            ) : null}

            <Button
              label={rival ? `Enviar reto a ${rival.name.split(' ')[0]}` : 'Elige un rival'}
              icon="flag"
              onPress={sendChallenge}
              disabled={!rival}
              style={{ marginTop: spacing.md }}
            />
            <AppText variant="caption" color={colors.dim} align="center" style={{ marginTop: 8 }}>
              Sin apuestas. Sin rankings de velocidad. El reto mide llegada, no imprudencia.
            </AppText>
          </>
        )}
      </Card>

      <SectionHeader
        title="Resultados recientes"
        action={isDemo ? 'Ver todos' : recentResults.length ? `${recentResults.length}` : undefined}
      />
      <RecentResults results={recentResults} />

      <Card style={styles.safetyCard}>
        <View style={styles.safetyIcon}>
          <Ionicons name="shield-checkmark" size={20} color={colors.lime} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">Retos responsables</AppText>
          <AppText variant="caption" color={colors.muted} style={{ marginTop: 3 }}>
            No fomentamos carreras ilegales ni premiamos la velocidad máxima. Gana quien llega
            primero cumpliendo los límites y las normas de tránsito.
          </AppText>
        </View>
      </Card>

      <View style={styles.footer}>
        <Ionicons name="people-outline" size={13} color={colors.dim} />
        <AppText variant="caption" color={colors.dim}>
          Categorías separadas para coches, motos, EV y camiones.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.md,
  },
  errorCard: {
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  matchmakingPillRow: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
  modeSwitch: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.md,
  },
  modeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  // El check va en la esquina para no robar ancho al título.
  modeText: { flex: 1, minWidth: 0 },
  modeCheck: { position: 'absolute', top: 6, right: 6 },
  modeOptionActive: {
    borderColor: 'rgba(201,255,77,0.35)',
    backgroundColor: 'rgba(201,255,77,0.06)',
  },
  modeIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeIconActive: {
    backgroundColor: colors.lime,
  },
  emptyActive: {
    marginTop: spacing.lg,
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.xl,
  },
  emptyActiveIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  sentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    borderColor: 'rgba(201,255,77,0.25)',
  },
  sentIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchCard: { gap: 4 },
  matchHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  matchIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { marginTop: spacing.lg, marginBottom: 8 },
  friendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  quickMatch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingLeft: 8,
  },
  rivalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: 'rgba(201,255,77,0.25)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  lineupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255,90,31,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.3)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  lineupAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lineupAvatar: {
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: 21,
  },
  instantHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  safetyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.md,
    borderColor: 'rgba(201,255,77,0.18)',
    backgroundColor: 'rgba(201,255,77,0.04)',
  },
  safetyIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.limeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
  },
});
