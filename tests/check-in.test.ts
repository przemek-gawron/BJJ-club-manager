import { describe, expect, it } from 'vitest';

import { CHECK_IN_GRACE_MINUTES, CHECK_IN_LEAD_MINUTES, decideCheckIn, evaluateWindow, pickSessionForCheckIn } from '@/domain/check-in';
import { warsawToUtc } from '@/lib/poland-time';

const at = (hour: number, minute = 0) => warsawToUtc({ year: 2026, month: 10, day: 20, hour, minute });

describe('okno check-inu', () => {
  it('otwiera się 60 min przed startem', () => {
    const starts = at(19, 0);
    expect(evaluateWindow(starts, at(17, 59))).toBe('too_early');
    expect(evaluateWindow(starts, at(18, 0))).toBe('open');
    expect(CHECK_IN_LEAD_MINUTES).toBe(60);
  });

  it('zamyka się 90 min po starcie', () => {
    const starts = at(19, 0);
    expect(evaluateWindow(starts, at(20, 30))).toBe('open');
    expect(evaluateWindow(starts, at(20, 31))).toBe('too_late');
    expect(CHECK_IN_GRACE_MINUTES).toBe(90);
  });

  it('jest otwarte w trakcie trwania zajęć', () => {
    expect(evaluateWindow(at(19, 0), at(19, 45))).toBe('open');
  });
});

describe('decyzja po skanie', () => {
  it('wpisuje na listę w oknie', () => {
    const result = decideCheckIn({ now: at(19, 10), startsAt: at(19, 0), alreadyCheckedIn: false, className: 'No-Gi' });
    expect(result.kind).toBe('checked_in');
    expect(result.ok).toBe(true);
  });

  it('jest idempotentne — drugi skan nie generuje błędu', () => {
    const result = decideCheckIn({ now: at(19, 40), startsAt: at(19, 0), alreadyCheckedIn: true, className: 'No-Gi' });
    expect(result.kind).toBe('already_checked_in');
    expect(result.ok).toBe(true);
  });

  it('odrzuca skan przed oknem z konkretną godziną', () => {
    const result = decideCheckIn({ now: at(16, 0), startsAt: at(19, 0), alreadyCheckedIn: false, className: 'Gi' });
    expect(result.kind).toBe('too_early');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('18:00');
  });

  it('odrzuca skan po oknie i kieruje do trenera', () => {
    const result = decideCheckIn({ now: at(22, 0), startsAt: at(19, 0), alreadyCheckedIn: false, className: 'Gi' });
    expect(result.kind).toBe('too_late');
    expect(result.message).toContain('trenera');
  });
});

describe('wybór sesji dla skanu bez wskazanego id', () => {
  it('preferuje zajęcia, które już wystartowały', () => {
    const now = at(18, 30);
    const morning = { id: 'a', startsAt: at(9, 0) };
    const evening = { id: 'b', startsAt: at(19, 0) };
    // Poranne zajęcia są już poza oknem (9:00 + 90 min = 10:30), więc wygrywa wieczór.
    expect(pickSessionForCheckIn([morning, evening], now)?.id).toBe('b');
  });

  it('przy dwóch otwartych oknach bierze te, które już started', () => {
    const now = at(18, 30);
    const early = { id: 'early', startsAt: at(17, 30) }; // w oknie do 19:00
    const evening = { id: 'evening', startsAt: at(19, 0) }; // w oknie od 18:00
    expect(pickSessionForCheckIn([evening, early], now)?.id).toBe('early');
  });

  it('zwraca null, gdy żadne zajęcia nie są w oknie', () => {
    const now = at(12, 0);
    expect(pickSessionForCheckIn([{ id: 'a', startsAt: at(19, 0) }], now)).toBeNull();
  });

  it('radzi sobie z sesją otwierającą się dopiero za chwilę', () => {
    const now = at(18, 0);
    const soon = { id: 'soon', startsAt: at(19, 0) };
    const later = { id: 'later', startsAt: at(19, 45) };
    expect(pickSessionForCheckIn([later, soon], now)?.id).toBe('soon');
  });
});
