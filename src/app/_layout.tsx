import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthGate, AuthProvider } from '@/state/AuthContext';
import { colors } from '@/theme/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Grafik i frekwencja zmieniają się rzadko — refetch przy focusie dopina resztę.
      staleTime: 20_000,
      gcTime: 10 * 60_000,
      retry: 1,
    },
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AuthGate>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.bg },
                  headerTintColor: colors.text,
                  headerTitleStyle: { fontWeight: '700' },
                  contentStyle: { backgroundColor: colors.bg },
                  headerShadowVisible: false,
                }}
              >
                <Stack.Screen name="login" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="session/[id]" options={{ title: 'Zajęcia' }} />
                <Stack.Screen name="member/[id]" options={{ title: 'Profil członka' }} />
                <Stack.Screen name="check-in" options={{ title: 'Check-in' }} />
                <Stack.Screen name="admin/index" options={{ title: 'Ustawienia klubu' }} />
              </Stack>
            </AuthGate>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
