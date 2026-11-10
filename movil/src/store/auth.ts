import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { create } from 'zustand';

import { currentUser } from '@/src/data/mock';
import { isProductionBuild, isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { t } from '@/src/i18n';
import { PASSWORD_MIN } from '@/src/lib/signup-validation';
import { unregisterPushToken } from '@/src/lib/push';
import { useChosenDestination } from '@/src/store/destination';
import { useFollow } from '@/src/store/follow';
import { useParking } from '@/src/store/parking';

const DEMO_KEY = 'caravana.auth.demo-mode';

export type AuthMode = 'supabase' | 'demo';
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type Account = {
  id: string;
  email: string;
  displayName: string;
  username: string;
  mode: AuthMode;
  avatarUrl?: string;
};

export type AuthResult = {
  ok: boolean;
  message?: string;
  needsConfirmation?: boolean;
};

export type SignUpVehicle = {
  kind: 'car' | 'motorcycle' | 'ev' | 'truck';
  make: string;
  model: string;
  year: number;
  color?: string;
  plate?: string;
};

type SignUpInput = {
  displayName: string;
  username: string;
  email: string;
  password: string;
  // REG-01/REG-05: el trigger del alta crea el perfil y el vehículo principal
  // en la misma transacción que el usuario.
  firstName?: string;
  lastName?: string;
  vehicle?: SignUpVehicle;
};

type AuthState = {
  status: AuthStatus;
  account: Account | null;
  busy: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (input: SignUpInput) => Promise<AuthResult>;
  resendConfirmation: (email: string) => Promise<AuthResult>;
  continueAsDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  signOutLocal: () => Promise<void>;
  syncAccount: (
    partial: Partial<Pick<Account, 'displayName' | 'username' | 'avatarUrl'>>,
  ) => void;
  clearError: () => void;
};

const DEMO_ACCOUNT: Account = {
  id: 'demo',
  email: 'demo@caravana.app',
  displayName: currentUser.name,
  username: currentUser.username,
  mode: 'demo',
};

let bootstrapped = false;
let unsubscribeAuth: (() => void) | null = null;
let unsubscribeDeepLink: (() => void) | null = null;

function authCallbackUrl() {
  return Linking.createURL('auth/callback');
}

async function consumeAuthUrl(rawUrl: string) {
  if (!supabase) return false;

  try {
    const url = new URL(rawUrl);
    const search = new URLSearchParams(url.search);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const code = search.get('code') ?? hash.get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      return true;
    }

    const accessToken = hash.get('access_token') ?? search.get('access_token');
    const refreshToken = hash.get('refresh_token') ?? search.get('refresh_token');
    if (!accessToken || !refreshToken) return false;

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return true;
  } catch {
    return false;
  }
}

function cleanUsername(value: string) {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 24);

  return cleaned.length >= 3 ? cleaned : 'driver';
}

function fallbackAccount(user: User): Account {
  const metadata = user.user_metadata ?? {};
  const email = user.email ?? '';
  const emailName = email.split('@')[0] ?? 'driver';
  const displayName =
    typeof metadata.display_name === 'string' && metadata.display_name.trim()
      ? metadata.display_name.trim()
      : emailName;
  const username =
    typeof metadata.username === 'string' && metadata.username.trim()
      ? cleanUsername(metadata.username)
      : cleanUsername(emailName);

  return {
    id: user.id,
    email,
    displayName,
    username,
    mode: 'supabase',
    avatarUrl: typeof metadata.avatar_url === 'string' ? metadata.avatar_url : undefined,
  };
}

// Al iniciar sesión, signIn y onAuthStateChange piden el perfil a la vez:
// comparten la misma petición en lugar de lanzar dos.
let accountRequest: { userId: string; promise: Promise<Account> } | null = null;

function loadAccount(user: User): Promise<Account> {
  if (accountRequest?.userId === user.id) return accountRequest.promise;
  const promise = fetchAccount(user).finally(() => {
    if (accountRequest?.promise === promise) accountRequest = null;
  });
  accountRequest = { userId: user.id, promise };
  return promise;
}

