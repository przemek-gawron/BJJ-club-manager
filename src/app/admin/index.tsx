import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, Screen, SectionHeader } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { icons } from '@/components/ui/icons';
import {
  useCheckInToken,
  useClubName,
  useCreateMember,
  useRotateToken,
  useSaveTemplate,
  useSetTemplateActive,
  useSyncSchedule,
  useTemplates,
  useTodaysAttendance,
} from '@/hooks/queries';
import { useAuth } from '@/state/AuthContext';
import { CLASS_TYPES, CLASS_TYPE_LABEL_PL, LEVELS, LEVEL_LABEL_PL } from '@/domain/schedule';
import { BELT_LABEL_PL, BELT_ORDER } from '@/domain/belts';
import { ROLE_LABEL_PL } from '@/domain/members';
import { WEEKDAY_SHORT_PL } from '@/lib/poland-time';
import { colors, radius, spacing } from '@/theme/theme';
import type { Belt, ClassTemplate, ClassType, Level, Role } from '@/domain/types';

const TEMPLATE_COLORS = ['#2F6FED', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#0EA5E9'] as const;
const ROLES: ReadonlyArray<Role> = ['member', 'coach', 'admin'];

/** Panel klubu: kod QR, szablony grafiku i konta — widoczny dla trenera i admina. */
export default function AdminScreen() {
  const { member, isStaff } = useAuth();
  const clubName = useClubName();
  const tokenQuery = useCheckInToken(isStaff);
  const rotate = useRotateToken();
  const templates = useTemplates();
  const attendance = useTodaysAttendance();
  const sync = useSyncSchedule();

  const [editing, setEditing] = useState<ClassTemplate | 'new' | null>(null);
  const isAdmin = member?.role === 'admin';

  if (!isStaff) {
    return (
      <Screen testID="admin-denied">
        <Card tone="warning">
          <AppText variant="heading">{icons.warning} Panel kadry klubu</AppText>
          <AppText variant="muted">Ustawienia klubu widzą trenerzy i administratorzy.</AppText>
          <Button label="strona główna" variant="secondary" onPress={() => router.replace('/(tabs)')} testID="admin-back" />
        </Card>
      </Screen>
    );
  }

  const list = [...(templates.data ?? [])].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));

  return (
    <Screen
      refreshing={templates.isRefetching || attendance.isRefetching}
      onRefresh={() => {
        void templates.refetch();
        void attendance.refetch();
      }}
      testID="admin-screen"
    >
      <SectionHeader title={clubName.data ?? 'Klub'} subtitle="Kod QR, szablony grafiku i konta" icon={icons.settings} />

      <Card tone="primary">
        <AppText variant="heading">{icons.scan} Kod QR przy drzwiach</AppText>
        <AppText variant="muted">Kod zawiera token klubu. Wymiana tokenu unieważnia wydrukowany plakat.</AppText>
        {tokenQuery.data ? <Badge label={`token: ${tokenQuery.data}`} tone="neutral" /> : <AppText variant="caption">Wczytujemy token…</AppText>}
        <AppText variant="caption">Treść zakodowana jako: bjjclub://check-in?t=&lt;token&gt;</AppText>
        {isAdmin ? (
          <Button
            label="wygeneruj nowy token"
            variant="secondary"
            loading={rotate.isPending}
            onPress={() => rotate.mutate(undefined, { onSuccess: () => void tokenQuery.refetch() })}
            testID="rotate-token"
          />
        ) : (
          <AppText variant="caption">Wymianę tokenu wykonuje tylko admin.</AppText>
        )}
        {rotate.data ? <AppText variant="caption">{rotate.data.message}</AppText> : null}
      </Card>

      <Card tone="alt">
        <View style={styles.row}>
          <View style={styles.rowText}>
            <AppText variant="heading">{icons.flame} Dziś na macie</AppText>
            <AppText variant="muted">{attendance.data?.length ?? 0} meldunków w dniu dzisiejszym.</AppText>
          </View>
          <Button
            label="synchronizuj grafik"
            small
            loading={sync.isPending}
            onPress={() => sync.mutate(undefined, { onSuccess: () => void templates.refetch() })}
            testID="admin-sync"
          />
        </View>
        {sync.data ? <AppText variant="caption">{sync.data.message}</AppText> : null}
      </Card>

      <SectionHeader
        title="Szablony zajęć"
        subtitle={`${list.length} pozycji w grafiku tygodniowym`}
        icon={icons.calendar}
        action={<Button label="nowe" small icon={icons.plus} onPress={() => setEditing('new')} testID="new-template" />}
      />

      {list.length === 0 && !templates.isLoading ? (
        <EmptyState icon={icons.calendarOff} title="Brak szablonów" message="Dodaj pierwsze zajęcia cykliczne, a grafik sam je rozwinie." />
      ) : null}

      {list.map((template) => (
        <TemplateRow key={template.id} template={template} onEdit={() => setEditing(template)} />
      ))}

      {editing ? (
        <TemplateEditor template={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} />
      ) : null}

      {isAdmin ? <CreateMemberCard /> : null}

      <Card compact>
        <AppText variant="caption">
          {icons.info} Zmiana szablonu nie nadpisuje już utworzonych sesji — nowe ustawienia wejdą od następnej synchronizacji grafiku.
        </AppText>
      </Card>
    </Screen>
  );
}

