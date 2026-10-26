import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthNotice } from '@/src/components/auth';
import {
  AppText,
  Button,
  Card,
  Input,
  Pill,
  Screen,
  SectionHeader,
} from '@/src/components/ui';
import { useCreateParty, useJoinParty } from '@/src/hooks/useParty';
import { partyDestinations } from '@/src/lib/party';
import { colors, radius, spacing } from '@/src/theme';

export function PartyLobby() {
  const createParty = useCreateParty();
  const joinParty = useJoinParty();
  const [name, setName] = useState('Caravana de domingo');
  const [destinationId, setDestinationId] = useState(partyDestinations[0].id);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const destination =
    partyDestinations.find((item) => item.id === destinationId) ?? partyDestinations[0];

  const create = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Ponle un nombre a la party.');
      return;
    }

    try {
      await createParty.mutateAsync({
        name,
        destinationLabel: destination.label,
        destinationLat: destination.latitude,
        destinationLng: destination.longitude,
      });
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'No pudimos crear la party.',
      );
    }
  };

  const join = async () => {
    setError(null);
    if (code.trim().length < 4) {
      setError('Escribe el código de invitación de 6 caracteres.');
      return;
    }

    try {
      await joinParty.mutateAsync(code);
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : 'No pudimos unirnos a la party.',
      );
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="label" color={colors.accent}>PARTY</AppText>
          <AppText variant="h1" style={{ marginTop: 4 }}>La carretera en grupo</AppText>
          <AppText variant="body" color={colors.muted} style={{ marginTop: 6 }}>
            Crea una caravana o únete con el código de un amigo. Tu ubicación solo
            se comparte con los miembros mientras la party esté activa.
          </AppText>
        </View>
        <Pill label="En vivo" tone="lime" icon="radio" />
      </View>

      {error ? <AuthNotice message={error} /> : null}

      <SectionHeader title="Crear party" action="Tú eres el anfitrión" />
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

        <AppText variant="label" color={colors.muted} style={{ marginTop: spacing.md }}>
          Destino
        </AppText>
        <View style={styles.destinationGrid}>
          {partyDestinations.map((item) => {
            const selected = item.id === destinationId;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  setDestinationId(item.id);
                  setError(null);
                }}
                style={[styles.destinationChip, selected && styles.destinationChipActive]}
              >
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={selected ? colors.accent : colors.muted}
                />
                <AppText variant="caption" color={selected ? colors.text : colors.muted}>
                  {item.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <Button
          label={createParty.isPending ? 'Creando…' : 'Crear y salir ahora'}
          icon="radio-outline"
          loading={createParty.isPending}
          onPress={create}
          style={{ marginTop: spacing.lg }}
        />
      </Card>

      <SectionHeader title="Unirme con código" action="6 caracteres" />
      <Card style={styles.card}>
        <Input
          label="Código de invitación"
          value={code}
          onChangeText={(value) => {
            setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
            setError(null);
          }}
          placeholder="ABC123"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          inputStyle={styles.codeInput}
        />
        <Button
          label={joinParty.isPending ? 'Uniéndome…' : 'Unirme a la party'}
          icon="enter-outline"
          variant="secondary"
          loading={joinParty.isPending}
          disabled={code.length < 4}
          onPress={join}
          style={{ marginTop: spacing.md }}
        />
      </Card>

      <Card style={styles.note}>
        <Ionicons name="shield-checkmark-outline" size={19} color={colors.lime} />
        <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
          El chat y las posiciones se activan al entrar. El PTT de voz real llegará
          con LiveKit; por ahora el botón es una simulación segura.
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  card: { gap: spacing.sm },
  destinationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.sm,
  },
  destinationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  destinationChipActive: {
    borderColor: 'rgba(255,90,31,0.45)',
    backgroundColor: colors.accentSoft,
  },
  codeInput: {
    letterSpacing: 4,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.lg,
    borderColor: 'rgba(201,255,77,0.16)',
    backgroundColor: 'rgba(201,255,77,0.04)',
  },
});
