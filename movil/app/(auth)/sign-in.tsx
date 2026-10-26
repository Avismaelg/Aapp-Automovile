import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { AuthFormLayout, AuthNotice } from '@/src/components/auth';
import { AppText, Button, Input } from '@/src/components/ui';
import { isSupabaseConfigured } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';
import { colors, spacing } from '@/src/theme';

export default function SignInScreen() {
  const router = useRouter();
  const signIn = useAuth((state) => state.signIn);
  const continueAsDemo = useAuth((state) => state.continueAsDemo);
  const busy = useAuth((state) => state.busy);
  const clearError = useAuth((state) => state.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/welcome');
  };

  const submit = async () => {
    Keyboard.dismiss();
    setError(null);
    clearError();

    if (!email.trim() || !password) {
      setError('Escribe tu correo y contraseña.');
      return;
    }
    if (!isSupabaseConfigured) {
      setError('Configura Supabase para usar cuentas reales o entra en modo demo.');
      return;
    }

    const result = await signIn(email, password);
    if (!result.ok) setError(result.message ?? 'No pudimos iniciar sesión.');
  };

  const useDemo = async () => {
    await continueAsDemo();
  };

  return (
    <AuthFormLayout
      title="Bienvenido de nuevo."
      subtitle="Tu caravana, tus rutas y tu garaje te están esperando."
      onBack={goBack}
      footer={
        <View style={styles.footer}>
          <AppText variant="caption" color={colors.muted} align="center">
            ¿Todavía no tienes cuenta?
          </AppText>
          <Pressable onPress={() => router.replace('/sign-up')} hitSlop={8}>
            <AppText variant="bodyStrong" color={colors.accent} align="center">
              Crear una cuenta gratis
            </AppText>
          </Pressable>
        </View>
      }
    >
      {!isSupabaseConfigured ? (
        <AuthNotice
          tone="info"
          message="Supabase aún no está configurado en este entorno. Puedes revisar la app completa en modo demo."
        />
      ) : null}

      <View style={styles.form}>
        <Input
          label="Correo electrónico"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError(null);
          }}
          placeholder="tu@correo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />

        <Input
          label="Contraseña"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setError(null);
          }}
          placeholder="Tu contraseña"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          rightSlot={
            <Pressable
              onPress={() => setShowPassword((value) => !value)}
              hitSlop={10}
              accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={19}
                color={colors.muted}
              />
            </Pressable>
          }
        />

        {error ? <AuthNotice message={error} /> : null}

        <Button
          label="Entrar"
          icon="log-in-outline"
          size="lg"
          loading={busy}
          disabled={!email.trim() || !password || !isSupabaseConfigured}
          onPress={submit}
          style={{ marginTop: spacing.sm }}
        />

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <AppText variant="caption" color={colors.dim}>
            o
          </AppText>
          <View style={styles.divider} />
        </View>

        <Button
          label="Explorar sin cuenta"
          icon="play-outline"
          variant="secondary"
          onPress={useDemo}
        />
      </View>

      <View style={styles.privacy}>
        <Ionicons name="shield-checkmark-outline" size={15} color={colors.lime} />
        <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
          Tu ubicación nunca se comparte fuera de una party. Puedes desactivar el
          tracking cuando quieras.
        </AppText>
      </View>
    </AuthFormLayout>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.lg,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderSoft,
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: spacing['2xl'],
    paddingHorizontal: 4,
  },
  footer: {
    gap: 3,
  },
});