/** Wiersz szablonu: każda pozycja ma własną mutację włącz/wyłącz. */
const TemplateRow: React.FC<{ readonly template: ClassTemplate; readonly onEdit: () => void }> = React.memo(({ template, onEdit }) => {
  const toggle = useSetTemplateActive();
  return (
    <Card compact tone={template.active ? 'default' : 'alt'}>
      <View style={styles.templateRow}>
        <View style={[styles.colorBar, { backgroundColor: template.color }]} />
        <View style={styles.rowText}>
          <AppText variant="heading" numberOfLines={1}>
            {template.name}
          </AppText>
          <AppText variant="caption">
            {WEEKDAY_SHORT_PL[template.weekday] ?? '—'} {template.startTime} · {template.durationMinutes} min ·{' '}
            {CLASS_TYPE_LABEL_PL[template.classType]} · {template.capacity == null ? 'bez limitu' : `${template.capacity} miejsc`}
          </AppText>
        </View>
        <View style={styles.templateActions}>
          <Badge label={template.active ? 'aktywne' : 'wyłączone'} tone={template.active ? 'success' : 'muted'} />
          <View style={styles.templateButtons}>
            <Button label="edytuj" variant="secondary" small onPress={onEdit} testID={`edit-${template.id}`} />
            <Button
              label={template.active ? 'wyłącz' : 'włącz'}
              variant={template.active ? 'ghost' : 'success'}
              small
              loading={toggle.isPending && toggle.variables?.id === template.id}
              onPress={() => toggle.mutate({ id: template.id, active: !template.active })}
              testID={`toggle-${template.id}`}
            />
          </View>
        </View>
      </View>
      {template.description ? <AppText variant="caption">{template.description}</AppText> : null}
    </Card>
  );
});
TemplateRow.displayName = 'TemplateRow';

