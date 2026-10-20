import { useQueryClient } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { api } from '@/data/api-client';
import { isDemoMode } from '@/lib/env';
import { colors, spacing } from '@/theme/theme';
import type { MemberProfile } from '@/domain/types';

interface AuthState {
  readonly member: MemberProfile | null;
  readonly loading: boolean;
  readonly refresh: () => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly isStaff: boolean;
  readonly isActive: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Sesja i profil zalogowanego członka.
 * W trybie demo sesja żyje w repozytorium in-memory, w Supabase — w tokenie JWT.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Ten sam stan w ref: `refresh` musi porównać stare i nowe konto, nie odświeżając
  // zamknięcia przy każdym renderze.
  const memberRef = useRef<MemberProfile | null>(null);

  const refresh = useCallback(async () => {
    try {
      const profile = await api.me();
      // Zmiana konta (logowanie bez uprzedniego wylogowania, przełączenie demo-konta)
      // nie może zostawić w cache danych poprzedniego członka.
      if (profile?.id !== memberRef.current?.id) queryClient.clear();
      memberRef.current = profile;
      setMember(profile);
    } catch {
      memberRef.current = null;
      queryClient.clear();
      setMember(null);
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api.signOut();
    // Cache zapytań przeżywa zmianę konta: bez tego następne logowanie (u tego samego
    // operatora na tym samym telefonie) na ułamek sekundy pokaże grafik i frekwencję
    // poprzedniego członka, a przy trybie demo nawet jego dane poza kolejnością.
    queryClient.clear();
    memberRef.current = null;
    setMember(null);
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({
      member,
      loading,
      refresh,
      signOut,
      isStaff: member ? member.role === 'coach' || member.role === 'admin' : false,
      isActive: member ? member.membership === 'active' : false,
    }),
    [member, loading, refresh, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth poza AuthProvider');
  return ctx;
}

/** Ekran ładowania profilu — pokazywany zamiast skoku w niezalogowany stan. */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading } = useAuth();
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <AppText variant="muted">Sprawdzamy twoje członkostwo…</AppText>
      </View>
    );
  }
  return <>{children}</>;
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.bg, padding: spacing.xl },
});

export const demoMode = isDemoMode;
