import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthNotice } from '@/src/components/auth';
import {
  AppText,
  Button,
  Card,
  IconButton,
  Input,
  Pill,
} from '@/src/components/ui';
import { useDeleteAccount } from '@/src/hooks/useDeleteAccount';
import { useAuth } from '@/src/store/auth';
import { colors, spacing } from '@/src/theme';

const consequences = [
  'Perfil, usuario y sesión',
  'Publicaciones, fotos, likes y comentarios',
  'Vehículos, mantenimientos y repostajes',
  'Amigos, parties, mensajes y retos',
  'Ficha de venta y datos asociados',
];

export default function DeleteAccountScreen() {
  const router = useRouter();
  const account = useAuth((state) => state.account);
  const deleteAccount = useDeleteAccount();
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isDemo = account?.mode === 'demo';
  const canDelete = confirmation.trim().toUpperCase() === 'ELIMINAR';

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const remove = async () => {
    setError(null);
    if (!canDelete) {
      setError('Escribe ELIMINAR para confirmar.');
      return;
    }

    try {
      await deleteAccount.mutateAsync();
      router.replace('/welcome');
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'No pudimos eliminar la cuenta. Inténtalo de nuevo.',
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <View style={styles.header}>
            <IconButton icon="close" size={40} onPress={goBack} />
            <AppText variant="label" color={colors.danger}>CUENTA</AppText>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.warningIcon}>
            <Ionicons name="warning-outline" size={30} color={colors.danger} />
          </View>
          <AppText variant="h1" align="center" style={{ marginTop: spacing.md }}>
            Eliminar cuenta y datos
          </AppText>
          <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: 6 }}>
            Esta acción es permanente. No se puede deshacer ni recuperar el contenido.
          </AppText>

          {isDemo ? (
            <AuthNotice
              tone="info"
              message="Estás en modo demo. Eliminar la cuenta requiere una cuenta real."
            />
          ) : null}

          <Card style={styles.card}>
            <Pill label={account?.email ?? 'Cuenta'} tone="neutral" icon="mail-outline" />
            <AppText variant="bodyStrong" style={{ marginTop: spacing.md }}>
              Se eliminarán permanentemente:
            </AppText>
            {consequences.map((item) => (
              <View key={item} style={styles.item}>
                <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
                <AppText variant="caption" color={colors.textSoft} style={{ flex: 1 }}>
                  {item}
                </AppText>
              </View>
            ))}
            <AppText variant="caption" color={colors.dim} style={{ marginTop: spacing.md }}>
              Las imágenes del feed se borran de Storage. Los datos en Supabase se
              eliminan por cascada.
            </AppText>
          </Card>

          <Card style={styles.confirmCard}>
            <AppText variant="bodyStrong">Confirma escribiendo ELIMINAR</AppText>
            <Input
              value={confirmation}
              onChangeText={(value) => {
                setConfirmation(value);
                setError(null);
              }}
              placeholder="ELIMINAR"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              style={{ marginTop: spacing.md }}
            />
          </Card>

          {error ? <AuthNotice message={error} /> : null}

          <Button
            label={deleteAccount.isPending ? 'Eliminando cuenta…' : 'Eliminar mi cuenta'}
            icon="trash-outline"
            variant="danger"
            size="lg"
            loading={deleteAccount.isPending}
            disabled={isDemo || !canDelete}
            onPress={remove}
            style={{ marginTop: spacing.lg }}
          />
          <Button
            label="Cancelar"
            variant="ghost"
            onPress={goBack}
            style={{ marginTop: 8 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['2xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  warningIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,90,31,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: spacing['2xl'],
  },
  card: {
    marginTop: spacing.xl,
    gap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmCard: {
    marginTop: spacing.lg,
    borderColor: 'rgba(255,90,31,0.28)',
  },
});