/** Edytor szablonu zajęć — tworzenie i zmiana jednej pozycji grafiku. */
const TemplateEditor: React.FC<{
  readonly template: ClassTemplate | null;
  readonly onCancel: () => void;
  readonly onSaved: () => void;
}> = ({ template, onCancel, onSaved }) => {
  const save = useSaveTemplate();
  const { member } = useAuth();

  const [name, setName] = useState(template?.name ?? '');
  const [weekday, setWeekday] = useState<number>(template?.weekday ?? 0);
  const [startTime, setStartTime] = useState(template?.startTime ?? '19:00');
  const [duration, setDuration] = useState(String(template?.durationMinutes ?? 75));
  const [capacity, setCapacity] = useState(template?.capacity != null ? String(template.capacity) : '');
  const [classType, setClassType] = useState<ClassType>(template?.classType ?? 'gi');
  const [level, setLevel] = useState<Level>(template?.level ?? 'all');
  const [color, setColor] = useState<string>(template?.color ?? TEMPLATE_COLORS[0] ?? '#2F6FED');
  const [description, setDescription] = useState(template?.description ?? '');

  const timeValid = /^\d{1,2}:\d{2}$/.test(startTime.trim());
  const durationNumber = Number(duration);
  const capacityNumber = capacity.trim().length > 0 ? Number(capacity) : null;
  const durationValid = Number.isFinite(durationNumber) && durationNumber >= 15;
  const capacityValid = capacityNumber == null || (Number.isFinite(capacityNumber) && capacityNumber >= 1);
  const valid = name.trim().length >= 3 && timeValid && durationValid && capacityValid;

  const submit = () => {
    if (!valid) return;
    save.mutate(
      {
        id: template?.id,
        name: name.trim(),
        classType,
        level,
        weekday,
        startTime: startTime.trim().padStart(5, '0'),
        durationMinutes: Math.round(durationNumber),
        capacity: capacityNumber == null ? null : Math.round(capacityNumber),
        color,
        coachId: template?.coachId ?? member?.id ?? '',
        active: template?.active ?? true,
        description: description.trim().length > 0 ? description.trim() : null,
      },
      { onSuccess: (res) => res.ok && onSaved() }
    );
  };

  return (
    <Card tone="primary" testID="template-editor">
      <AppText variant="heading">{template ? `${icons.note} Edytuj: ${template.name}` : `${icons.plus} Nowe zajęcia cykliczne`}</AppText>
      <TextField label="Nazwa" value={name} onChangeText={setName} placeholder="np. GI technika — wieczór" autoCapitalize="sentences" testID="tpl-name" />
      <AppText variant="label">Dzień tygodnia</AppText>
      <View style={styles.chipRow}>
        {WEEKDAY_SHORT_PL.map((label, index) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            onPress={() => setWeekday(index)}
            testID={`tpl-day-${index}`}
            style={[styles.chip, weekday === index && styles.chipActive]}
          >
            <AppText variant="label" color={weekday === index ? colors.text : colors.textMuted}>
              {label}
            </AppText>
          </Pressable>
        ))}
      </View>
      <View style={styles.fieldRow}>
        <View style={styles.fieldHalf}>
          <TextField
            label="Godzina (HH:mm)"
            value={startTime}
            onChangeText={setStartTime}
            keyboardType="numbers-and-punctuation"
            placeholder="19:00"
            error={!timeValid ? 'format HH:mm' : null}
            testID="tpl-time"
          />
        </View>
        <View style={styles.fieldHalf}>
          <TextField
            label="Czas (min)"
            value={duration}
            onChangeText={setDuration}
            keyboardType="numeric"
            error={!durationValid ? 'min. 15' : null}
            testID="tpl-duration"
          />
        </View>
      </View>
      <TextField
        label="Limit miejsc"
        value={capacity}
        onChangeText={setCapacity}
        keyboardType="numeric"
        placeholder="puste = bez limitu"
        error={!capacityValid ? 'podaj liczbę' : null}
        hint="Gdy miejsca się skończą, działa rezerwa i automatyczne awanse."
        testID="tpl-capacity"
      />
      <AppText variant="label">Typ zajęć</AppText>
      <View style={styles.chipRow}>
        {CLASS_TYPES.map((type) => (
          <Pressable
            key={type}
            accessibilityRole="button"
            onPress={() => setClassType(type)}
            testID={`tpl-type-${type}`}
            style={[styles.chip, classType === type && styles.chipActive]}
          >
            <AppText variant="label" color={classType === type ? colors.text : colors.textMuted}>
              {CLASS_TYPE_LABEL_PL[type]}
            </AppText>
          </Pressable>
        ))}
      </View>
      <AppText variant="label">Poziom</AppText>
      <View style={styles.chipRow}>
        {LEVELS.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            onPress={() => setLevel(value)}
            testID={`tpl-level-${value}`}
            style={[styles.chip, level === value && styles.chipActive]}
          >
            <AppText variant="label" color={level === value ? colors.text : colors.textMuted}>
              {LEVEL_LABEL_PL[value]}
            </AppText>
          </Pressable>
        ))}
      </View>
      <AppText variant="label">Kolor w grafiku</AppText>
      <View style={styles.swatchRow}>
        {TEMPLATE_COLORS.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`kolor ${value}`}
            onPress={() => setColor(value)}
            testID={`tpl-color-${value}`}
            style={[styles.swatch, { backgroundColor: value }, color === value && styles.swatchActive]}
          />
        ))}
      </View>
      <TextField label="Opis" value={description} onChangeText={setDescription} multiline placeholder="dla kogo i co będziemy robić" testID="tpl-description" />
      {save.data && !save.data.ok ? <AppText variant="caption" color="#FFB4B4">{save.data.message}</AppText> : null}
      <View style={styles.row}>
        <Button label="zapisz szablon" disabled={!valid} loading={save.isPending} onPress={submit} style={styles.action} testID="tpl-save" />
        <Button label="anuluj" variant="ghost" onPress={onCancel} testID="tpl-cancel" />
      </View>
    </Card>
  );
};

