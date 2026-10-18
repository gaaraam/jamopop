// Tab-local navigation context, not an identity or a source of game state.
const KEY = 'jamopop:active-room';
const modes = ['daily', 'practice', 'speed'];
export function readActiveRoom(storage, now = Date.now()) {
  try {
    const d = JSON.parse(storage.getItem(KEY) || 'null');
    if (
      !d ||
      !/^[a-f0-9]{24}$/.test(d.room) ||
      !modes.includes(d.mode) ||
      !Number.isFinite(d.at) ||
      d.at > now ||
      now - d.at >= 86400000
    )
      return null;
    return {
      ...d,
      href: d.mode === 'speed' ? `/speed?room=${d.room}` : `/?r=${d.room}&m=${d.mode}`,
    };
  } catch {
    return null;
  }
}
export function rememberActiveRoom(storage, room, mode, now = Date.now()) {
  if (!/^[a-f0-9]{24}$/.test(room) || !modes.includes(mode)) return;
  try {
    const old = readActiveRoom(storage, now);
    if (old?.room === room && old.mode === mode) return;
    storage.setItem(KEY, JSON.stringify({ room, mode, at: now }));
  } catch {}
}
export function clearActiveRoom(storage) {
  try {
    storage.removeItem(KEY);
  } catch {}
}