async function fetchAccount(user: User): Promise<Account> {
  const fallback = fallbackAccount(user);

  if (!supabase) return fallback;

  const { data } = await supabase
    .from('profiles')
    .select('username, display_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle<{
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
    }>();

  if (!data) return fallback;

  return {
    ...fallback,
    username: data.username ? cleanUsername(data.username) : fallback.username,
    displayName: data.display_name?.trim() || fallback.displayName,
    avatarUrl: data.avatar_url ?? fallback.avatarUrl,
  };
}

function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return t('Correo o contraseña incorrectos.');
  }
  if (normalized.includes('email not confirmed')) {
    return t('Confirma tu correo antes de iniciar sesión.');
  }
  if (normalized.includes('already registered') || normalized.includes('already been registered')) {
    return t('Ese correo ya tiene una cuenta. Inicia sesión.');
  }
  if (normalized.includes('password')) {
    return t('Usa al menos {0} caracteres.', PASSWORD_MIN);
  }
  if (normalized.includes('rate limit') || normalized.includes('too many')) {
    return t('Demasiados intentos. Espera un momento y vuelve a probar.');
  }
  if (normalized.includes('email')) {
    return t('Revisa el correo y vuelve a intentarlo.');
  }

  return t('No pudimos completar la operación. Revisa tu conexión e inténtalo de nuevo.');
}

function missingConfigMessage() {
  return t('Supabase no está configurado. Añade EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY para activar las cuentas reales.');
}

// Error de una acción: lo muestra y lo devuelve.
function fail(message: string): AuthResult {
  useAuth.setState({ busy: false, error: message });
  return { ok: false, message };
}

// El perfil llega después de la sesión: no debe resucitar la cuenta si
// entretanto se cerró sesión o entró otra.
function applyAccount(account: Account) {
  useAuth.setState((state) => (state.account?.id === account.id ? { account } : state));
}

