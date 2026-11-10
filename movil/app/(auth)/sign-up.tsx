import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Keyboard, Pressable, StyleSheet, View, type TextInputInstance } from 'react-native';

import { AuthFormLayout, AuthNotice } from '@/src/components/auth';
import { AppText, Button, Card, Input, Pill } from '@/src/components/ui';
import { suggestMakes, suggestModels } from '@/src/data/vehicle-makes';
import { pickVehiclePhoto, takeVehiclePhoto } from '@/src/hooks/useGarage';
import { errorMessage } from '@/src/lib/alerts';
import { isEmailRegistered, isNicknameAvailable } from '@/src/lib/signup-checks';
import {
  confirmError,
  emailError,
  maxVehicleYear,
  nameError,
  nicknameError,
  normalizeNickname,
  passwordChecks,
  passwordError,
  passwordStrength,
  requiredError,
  stepForServerError,
  strengthLabel,
  VEHICLE_MIN_YEAR,
  yearError,
} from '@/src/lib/signup-validation';
import { isSupabaseConfigured } from '@/src/lib/supabase';
import { vehicleKinds, vehicleKindMeta } from '@/src/lib/vehicles';
import { useAuth } from '@/src/store/auth';
import { useSignupDraft } from '@/src/store/signup-draft';
import { colors, radius, spacing } from '@/src/theme';
import { t } from '@/src/i18n';

// REG-01…REG-12: alta en 3 pasos (datos → contraseña → vehículo). Lo escrito
// se guarda como borrador (salvo la contraseña) y el vehículo se crea en el
// servidor en la misma transacción que la cuenta.

type Errors = Partial<Record<
  'firstName' | 'lastName' | 'nickname' | 'email' | 'password' | 'confirm' | 'make' | 'model' | 'year',
  string
>>;

type Availability = 'idle' | 'checking' | 'free' | 'taken' | 'unknown';

const STRENGTH_COLORS = [colors.danger, colors.danger, '#FFB020', colors.lime, colors.lime];

