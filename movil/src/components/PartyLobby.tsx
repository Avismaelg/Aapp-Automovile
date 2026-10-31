import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthNotice } from '@/src/components/auth';
import { InviteSheet } from '@/src/components/party/InviteSheet';
import {
  AppText,
  Button,
  Card,
  Input,
  Screen,
  ScreenHeader,
  SectionHeader,
} from '@/src/components/ui';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useCreateParty, useJoinParty } from '@/src/hooks/useParty';
import { partyDestinations } from '@/src/lib/party';
import { defaultPartyName, extractPartyCode, PARTY_CODE_LENGTH } from '@/src/lib/party-invites';
import { colors, radius, spacing } from '@/src/theme';

// Sin party: las tres formas de empezar, de la más rápida a la más completa.
// 1. Invitar amigos (un toque; la party se crea sola).
// 2. Unirse con código, pegándolo o escaneando el QR.
// 3. Crear una party con destino.
export function PartyLobby() {
  const router = useRouter();
  const me = useCurrentUser();
  const createParty = useCreateParty();
  const joinParty = useJoinParty();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState(() => defaultPartyName(me.name));
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const destination = partyDestinations.find((item) => item.id === destinationId) ?? null;

  const create = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Ponle un nombre a la party.');
      return;
    }
    try {
      await createParty.mutateAsync({
        name,
        destinationLabel: destination?.label ?? '',
        destinationLat: destination?.latitude,
        destinationLng: destination?.longitude,
      });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'No pudimos crear la party.');
    }
  };

  const join = async (value = code) => {
    setError(null);
    if (value.trim().length < 4) {
      setError(`Escribe el código de ${PARTY_CODE_LENGTH} caracteres.`);
      return;
    }
    try {
      await joinParty.mutateAsync(value);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'No pudimos unirnos a la party.');
    }
  };

  // Pegar el mensaje de WhatsApp entero también vale: se saca el código.
  const paste = async () => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    const found = extractPartyCode(text);
    if (!found) {
      setError('No hay ningún código copiado. Copia el mensaje de invitación y vuelve a intentarlo.');
      return;
    }
    setCode(found);
    void join(found);
  };

  return (
    <Screen>
      <ScreenHeader title="Party" subtitle="Conduce en grupo y mira a todos en el mapa" />

      {error ? <AuthNotice message={error} /> : null}

      <Pressable
        style={({ pressed }) => [styles.hero, pressed && { opacity: 0.85 }]}
        onPress={() => setInviteOpen(true)}
        accessibilityRole="button"
      >
        <View style={styles.heroIcon}>
          <Ionicons name="people" size={22} color={colors.bg} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="h3" color={colors.bg}>Invitar amigos</AppText>
          <AppText variant="caption" color="rgba(6,8,11,0.65)">
            Toca a un amigo y le llega la invitación al momento
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.bg} />
      </Pressable>

      <SectionHeader title="Unirme a una party" />
      <Card style={styles.card}>
        <View style={styles.joinRow}>
          <Input
            value={code}
            onChangeText={(value) => {
              setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, PARTY_CODE_LENGTH));
              setError(null);
            }}
            placeholder="CÓDIGO"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={PARTY_CODE_LENGTH}
            inputStyle={styles.codeInput}
            style={{ flex: 1 }}
            returnKeyType="go"
            onSubmitEditing={() => void join()}
          />
        </View>
        <Button
          label={joinParty.isPending ? 'Uniéndome…' : 'Unirme'}
          icon="enter-outline"
          loading={joinParty.isPending}
          disabled={code.length < 4}
          onPress={() => void join()}
        />
        <View style={styles.quickRow}>
          <Pressable style={styles.quick} onPress={() => void paste()} accessibilityRole="button">
            <Ionicons name="clipboard-outline" size={18} color={colors.text} />
            <AppText variant="bodyStrong" style={{ fontSize: 14 }}>Pegar invitación</AppText>
          </Pressable>
          <Pressable
            style={styles.quick}
            onPress={() => router.push('/scan' as Href)}
            accessibilityRole="button"
          >
            <Ionicons name="qr-code-outline" size={18} color={colors.text} />
            <AppText variant="bodyStrong" style={{ fontSize: 14 }}>Escanear QR</AppText>
          </Pressable>
        </View>
      </Card>

      <SectionHeader
        title="Crear una party"
        action={showCreate ? 'Ocultar' : 'Con destino'}
        onAction={() => setShowCreate((value) => !value)}
      />
      {showCreate ? (
        <Card style={styles.card}>
          <Input
            label="Nombre"
            value={name}
            onChangeText={(value) => {
              setName(value);
              setError(null);
            }}
            placeholder="Ruta de montaña"
            maxLength={80}
          />
          <AppText variant="label" color={colors.muted} style={{ marginTop: spacing.sm }}>
            Destino (opcional)
          </AppText>
          <View style={styles.destinationGrid}>
            {partyDestinations.map((item) => {
              const selected = item.id === destinationId;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setDestinationId(selected ? null : item.id)}
                  style={[styles.chip, selected && styles.chipActive]}
                >
                  <AppText variant="caption" color={selected ? colors.bg : colors.textSoft}>
                    {item.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <Button
            label={createParty.isPending ? 'Creando…' : 'Crear party'}
            icon="radio-outline"
            variant="secondary"
            loading={createParty.isPending}
            onPress={create}
            style={{ marginTop: spacing.sm }}
          />
        </Card>
      ) : (
        <Pressable style={styles.createRow} onPress={() => void create()} accessibilityRole="button">
          <Ionicons name="radio-outline" size={19} color={colors.textSoft} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">Crear «{name}»</AppText>
            <AppText variant="caption" color={colors.muted}>Sin destino; lo eliges luego en el mapa</AppText>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.dim} />
        </Pressable>
      )}

      <AppText variant="caption" color={colors.dim} style={styles.note}>
        Tu ubicación solo se comparte con los miembros mientras estés en la party.
      </AppText>

      <InviteSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} party={null} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.text,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(6,8,11,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { gap: spacing.md },
  joinRow: { flexDirection: 'row', gap: spacing.sm },
  codeInput: {
    letterSpacing: 6,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
  },
  quickRow: { flexDirection: 'row', gap: spacing.sm },
  quick: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 11,
  },
  destinationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: colors.text },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  note: { marginTop: spacing.xl, textAlign: 'center' },
});