// «global» cierra la sesión también en el servidor; «local», solo en este
// teléfono (tras borrar la cuenta el servidor responde 403 y supabase-js lo
// ignora). En los dos casos supabase-js borra la sesión del almacenamiento
// seguro. Antes signOutLocal borraba claves de AsyncStorage, donde ya no está
// la sesión, y la cuenta borrada «volvía» al abrir la app.
async function endSession(scope: 'global' | 'local') {
  useAuth.setState({ busy: true });
  await AsyncStorage.setItem(DEMO_KEY, '0');
  // El token se borra con la sesión aún abierta (después la RLS ya no deja).
  // Tras borrar la cuenta (local) el servidor ya lo borró con ella.
  if (scope === 'global') await unregisterPushToken().catch(() => undefined);
  if (supabase) await supabase.auth.signOut({ scope }).catch(() => undefined);
  // Lo guardado en el teléfono de esa cuenta no lo hereda la siguiente.
  useFollow.getState().stop();
  useChosenDestination.getState().resetAll();
  useParking.getState().clearSpot();
  useAuth.setState({ status: 'unauthenticated', account: null, busy: false, error: null });
}

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  account: null,
  busy: false,
  error: null,

  initialize: async () => {
    if (bootstrapped) return;
    bootstrapped = true;

    try {
      const storedDemo = await AsyncStorage.getItem(DEMO_KEY);

      if (!isSupabaseConfigured || !supabase) {
        if (isProductionBuild) {
          set({
            status: 'unauthenticated',
            account: null,
            error: t('La configuración de producción está incompleta. Contacta con soporte.'),
          });
          return;
        }
        if (storedDemo === '0') {
          set({ status: 'unauthenticated', account: null });
          return;
        }

        if (storedDemo !== '1') {
          await AsyncStorage.setItem(DEMO_KEY, '1');
        }
        set({ status: 'authenticated', account: DEMO_ACCOUNT });
        return;
      }

      // Native no usa detectSessionInUrl: consume manualmente el enlace de
      // confirmación/restablecimiento y deja que Supabase persista la sesión.
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) await consumeAuthUrl(initialUrl);
      unsubscribeDeepLink?.();
      const deepLinkSubscription = Linking.addEventListener('url', ({ url }) => {
        void consumeAuthUrl(url);
      });
      unsubscribeDeepLink = () => deepLinkSubscription.remove();

      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (data.session?.user) {
        if (storedDemo === '1') {
          await AsyncStorage.setItem(DEMO_KEY, '0');
        }
        set({ status: 'authenticated', account: fallbackAccount(data.session.user) });
        applyAccount(await loadAccount(data.session.user));
      } else if (storedDemo === '1') {
        set({ status: 'authenticated', account: DEMO_ACCOUNT });
      } else {
        set({ status: 'unauthenticated', account: null });
      }

      unsubscribeAuth?.();
      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        if (!session?.user) {
          if (event === 'SIGNED_OUT') {
            set({ status: 'unauthenticated', account: null, busy: false });
            return;
          }

          // INITIAL_SESSION puede llegar vacío después de elegir demo. No debe
          // expulsar al usuario del modo demo.
          set((state) =>
            state.account?.mode === 'demo'
              ? state
              : { status: 'unauthenticated', account: null, busy: false },
          );
          return;
        }

        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
          set({
            status: 'authenticated',
            account: fallbackAccount(session.user),
            busy: false,
          });
          void loadAccount(session.user).then(applyAccount);
        }
      });
      unsubscribeAuth = () => listener.subscription.unsubscribe();
    } catch {
      set({
        status: 'unauthenticated',
        account: null,
        error: t('No pudimos restaurar la sesión. Vuelve a iniciar sesión.'),
      });
    }
  },

  signIn: async (email, password) => {
    if (!supabase) return fail(missingConfigMessage());

    set({ busy: true, error: null });

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) return fail(friendlyAuthError(error.message));

      if (!data.user) return fail(t('No recibimos tu cuenta. Inténtalo de nuevo.'));

      const account = await loadAccount(data.user);
      set({ status: 'authenticated', account, busy: false, error: null });
      return { ok: true };
    } catch {
      return fail(t('No pudimos conectar con Supabase. Revisa tu conexión.'));
    }
  },

  signUp: async ({ displayName, username, email, password, firstName, lastName, vehicle }) => {
    if (!supabase) return fail(missingConfigMessage());

    set({ busy: true, error: null });

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            display_name: displayName.trim().slice(0, 60),
            username: cleanUsername(username),
            ...(firstName ? { first_name: firstName.trim().slice(0, 40) } : {}),
            ...(lastName ? { last_name: lastName.trim().slice(0, 40) } : {}),
            ...(vehicle ? { vehicle } : {}),
          },
          emailRedirectTo: authCallbackUrl(),
        },
      });

      if (error) return fail(friendlyAuthError(error.message));

      // Con confirmación de correo, Supabase no da error si el correo ya
      // existe (para no revelarlo): devuelve un usuario sin identidades.
      if (data.user && data.user.identities?.length === 0) {
        return fail(t('Ese correo ya tiene una cuenta. Inicia sesión.'));
      }

      if (data.session?.user) {
        const account = await loadAccount(data.session.user);
        set({ status: 'authenticated', account, busy: false, error: null });
        return { ok: true };
      }

      set({ busy: false, error: null });
      return {
        ok: true,
        needsConfirmation: true,
        message:
          t('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.'),
      };
    } catch {
      return fail(t('No pudimos crear la cuenta. Revisa tu conexión.'));
    }
  },

  // REG-11: reenviar el correo de confirmación.
  resendConfirmation: async (email) => {
    if (!supabase) return { ok: false, message: missingConfigMessage() };
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: authCallbackUrl() },
    });
    if (error) return { ok: false, message: friendlyAuthError(error.message) };
    return { ok: true };
  },

  continueAsDemo: async () => {
    if (isProductionBuild) {
      set({ error: t('El modo demo no está disponible en producción.') });
      return;
    }
    await AsyncStorage.setItem(DEMO_KEY, '1');
    set({
      status: 'authenticated',
      account: DEMO_ACCOUNT,
      busy: false,
      error: null,
    });
  },

  signOut: () => endSession('global'),
  // Tras borrar la cuenta: el servidor ya no la conoce.
  signOutLocal: () => endSession('local'),

  syncAccount: (partial) =>
    set((state) =>
      state.account
        ? { account: { ...state.account, ...partial } }
        : state,
    ),

  clearError: () => set({ error: null }),
}));
