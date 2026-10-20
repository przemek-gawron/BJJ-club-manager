import { useCameraPermissions, CameraView } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { icons } from '@/components/ui/icons';
import { SessionCard } from '@/components/SessionCard';
import { useCheckIn, useClubName } from '@/hooks/queries';
import { api } from '@/data/api-client';
import { CLUB_CHECKIN_TOKEN } from '@/lib/env';
import { CHECK_IN_GRACE_MINUTES, CHECK_IN_LEAD_MINUTES, parseCheckInPayload } from '@/domain/check-in';
import { colors, radius, spacing } from '@/theme/theme';
import type { CheckInResult } from '@/domain/types';

/**
 * Check-in: skan kodu QR przy drzwiach albo ręczne podanie tokena.
 * Kod to `bjjclub://check-in?t=<token>&s=<id sesji>` — ten sam ekran obsługuje deep-link.
 */
export default function CheckInScreen() {
  const params = useLocalSearchParams<{ t?: string; token?: string; s?: string; sessionId?: string }>();
  const router = useRouter();
  const checkIn = useCheckIn();
  const clubName = useClubName();
  const [now] = useState(() => new Date());
  const [token, setToken] = useState(params.t ?? params.token ?? CLUB_CHECKIN_TOKEN);
  const [sessionId, setSessionId] = useState<string | null>(params.s ?? params.sessionId ?? null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const lockRef = useRef(0);

  const deepLinkToken = params.t ?? params.token ?? null;

  const send = useCallback(
    (usedToken: string, targetSession: string | null) => {
      checkIn.mutate(
        { token: usedToken.trim(), sessionId: targetSession },
        {
          onSuccess: (payload) => {
            setResult(payload);
            if (payload.session) setSessionId(payload.session.id);
          },
        }
      );
    },
    [checkIn]
  );

  /** Skan: jeden odczyt na 4 s, żeby kamera nie wysyłała dziesiątek identycznych żądań. */
  const onCode = useCallback(
    (payload: { data?: string }) => {
      const parsed = parseCheckInPayload(payload.data ?? '');
      if (!parsed) return;
      const now2 = Date.now();
      if (now2 - lockRef.current < 4_000) return;
      lockRef.current = now2;
      setToken(parsed.token);
      setSessionId(parsed.sessionId ?? sessionId);
      setCameraOn(false);
      send(parsed.token, parsed.sessionId ?? sessionId);
    },
    [sessionId, send]
  );

  const tone = useMemo<'success' | 'warning' | 'danger' | 'primary'>(() => {
    if (!result) return 'primary';
    if (result.ok) return 'success';
    if (result.kind === 'already_checked_in' || result.kind === 'too_early') return 'warning';
    return 'danger';
  }, [result]);

  return (
    <Screen testID="check-in-screen">
      <SectionHeader title="Check-in" subtitle={clubName.data ?? 'klub'} icon={icons.scan} />

      <Card tone="alt">
        <AppText variant="heading">{icons.info} Jak to działa</AppText>
        <AppText variant="muted">
          Zeskanuj kod QR przy wejściu. Meldunek jest ważny od {CHECK_IN_LEAD_MINUTES} minut przed startem do {CHECK_IN_GRACE_MINUTES} minut po
          starcie zajęcia i liczy się do twojej passy.
        </AppText>
      </Card>

      {cameraOn ? (
        <Card tone="primary" testID="camera-box">
          <View style={styles.cameraFrame}>
            {permission?.granted ? (
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={onCode}
              />
            ) : (
              <View style={styles.cameraFallback}>
                <AppText variant="muted" align="center">
                  Brak dostępu do kamery. Zgód dostęp albo użyj tokena poniżej.
                </AppText>
                <Button label="zgód dostęp" small onPress={() => void requestPermission()} testID="request-camera" />
              </View>
            )}
          </View>
          <View style={styles.row}>
            <Button label="skreśl kamerę" variant="secondary" small onPress={() => setCameraOn(false)} testID="camera-off" />
            <Button label="wpisz token ręcznie" variant="ghost" small onPress={() => setCameraOn(false)} />
          </View>
        </Card>
      ) : (
        <Card tone="primary">
          <AppText variant="heading">{icons.scan} Zeskanuj kod przy drzwiach</AppText>
          <AppText variant="muted">Kierujemy na kod QR klubu. Działa też deep-link otwarty z kodu.</AppText>
          <View style={styles.row}>
            <Button
              label="włącz kamerę"
              icon={icons.scan}
              onPress={() => {
                setResult(null);
                setCameraOn(true);
                if (!permission?.granted) void requestPermission();
              }}
              testID="open-camera"
            />
            <Button label="wróć" variant="ghost" onPress={() => router.back()} testID="check-in-back" />
          </View>
        </Card>
      )}

      {deepLinkToken ? (
        <Card tone="success" compact testID="deep-link-card">
          <AppText variant="body">{icons.check} Otwarto link check-in z kodu.</AppText>
          <AppText variant="caption">
            {sessionId ? `Sesja w linku: ${sessionId}` : 'Link bez wskazania sesji — wybierzemy najbliższe zajęcia w oknie.'}
          </AppText>
          <Button label="potwierdź meldunek" small onPress={() => send(deepLinkToken, sessionId)} testID="confirm-deep-link" />
        </Card>
      ) : null}

      {api.mode === 'demo' ? (
        <Card tone="alt" compact>
          <AppText variant="caption">
            {icons.info} Tryb demo: token klubu to «{CLUB_CHECKIN_TOKEN}». Zostaw go i kliknij «zamelduj» — zobaczysz te same reguły okna czasowego co
            na produkcji, więc poza oknem dostaniesz «brak zajęć w oknie».
          </AppText>
        </Card>
      ) : null}

      <Card>
        <TextField
          label="Token klubu"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          hint="Zawartość kodu QR — możesz przepisać ręcznie, gdy kamera zawiedzie."
          testID="token-input"
        />
        <TextField
          label="Id zajęć (opcjonalnie)"
          placeholder="puste = najbliższe zajęcia w oknie"
          value={sessionId ?? ''}
          onChangeText={(value) => setSessionId(value.length > 0 ? value : null)}
          autoCapitalize="none"
          autoCorrect={false}
          hint="Przydatne, gdy przy drzwiach wisi kod przypisany do konkretnych zajęć."
          testID="session-id-input"
        />
        <Button label="zamelduj się" loading={checkIn.isPending} onPress={() => send(token, sessionId)} testID="manual-check-in" />
      </Card>

      {result ? (
        <Card tone={tone} testID="check-in-result">
          <AppText variant="heading">{result.ok ? `${icons.check} Meldunek przyjęty` : `${icons.warning} Nie tym razem`}</AppText>
          <AppText variant="body">{result.message}</AppText>
          <View style={styles.badgeRow}>
            <Badge label={`status: ${KIND_LABEL[result.kind]}`} tone={result.ok ? 'success' : 'warning'} />
            {result.session ? <Badge label={result.session.classTemplate.name} tone="muted" /> : null}
          </View>
          {result.session ? (
            <SessionCard session={result.session} now={now} coachView={false} onPress={() => router.push(`/session/${result.session?.id}`)} />
          ) : null}
          {result.ok ? (
            <Button label="strona główna" variant="secondary" onPress={() => router.replace('/(tabs)')} testID="check-in-done" />
          ) : null}
        </Card>
      ) : null}

      <Card compact>
        <AppText variant="caption">
          {icons.warning} Trener może wpisać cię na listę ręcznie na ekranie zajęć — jeśli członkostwo jest nieaktywne albo kod nie należy do klubu.
        </AppText>
      </Card>
    </Screen>
  );
}

const KIND_LABEL: Record<CheckInResult['kind'], string> = {
  checked_in: 'zameldowany',
  already_checked_in: 'już byłeś',
  no_session_in_window: 'brak zajęć w oknie',
  not_member: 'brak profilu',
  membership_inactive: 'członkostwo nieaktywne',
  too_early: 'za wcześnie',
  too_late: 'za późno',
  bad_token: 'kod nie z tego klubu',
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  cameraFrame: {
    height: 240,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bg,
  },
  camera: { flex: 1 },
  cameraFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
});
