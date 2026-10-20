import { router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { icons } from '@/components/ui/icons';
import { api } from '@/data/api-client';
import { useAuth } from '@/state/AuthContext';
import { colors, layout, radius, spacing } from '@/theme/theme';
import { TextField } from '@/components/ui/TextField';

const ROLE_LABEL: Record<string, string> = { admin: 'admin', coach: 'trener', member: 'członek' };

export default function LoginScreen() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isDemo = api.mode === 'demo';
  const accounts = isDemo ? api.demoAccounts?.() ?? [] : [];

  async function submit(targetEmail = email, targetPassword = password) {
    setError(null);
    if (!targetEmail.trim()) {
      setError('Podaj e-mail klubowy.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.signIn(targetEmail, targetPassword);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await refresh();
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zalogować.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.logoMark}>
              <AppText style={styles.logoText}>{icons.belt}</AppText>
            </View>
            <AppText variant="display">BJJ Club</AppText>
            <AppText variant="muted" align="center">
              Zapisy, check-in i trening tematyczny w jednym miejscu.
            </AppText>
          </View>

          <Card style={styles.form}>
            <TextField label="E-mail" value={email} onChangeText={setEmail} placeholder="ty@klub.pl" autoCapitalize="none" keyboardType="email-address" />
            <TextField
              label="Hasło"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              onSubmitEditing={() => void submit()}
            />
            {error ? (
              <Card tone="danger" compact>
                <AppText color="#FFB4B4">{icons.warning} {error}</AppText>
              </Card>
            ) : null}
            <Button label="Zaloguj się" onPress={() => void submit()} loading={busy} fullWidth testID="login-submit" />
          </Card>

          {isDemo ? (
            <View style={styles.demoBlock}>
              <View style={styles.demoHeader}>
                <AppText variant="label">Tryb demo — wybierz konto</AppText>
                <Badge label={`hasło: ${'Trening123!'}`} tone="muted" />
              </View>
              <View style={styles.demoGrid}>
                {accounts.map((account) => (
                  <Pressable key={account.email} onPress={() => void submit(account.email, 'Trening123!')} style={({ pressed }) => [styles.demoChip, pressed && styles.pressed]}>
                    <AppText variant="heading" style={styles.demoName}>
                      {account.label}
                    </AppText>
                    <AppText variant="caption">{ROLE_LABEL[account.role] ?? account.role}</AppText>
                  </Pressable>
                ))}
              </View>
              <AppText variant="caption" style={styles.demoNote}>
                {icons.info} Tryb demo liczy wszystko na tej samej logice domenowej co produkcyjne RPC — dane nie są zapisywane.
              </AppText>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { padding: layout.screenPadding, paddingBottom: spacing.xxl, gap: spacing.lg },
  hero: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl, paddingBottom: spacing.md },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logoText: { fontSize: 30 },
  form: { gap: spacing.md },
  demoBlock: { gap: spacing.sm },
  demoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  demoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  demoChip: {
    flexGrow: 1,
    flexBasis: '47%',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 2,
  },
  demoName: { color: colors.text },
  pressed: { opacity: 0.7 },
  demoNote: { lineHeight: 17 },
});
