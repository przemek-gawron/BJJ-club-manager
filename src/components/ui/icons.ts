/** Ikony: emoji zamiast zależności icon-pack. Kontrast w ciemnym motywie i zero bajtów w bundlu. */

export const icons = {
  checkIn: '⛩️',
  calendar: '🗓️',
  poll: '🗳️',
  vote: '✅',
  users: '🥋',
  stats: '📈',
  sparring: '🤼',
  belt: '🎗️',
  clock: '⏱️',
  flame: '🔥',
  crown: '👑',
  warning: '⚠️',
  check: '✔️',
  close: '✖️',
  plus: '➕',
  minus: '➖',
  chevron: '›',
  settings: '⚙️',
  logout: '🚪',
  scan: '📷',
  medal: '🏅',
  calendarOff: '🚫',
  note: '📝',
  info: 'ℹ️',
  refresh: '🔄',
  timer: '⌛',
  target: '🎯',
} as const;

export type IconName = keyof typeof icons;

export const iconsPl = {
  member: 'członek',
  coach: 'trener',
  admin: 'admin',
} as const;
