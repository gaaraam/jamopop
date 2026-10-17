export function roundXp(mode, status, attempts) {
  if (!['daily', 'speed'].includes(mode)) return 0;
  if (mode === 'speed') return status === 'won' ? 90 : status === 'lost' && attempts > 0 ? 10 : 0;
  return status === 'won' && attempts > 0 ? 30 : status === 'lost' && attempts === 5 ? 10 : 0;
}