export default function SignUpScreen() {
  const router = useRouter();
  const signUp = useAuth((state) => state.signUp);
  const resendConfirmation = useAuth((state) => state.resendConfirmation);
  const continueAsDemo = useAuth((state) => state.continueAsDemo);
  const busy = useAuth((state) => state.busy);
  const clearError = useAuth((state) => state.clearError);
  const draft = useSignupDraft();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [nickState, setNickState] = useState<Availability>('idle');
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const lastRef = useRef<TextInputInstance>(null);
  const nickRef = useRef<TextInputInstance>(null);
  const emailRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);
  const modelRef = useRef<TextInputInstance>(null);
  const yearRef = useRef<TextInputInstance>(null);

  const step = draft.step;
  const nickname = normalizeNickname(draft.nickname);

  // REG-02: disponibilidad del apodo en vivo (con espera de 450 ms).
  useEffect(() => {
    if (!nickname || nicknameError(nickname)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setNickState('checking');
      void isNicknameAvailable(nickname).then((available) => {
        if (cancelled) return;
        setNickState(available == null ? 'unknown' : available ? 'free' : 'taken');
      });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [nickname]);

  const set = (patch: Parameters<typeof draft.update>[0], clear?: keyof Errors) => {
    draft.update(patch);
    if (clear) setErrors((current) => ({ ...current, [clear]: undefined }));
    setFormError(null);
  };

  const goBack = () => {
    if (step > 1) {
      draft.update({ step: (step - 1) as 1 | 2 });
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/welcome');
  };

  const nextFromStep1 = async () => {
    Keyboard.dismiss();
    const next: Errors = {
      firstName: nameError(draft.firstName, 'first') ?? undefined,
      lastName: nameError(draft.lastName, 'last') ?? undefined,
      nickname: nicknameError(draft.nickname) ?? (nickState === 'taken' ? t('Ese apodo ya está en uso.') : undefined),
      email: emailError(draft.email) ?? undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    // REG-03: correo ya registrado → se avisa antes de seguir.
    setCheckingEmail(true);
    const [registered, available] = await Promise.all([
      isEmailRegistered(draft.email),
      nickState === 'free' ? Promise.resolve(true) : isNicknameAvailable(nickname),
    ]);
    setCheckingEmail(false);
    if (registered) {
      setErrors({ email: t('Ese correo ya tiene una cuenta. Inicia sesión.') });
      return;
    }
    if (available === false) {
      setNickState('taken');
      setErrors({ nickname: t('Ese apodo ya está en uso.') });
      return;
    }
    draft.update({ step: 2 });
  };

  const nextFromStep2 = () => {
    Keyboard.dismiss();
    const next: Errors = {
      password: passwordError(password) ?? undefined,
      confirm: confirmError(password, confirm) ?? undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    draft.update({ step: 3 });
  };

  const choosePhoto = async (source: 'camera' | 'library') => {
    setPhotoError(null);
    try {
      const photo = source === 'camera' ? await takeVehiclePhoto() : await pickVehiclePhoto();
      if (photo) draft.update({ photoUri: photo.uri, photoMime: photo.mimeType });
    } catch (error) {
      setPhotoError(errorMessage(error, t('No pudimos usar esa foto.')));
    }
  };

  const finish = async () => {
    Keyboard.dismiss();
    clearError();
    const next: Errors = {
      make: requiredError(draft.make, t('la marca')) ?? undefined,
      model: requiredError(draft.model, t('el modelo')) ?? undefined,
      year: yearError(draft.year) ?? undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    // La contraseña no se guarda en el borrador: si se reabrió la app, hay
    // que volver a escribirla.
    if (passwordError(password) || confirmError(password, confirm)) {
      draft.update({ step: 2 });
      setErrors({ password: t('Vuelve a escribir tu contraseña.') });
      return;
    }
    if (!isSupabaseConfigured) {
      setFormError(t('Configura Supabase para crear cuentas reales o entra en modo demo.'));
      return;
    }

    const result = await signUp({
      displayName: `${draft.firstName.trim()} ${draft.lastName.trim()}`,
      firstName: draft.firstName,
      lastName: draft.lastName,
      username: nickname,
      email: draft.email,
      password,
      vehicle: {
        kind: draft.kind,
        make: draft.make.trim(),
        model: draft.model.trim(),
        year: Number(draft.year),
        color: draft.color.trim() || undefined,
        plate: draft.plate.trim() || undefined,
      },
    });

    if (!result.ok) {
      // REG-03 / REG-10: se vuelve al paso del dato rechazado, sin borrar nada.
      const back = stepForServerError(result.message ?? '');
      draft.update({ step: back });
      if (back === 1) setErrors({ email: result.message });
      else setFormError(result.message ?? t('No pudimos crear tu cuenta.'));
      return;
    }

    // La foto se sube cuando haya sesión (usePendingVehiclePhoto).
    draft.setPendingPhoto(
      draft.photoUri ? { uri: draft.photoUri, mime: draft.photoMime ?? 'image/jpeg' } : null,
    );
    const email = draft.email.trim().toLowerCase();
    draft.reset();
    setPassword('');
    setConfirm('');
    if (result.needsConfirmation) setSentTo(email);
  };

  if (sentTo) {
    return (
      <AuthFormLayout
        title={t('Revisa tu correo.')}
        subtitle={t('Solo falta un paso para arrancar.')}
        onBack={() => router.replace('/welcome')}
        footer={
          <View style={styles.footer}>
            <Button
              label={t('Ya confirmé, iniciar sesión')}
              icon="log-in-outline"
              onPress={() => router.replace('/sign-in')}
            />
            <Button
              label={t('Reenviar el correo')}
              variant="secondary"
              icon="mail-outline"
              onPress={() =>
                void resendConfirmation(sentTo).then((result) =>
                  setResent(result.ok ? t('Correo reenviado.') : result.message ?? t('No pudimos reenviarlo.')),
                )
              }
            />
          </View>
        }
      >
        <Card style={styles.successCard}>
          <View style={styles.successIcon}>
            <Ionicons name="mail-unread-outline" size={28} color={colors.lime} />
          </View>
          <AppText variant="title" align="center" style={{ marginTop: spacing.lg }}>
            {t('Te enviamos un enlace de confirmación')}
          </AppText>
          <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: 6 }}>
            {t('Abre el correo en')}{' '}<AppText variant="bodyStrong" color={colors.text}>{sentTo}</AppText>{' '}{t('y confirma tu cuenta.')}
          </AppText>
          <AuthNotice tone="info" message={resent ?? t('Si no aparece en unos minutos, revisa la carpeta de spam o de promociones.')} />
        </Card>
      </AuthFormLayout>
    );
  }

  const checks = passwordChecks(password);
  const strength = passwordStrength(password);
  const makeHints = suggestMakes(draft.make, draft.kind);
  const modelHints = suggestModels(draft.make, draft.model);

  return (
    <AuthFormLayout
      title={
        step === 1 ? t('Crea tu caravana.') : step === 2 ? t('Protege tu cuenta.') : t('Tu vehículo.')
      }
      subtitle={
        step === 1
          ? t('Cómo te verá la comunidad.')
          : step === 2
            ? t('Una contraseña que solo tú conozcas.')
            : t('Con él apareces en el mapa y en los retos.')
      }
      onBack={goBack}
      footer={
        step === 1 ? (
          <View style={styles.footer}>
            <AppText variant="caption" color={colors.muted} align="center">
              {t('¿Ya tienes una cuenta?')}
            </AppText>
            <Pressable onPress={() => router.replace('/sign-in')} hitSlop={8}>
              <AppText variant="bodyStrong" color={colors.accent} align="center">
                {t('Iniciar sesión')}
              </AppText>
            </Pressable>
          </View>
        ) : undefined
      }
    >
      {/* REG-09: progreso 1/3, 2/3, 3/3. */}
      <View style={styles.progress} accessibilityLabel={t('Paso {0} de 3', step)}>
        {[1, 2, 3].map((index) => (
          <View key={index} style={[styles.progressBar, index <= step && styles.progressActive]} />
        ))}
        <AppText variant="caption" color={colors.muted}>{`${step}/3`}</AppText>
      </View>

      {!isSupabaseConfigured ? (
        <AuthNotice
          tone="info"
          message={t('Supabase aún no está configurado en este entorno. El formulario está listo, pero las cuentas reales necesitan las claves del proyecto.')}
        />
      ) : null}

      {step === 1 ? (
        <View style={styles.form}>
          <View style={styles.row}>
            <Input
              style={styles.half}
              label={t('Nombre')}
              value={draft.firstName}
              onChangeText={(value) => set({ firstName: value }, 'firstName')}
              autoCapitalize="words"
              autoComplete="given-name"
              textContentType="givenName"
              returnKeyType="next"
              onSubmitEditing={() => lastRef.current?.focus()}
              maxLength={40}
              error={errors.firstName}
            />
            <Input
              ref={lastRef}
              style={styles.half}
              label={t('Apellido')}
              value={draft.lastName}
              onChangeText={(value) => set({ lastName: value }, 'lastName')}
              autoCapitalize="words"
              autoComplete="family-name"
              textContentType="familyName"
              returnKeyType="next"
              onSubmitEditing={() => nickRef.current?.focus()}
              maxLength={40}
              error={errors.lastName}
            />
          </View>
          <Input
            ref={nickRef}
            label={t('Apodo')}
            value={draft.nickname}
            onChangeText={(value) => {
              set({ nickname: normalizeNickname(value) }, 'nickname');
              setNickState('idle');
            }}
            placeholder={t('tunombre')}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            maxLength={20}
            error={errors.nickname ?? (nickState === 'taken' ? t('Ese apodo ya está en uso.') : undefined)}
            rightSlot={
              nickState === 'free' ? (
                <Ionicons name="checkmark-circle" size={19} color={colors.lime} />
              ) : nickState === 'taken' ? (
                <Ionicons name="close-circle" size={19} color={colors.danger} />
              ) : (
                <AppText variant="caption" color={colors.dim}>@</AppText>
              )
            }
          />
          <AppText variant="caption" color={nickState === 'free' ? colors.lime : colors.muted}>
            {nickState === 'checking'
              ? t('Comprobando…')
              : nickState === 'free'
                ? t('@{0} está libre', nickname)
                : t('Es tu @usuario público: 3–20 letras, números, «_» o «.».')}
          </AppText>
          <Input
            ref={emailRef}
            label={t('Correo electrónico')}
            value={draft.email}
            onChangeText={(value) => set({ email: value }, 'email')}
            placeholder={t('tu@correo.com')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => void nextFromStep1()}
            error={errors.email}
          />
          <Button
            label={t('Siguiente')}
            icon="arrow-forward"
            size="lg"
            loading={checkingEmail}
            onPress={() => void nextFromStep1()}
          />
          <Button
            label={t('Probar primero en modo demo')}
            icon="play-outline"
            variant="ghost"
            onPress={() => continueAsDemo()}
          />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.form}>
          <Input
            label={t('Contraseña')}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setErrors((current) => ({ ...current, password: undefined }));
            }}
            placeholder={t('Mínimo 8 caracteres')}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            error={errors.password}
            rightSlot={
              <Pressable
                onPress={() => setShowPassword((value) => !value)}
                hitSlop={10}
                accessibilityLabel={showPassword ? t('Ocultar contraseña') : t('Mostrar contraseña')}
              >
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.muted} />
              </Pressable>
            }
          />
          {/* REG-04: medidor de fortaleza y requisitos. */}
          <View style={styles.strengthRow}>
            {[0, 1, 2, 3].map((index) => (
              <View
                key={index}
                style={[
                  styles.strengthBar,
                  password && index < Math.max(1, strength) && { backgroundColor: STRENGTH_COLORS[strength] },
                ]}
              />
            ))}
            <AppText variant="caption" color={colors.muted}>{password ? strengthLabel(strength) : ''}</AppText>
          </View>
          <View style={styles.checks}>
            {[
              [checks.length, t('8 caracteres o más')],
              [checks.letter, t('Una letra')],
              [checks.number, t('Un número')],
            ].map(([ok, label]) => (
              <View key={String(label)} style={styles.checkItem}>
                <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={15} color={ok ? colors.lime : colors.dim} />
                <AppText variant="caption" color={ok ? colors.textSoft : colors.muted}>{String(label)}</AppText>
              </View>
            ))}
          </View>
          <Input
            ref={confirmRef}
            label={t('Confirmar contraseña')}
            value={confirm}
            onChangeText={(value) => {
              setConfirm(value);
              setErrors((current) => ({ ...current, confirm: undefined }));
            }}
            placeholder={t('Repite tu contraseña')}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={nextFromStep2}
            error={errors.confirm}
          />
          <Button label={t('Siguiente')} icon="arrow-forward" size="lg" onPress={nextFromStep2} />
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.form}>
          <View style={styles.kinds}>
            {vehicleKinds.map((kind) => (
              <Pressable key={kind} onPress={() => set({ kind })} accessibilityRole="button">
                <Pill
                  label={vehicleKindMeta[kind].shortLabel}
                  tone={draft.kind === kind ? 'accent' : 'neutral'}
                />
              </Pressable>
            ))}
          </View>
          <Input
            label={t('Marca')}
            value={draft.make}
            onChangeText={(value) => set({ make: value }, 'make')}
            placeholder={t('Toyota, Honda, Yamaha…')}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => modelRef.current?.focus()}
            maxLength={40}
            error={errors.make}
          />
          {makeHints.length > 0 ? (
            <View style={styles.hints}>
              {makeHints.map((make) => (
                <Pressable key={make} onPress={() => set({ make }, 'make')}>
                  <Pill label={make} tone="neutral" />
                </Pressable>
              ))}
            </View>
          ) : null}
          <Input
            ref={modelRef}
            label={t('Modelo')}
            value={draft.model}
            onChangeText={(value) => set({ model: value }, 'model')}
            placeholder={t('Corolla, Civic, MT-07…')}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => yearRef.current?.focus()}
            maxLength={60}
            error={errors.model}
          />
          {modelHints.length > 0 ? (
            <View style={styles.hints}>
              {modelHints.map((model) => (
                <Pressable key={model} onPress={() => set({ model }, 'model')}>
                  <Pill label={model} tone="neutral" />
                </Pressable>
              ))}
            </View>
          ) : null}
          <Input
            ref={yearRef}
            label={t('Año')}
            value={draft.year}
            onChangeText={(value) => set({ year: value.replace(/\D/g, '').slice(0, 4) }, 'year')}
            placeholder={`${VEHICLE_MIN_YEAR}–${maxVehicleYear()}`}
            keyboardType="number-pad"
            returnKeyType="done"
            maxLength={4}
            error={errors.year}
          />
          <View style={styles.row}>
            <Input
              style={styles.half}
              label={t('Color (opcional)')}
              value={draft.color}
              onChangeText={(value) => set({ color: value })}
              autoCapitalize="words"
              maxLength={20}
            />
            <Input
              style={styles.half}
              label={t('Placa (opcional)')}
              value={draft.plate}
              onChangeText={(value) => set({ plate: value.toUpperCase() })}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
            />
          </View>

          {/* REG-06: foto opcional (cámara o galería, recorte 4:3). */}
          <Card style={styles.photoCard}>
            {draft.photoUri ? (
              <Image source={{ uri: draft.photoUri }} style={styles.photo} accessibilityLabel={t('Foto del vehículo')} />
            ) : (
              <Ionicons name="camera-outline" size={26} color={colors.muted} />
            )}
            <AppText variant="caption" color={colors.muted} align="center">
              {t('Foto del vehículo (opcional)')}
            </AppText>
            <View style={styles.row}>
              <Button label={t('Cámara')} icon="camera-outline" variant="secondary" size="sm" full={false} onPress={() => void choosePhoto('camera')} />
              <Button label={t('Galería')} icon="images-outline" variant="secondary" size="sm" full={false} onPress={() => void choosePhoto('library')} />
              {draft.photoUri ? (
                <Button label={t('Quitar')} variant="ghost" size="sm" full={false} onPress={() => set({ photoUri: null, photoMime: null })} />
              ) : null}
            </View>
            {photoError ? <AuthNotice message={photoError} /> : null}
          </Card>

          {formError ? <AuthNotice message={formError} /> : null}
          <Button
            label={t('Crear cuenta')}
            icon="person-add-outline"
            size="lg"
            loading={busy}
            disabled={!isSupabaseConfigured}
            onPress={() => void finish()}
          />
          <View style={styles.legal}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.lime} />
            <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
              {t('Al crear tu cuenta aceptas las reglas de conducción responsable. Caravana nunca premia el exceso de velocidad.')}{' '}
              <AppText
                variant="caption"
                color={colors.accent}
                onPress={() => router.push('/privacidad' as Href)}
                accessibilityRole="link"
              >
                {t('Política de privacidad')}
              </AppText>
            </AppText>
          </View>
        </View>
      ) : null}
    </AuthFormLayout>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  half: { flex: 1 },
  footer: { gap: 8 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceHigh },
  progressActive: { backgroundColor: colors.accent },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -spacing.sm },
  strengthBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceHigh },
  checks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hints: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -spacing.sm },
  photoCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg },
  legal: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4 },
  successCard: { alignItems: 'center', paddingVertical: spacing['2xl'] },
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
