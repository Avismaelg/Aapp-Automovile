import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { create } from 'zustand';

import { currentUser } from '@/src/data/mock';
import { isProductionBuild, isSupabaseConfigured, supabase } from '@/src/lib/supabase';

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

type SignUpInput = {
  displayName: string;
  username: string;
  email: string;
  password: string;
};

type AuthState = {
  status: AuthStatus;
  account: Account | null;
  busy: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (input: SignUpInput) => Promise<AuthResult>;
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
    .replace(/[^a-z0-9_]/g, '')
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
    return 'Correo o contraseña incorrectos.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Confirma tu correo antes de iniciar sesión.';
  }
  if (normalized.includes('already registered') || normalized.includes('already been registered')) {
    return 'Ese correo ya tiene una cuenta. Inicia sesión.';
  }
  if (normalized.includes('password')) {
    return 'La contraseña no cumple los requisitos del proyecto (mínimo 6 caracteres).';
  }
  if (normalized.includes('rate limit') || normalized.includes('too many')) {
    return 'Demasiados intentos. Espera un momento y vuelve a probar.';
  }
  if (normalized.includes('email')) {
    return 'Revisa el correo y vuelve a intentarlo.';
  }

  return 'No pudimos completar la operación. Revisa tu conexión e inténtalo de nuevo.';
}

function missingConfigMessage() {
  return 'Supabase no está configurado. Añade EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY para activar las cuentas reales.';
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
            error: 'La configuración de producción está incompleta. Contacta con soporte.',
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
        const account = await loadAccount(data.session.user);
        set({ account });
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
          void loadAccount(session.user).then((account) => set({ account }));
        }
      });
      unsubscribeAuth = () => listener.subscription.unsubscribe();
    } catch {
      set({
        status: 'unauthenticated',
        account: null,
        error: 'No pudimos restaurar la sesión. Vuelve a iniciar sesión.',
      });
    }
  },

  signIn: async (email, password) => {
    if (!supabase) {
      const message = missingConfigMessage();
      set({ error: message });
      return { ok: false, message };
    }

    set({ busy: true, error: null });

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        const message = friendlyAuthError(error.message);
        set({ busy: false, error: message });
        return { ok: false, message };
      }

      if (!data.user) {
        const message = 'No recibimos tu cuenta. Inténtalo de nuevo.';
        set({ busy: false, error: message });
        return { ok: false, message };
      }

      const account = await loadAccount(data.user);
      set({ status: 'authenticated', account, busy: false, error: null });
      return { ok: true };
    } catch {
      const message = 'No pudimos conectar con Supabase. Revisa tu conexión.';
      set({ busy: false, error: message });
      return { ok: false, message };
    }
  },

  signUp: async ({ displayName, username, email, password }) => {
    if (!supabase) {
      const message = missingConfigMessage();
      set({ error: message });
      return { ok: false, message };
    }

    set({ busy: true, error: null });

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            display_name: displayName.trim().slice(0, 60),
            username: cleanUsername(username),
          },
          emailRedirectTo: authCallbackUrl(),
        },
      });

      if (error) {
        const message = friendlyAuthError(error.message);
        set({ busy: false, error: message });
        return { ok: false, message };
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
          'Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.',
      };
    } catch {
      const message = 'No pudimos crear la cuenta. Revisa tu conexión.';
      set({ busy: false, error: message });
      return { ok: false, message };
    }
  },

  continueAsDemo: async () => {
    if (isProductionBuild) {
      set({ error: 'El modo demo no está disponible en producción.' });
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

  signOut: async () => {
    set({ busy: true });
    await AsyncStorage.setItem(DEMO_KEY, '0');

    if (supabase) {
      await supabase.auth.signOut().catch(() => undefined);
    }

    set({
      status: 'unauthenticated',
      account: null,
      busy: false,
      error: null,
    });
  },

  signOutLocal: async () => {
    set({ busy: true });
    await AsyncStorage.setItem(DEMO_KEY, '0');

    if (supabase) {
      // La cuenta ya fue borrada: no llamamos /logout (daría 403).
      // Solo limpiamos la sesión persistida y el refresco automático.
      supabase.auth.stopAutoRefresh();
      try {
        const keys = await AsyncStorage.getAllKeys();
        const authKeys = keys.filter(
          (key) => key.startsWith('sb-') && key.endsWith('-auth-token'),
        );
        if (authKeys.length > 0) {
          await AsyncStorage.multiRemove(authKeys);
        }
      } catch {
        // El estado local igualmente queda cerrado.
      }
    }

    set({
      status: 'unauthenticated',
      account: null,
      busy: false,
      error: null,
    });
  },

  syncAccount: (partial) =>
    set((state) =>
      state.account
        ? { account: { ...state.account, ...partial } }
        : state,
    ),

  clearError: () => set({ error: null }),
}));
