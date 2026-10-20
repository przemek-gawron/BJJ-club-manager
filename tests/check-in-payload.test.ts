/**
 * Testy parsera kodu QR — deep-link musi działać zarówno dla `bjjclub://`,
 * jak i dla zwykłego HTTPS oraz gołego tokenu (kod wydrukowany ręcznie).
 */

import { describe, expect, it } from 'vitest';

import { parseCheckInPayload } from '@/domain/check-in';

describe('parseCheckInPayload', () => {
  it('czyta token i sesję z deep-linku klubu', () => {
    const parsed = parseCheckInPayload('bjjclub://check-in?t=club-demo-2026&s=8f0c');
    expect(parsed).toEqual({ token: 'club-demo-2026', sessionId: '8f0c' });
  });

  it('akceptuje https z tymi samymi parametrami', () => {
    const parsed = parseCheckInPayload('https://bjj.club/check-in?t=abc123');
    expect(parsed).toEqual({ token: 'abc123', sessionId: null });
  });

  it('obsługuje long-form parametry i kolejność', () => {
    const parsed = parseCheckInPayload('bjjclub://check-in?sessionId=77&token=xyz');
    expect(parsed).toEqual({ token: 'xyz', sessionId: '77' });
  });

  it('traktuje goły token jako kod bez sesji', () => {
    expect(parseCheckInPayload('  club-demo-2026 ')).toEqual({ token: 'club-demo-2026', sessionId: null });
  });

  it('odrzuca puste wartości i tokeny ze spacją', () => {
    expect(parseCheckInPayload('')).toBeNull();
    expect(parseCheckInPayload('   ')).toBeNull();
    expect(parseCheckInPayload('nie znam tego kodu')).toBeNull();
    expect(parseCheckInPayload('bjjclub://check-in?s=1')).toBeNull();
  });

  it('dekoduje znaki percentowe w tokenie', () => {
    const parsed = parseCheckInPayload('bjjclub://check-in?t=club%2D2026');
    expect(parsed?.token).toBe('club-2026');
  });
});
