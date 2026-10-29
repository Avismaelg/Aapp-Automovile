import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '@/src/components/AppErrorBoundary';
// Además de sincronizar el tracking, carga src/lib/tracking.ts al arrancar:
// la tarea de ubicación en segundo plano tiene que estar definida siempre.
import { useBackgroundTracking } from '@/src/hooks/useBackgroundTracking';
import { installWebAlert } from '@/src/lib/web-alert';
import { useAuth } from '@/src/store/auth';
import { colors } from '@/src/theme';

SplashScreen.preventAutoHideAsync();
installWebAlert();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const authStatus = useAuth((state) => state.status);
  const initializeAuth = useAuth((state) => state.initialize);
  // Si una fuente falla, React Native usa su fallback del sistema. No debemos
  // dejar la app en una pantalla negra solo por un recurso visual opcional.
  const ready = authStatus !== 'loading' && (loaded || Boolean(error));
  const isAuthenticated = authStatus === 'authenticated';
  useBackgroundTracking(isAuthenticated);

  useEffect(() => {
    if (error) void SplashScreen.hideAsync();
  }, [error]);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="light" />
          <AppErrorBoundary>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'fade',
              }}
            >
          {/* Enlaces públicos: perfil, vehículo e invitación abren sin cuenta. */}
          <Stack.Screen name="u/[username]" />
          <Stack.Screen name="v/[slug]" />
          <Stack.Screen name="challenge/[code]" />

          <Stack.Protected guard={isAuthenticated} redirectTo="/welcome">
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="scan"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="party/[code]"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="party/chat" />
            <Stack.Screen
              name="vehicle/new"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="v/[slug]/sale"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="profile/edit"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="friends" />
            <Stack.Screen name="actividad" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen
              name="post/new"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="post/[id]" />
            <Stack.Screen
              name="vehicle/maintenance/new"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="vehicle/fuel/new"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="account/delete"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="drive"
              options={{ presentation: 'fullScreenModal', animation: 'fade' }}
            />
          </Stack.Protected>

          <Stack.Protected guard={!isAuthenticated} redirectTo="/">
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
            </Stack>
          </AppErrorBoundary>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