/** Założenie nowego konta klubowego (admin). */
const CreateMemberCard: React.FC = () => {
  const create = useCreateMember();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [belt, setBelt] = useState<Belt>('white');
  const [weight, setWeight] = useState('');

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const valid = emailValid && firstName.trim().length > 1 && lastName.trim().length > 1;

  return (
    <Card>
      <AppText variant="heading">{icons.users} Nowe konto w klubie</AppText>
      <AppText variant="muted">Konto startuje z białym pasem i aktywnym członkostwem.</AppText>
      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        error={email.length > 3 && !emailValid ? 'sprawdź adres' : null}
        testID="member-email"
      />
      <View style={styles.fieldRow}>
        <View style={styles.fieldHalf}>
          <TextField label="Imię" value={firstName} onChangeText={setFirstName} autoCapitalize="words" testID="member-first" />
        </View>
        <View style={styles.fieldHalf}>
          <TextField label="Nazwisko" value={lastName} onChangeText={setLastName} autoCapitalize="words" testID="member-last" />
        </View>
      </View>
      <AppText variant="label">Rola</AppText>
      <View style={styles.chipRow}>
        {ROLES.map((value) => (
          <Pressable key={value} accessibilityRole="button" onPress={() => setRole(value)} testID={`role-${value}`} style={[styles.chip, role === value && styles.chipActive]}>
            <AppText variant="label" color={role === value ? colors.text : colors.textMuted}>
              {ROLE_LABEL_PL[value]}
            </AppText>
          </Pressable>
        ))}
      </View>
      <AppText variant="label">Pasek startowy</AppText>
      <View style={styles.chipRow}>
        {BELT_ORDER.map((value) => (
          <Pressable key={value} accessibilityRole="button" onPress={() => setBelt(value)} testID={`new-belt-${value}`} style={[styles.chip, belt === value && styles.chipActive]}>
            <AppText variant="label" color={belt === value ? colors.text : colors.textMuted}>
              {BELT_LABEL_PL[value]}
            </AppText>
          </Pressable>
        ))}
      </View>
      <TextField label="Masa (kg)" value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="opcjonalnie" testID="member-weight" />
      {create.data ? (
        <AppText variant="caption" color={create.data.ok ? colors.success : '#FFB4B4'}>
          {create.data.message}
        </AppText>
      ) : null}
      <Button
        label="utwórz konto"
        disabled={!valid}
        loading={create.isPending}
        onPress={() =>
          create.mutate(
            {
              email: email.trim(),
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              role,
              belt,
              weightKg: weight.trim().length > 0 ? Number(weight.replace(',', '.')) : null,
            },
            {
              onSuccess: (res) => {
                if (!res.ok) return;
                setEmail('');
                setFirstName('');
                setLastName('');
                setWeight('');
                setRole('member');
                setBelt('white');
              },
            }
          )
        }
        testID="create-member"
      />
    </Card>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' },
  rowText: { flex: 1, gap: 2 },
  templateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  colorBar: { width: 5, height: 36, borderRadius: radius.sm },
  templateActions: { alignItems: 'flex-end', gap: spacing.xs },
  templateButtons: { flexDirection: 'row', gap: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  swatchRow: { flexDirection: 'row', gap: spacing.sm },
  swatch: { width: 30, height: 30, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong },
  swatchActive: { borderWidth: 2, borderColor: colors.text },
  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  fieldHalf: { flex: 1 },
  action: { minWidth: 170 },
});
