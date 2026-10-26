import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { AuthFormLayout, AuthNotice } from '@/src/components/auth';
import { AppText, Button, Card, Input } from '@/src/components/ui';
import { isSupabaseConfigured } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';
import { colors, spacing } from '@/src/theme';

type FieldErrors = {
  displayName?: string;
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUpScreen() {
  const router = useRouter();
  const signUp = useAuth((state) => state.signUp);
  const continueAsDemo = useAuth((state) => state.continueAsDemo);
  const busy = useAuth((state) => state.busy);
  const clearError = useAuth((state) => state.clearError);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/welcome');
  };

  const submit = async () => {
    Keyboard.dismiss();
    clearError();
    setFormError(null);

    const nextErrors: FieldErrors = {};
    if (displayName.trim().length < 2) {
      nextErrors.displayName = 'Escribe tu nombre o apodo.';
    }
    if (!USERNAME_PATTERN.test(username.trim())) {
      nextErrors.username = '3–24 caracteres: letras minúsculas, números o guion bajo.';
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      nextErrors.email = 'Escribe un correo válido.';
    }
    if (password.length < 8) {
      nextErrors.password = 'Usa al menos 8 caracteres.';
    }
    if (confirmPassword !== password) {
      nextErrors.confirmPassword = 'Las contraseñas no coinciden.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (!isSupabaseConfigured) {
      setFormError('Configura Supabase para crear cuentas reales o entra en modo demo.');
      return;
    }

    const result = await signUp({
      displayName,
      username,
      email,
      password,
    });

    if (!result.ok) {
      setFormError(result.message ?? 'No pudimos crear tu cuenta.');
      return;
    }

    if (result.needsConfirmation) {
      setSentTo(email.trim().toLowerCase());
    }
  };

  if (sentTo) {
    return (
      <AuthFormLayout
        title="Revisa tu correo."
        subtitle="Solo falta un paso para arrancar."
        onBack={() => router.replace('/welcome')}
        footer={
          <View style={styles.footer}>
            <Button
              label="Ya confirmé, iniciar sesión"
              icon="log-in-outline"
              onPress={() => router.replace('/sign-in')}
            />
            <Button
              label="Volver al inicio"
              variant="ghost"
              onPress={() => router.replace('/welcome')}
            />
          </View>
        }
      >
        <Card style={styles.successCard}>
          <View style={styles.successIcon}>
            <Ionicons name="mail-unread-outline" size={28} color={colors.lime} />
          </View>
          <AppText variant="title" align="center" style={{ marginTop: spacing.lg }}>
            Te enviamos un enlace de confirmación
          </AppText>
          <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: 6 }}>
            Abre el correo en <AppText variant="bodyStrong" color={colors.text}>{sentTo}</AppText> y
            confirma tu cuenta.
          </AppText>
          <AuthNotice
            tone="info"
            message="Si no aparece en unos minutos, revisa la carpeta de spam. Para el MVP puedes desactivar la confirmación por correo en Supabase."
          />
        </Card>
      </AuthFormLayout>
    );
  }

  return (
    <AuthFormLayout
      title="Crea tu caravana."
      subtitle="Un perfil, todos tus vehículos y una comunidad que comparte la carretera."
      onBack={goBack}
      footer={
        <View style={styles.footer}>
          <AppText variant="caption" color={colors.muted} align="center">
            ¿Ya tienes una cuenta?
          </AppText>
          <Pressable onPress={() => router.replace('/sign-in')} hitSlop={8}>
            <AppText variant="bodyStrong" color={colors.accent} align="center">
              Iniciar sesión
            </AppText>
          </Pressable>
        </View>
      }
    >
      {!isSupabaseConfigured ? (
        <AuthNotice
          tone="info"
          message="Supabase aún no está configurado en este entorno. El formulario está listo, pero las cuentas reales necesitan las claves del proyecto."
        />
      ) : null}

      <View style={styles.form}>
        <Input
          label="Nombre"
          value={displayName}
          onChangeText={(value) => {
            setDisplayName(value);
            setErrors((current) => ({ ...current, displayName: undefined }));
          }}
          placeholder="Cómo te verá la comunidad"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          maxLength={60}
          error={errors.displayName}
        />

        <Input
          label="Usuario"
          value={username}
          onChangeText={(value) => {
            setUsername(value.toLowerCase().replace(/\s/g, ''));
            setErrors((current) => ({ ...current, username: undefined }));
          }}
          placeholder="tunombre"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          maxLength={24}
          error={errors.username}
          rightSlot={
            username.length > 0 && USERNAME_PATTERN.test(username) ? (
              <Ionicons name="checkmark-circle" size={19} color={colors.lime} />
            ) : (
              <AppText variant="caption" color={colors.dim}>@</AppText>
            )
          }
        />

        <Input
          label="Correo electrónico"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setErrors((current) => ({ ...current, email: undefined }));
          }}
          placeholder="tu@correo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          error={errors.email}
        />

        <Input
          label="Contraseña"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setErrors((current) => ({ ...current, password: undefined }));
          }}
          placeholder="Mínimo 8 caracteres"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          error={errors.password}
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

        <Input
          label="Confirmar contraseña"
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value);
            setErrors((current) => ({ ...current, confirmPassword: undefined }));
          }}
          placeholder="Repite tu contraseña"
          secureTextEntry={!showConfirm}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={errors.confirmPassword}
          rightSlot={
            <Pressable
              onPress={() => setShowConfirm((value) => !value)}
              hitSlop={10}
              accessibilityLabel={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <Ionicons
                name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                size={19}
                color={colors.muted}
              />
            </Pressable>
          }
        />

        {formError ? <AuthNotice message={formError} /> : null}

        <Button
          label="Crear cuenta"
          icon="person-add-outline"
          size="lg"
          loading={busy}
          disabled={
            !displayName.trim() ||
            !username.trim() ||
            !email.trim() ||
            !password ||
            !confirmPassword ||
            !isSupabaseConfigured
          }
          onPress={submit}
          style={{ marginTop: spacing.sm }}
        />

        <Button
          label="Probar primero en modo demo"
          icon="play-outline"
          variant="ghost"
          onPress={() => continueAsDemo()}
        />
      </View>

      <View style={styles.legal}>
        <Ionicons name="shield-checkmark-outline" size={15} color={colors.lime} />
        <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
          Al crear tu cuenta aceptas las reglas de conducción responsable. Caravana
          nunca premia el exceso de velocidad.
        </AppText>
      </View>
    </AuthFormLayout>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.lg,
  },
  footer: {
    gap: 8,
  },
  legal: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: spacing['2xl'],
    paddingHorizontal: 4,
  },
  successCard: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  successIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.limeSoft,
    borderWidth: 1,
    borderColor: 'rgba(201,255,77,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
