export const WELCOME_SEEN_KEY = 'jamopop:attendance:seen';
export function attendanceEntry(path, search = '') {
  const query = new URLSearchParams(search);
  return (
    ['/', '/news', '/solo', '/home', '/shop'].includes(path) &&
    !['r', 'room', 'invite', 'start'].some((k) => query.has(k))
  );
}
export function alreadyWelcomed(storage, key, day) {
  try {
    return JSON.parse(storage.getItem(WELCOME_SEEN_KEY) || '{}')[key] === day;
  } catch {
    return false;
  }
}
export function rememberWelcome(storage, key, day) {
  try {
    const previous = JSON.parse(storage.getItem(WELCOME_SEEN_KEY) || '{}');
    const entries = Object.entries(previous)
      .filter(([k, v]) => k !== key && v === day)
      .slice(-19);
    storage.setItem(
      WELCOME_SEEN_KEY,
      JSON.stringify({ ...Object.fromEntries(entries), [key]: day }),
    );
  } catch {}
}
