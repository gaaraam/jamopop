const PREFIX = 'jamopop:draft:v2:';
export function draftKey(member, round, puzzle = 'room') {
  return PREFIX + JSON.stringify([member, round, puzzle]);
}
export function readDraft(storage, key, row, now = Date.now()) {
  try {
    const d = JSON.parse(storage.getItem(key) || 'null');
    if (!d || d.row !== row || typeof d.text !== 'string' || now - d.at > 86400000) {
      storage.removeItem(key);
      return '';
    }
    return d.text.slice(0, 32);
  } catch {
    return '';
  }
}
export function writeDraft(storage, key, row, text, now = Date.now()) {
  try {
    if (!text) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, JSON.stringify({ row, text: text.slice(0, 32), at: now }));
  } catch {}
}
export function rememberRoom(storage, room, name, mode = 'daily') {
  try {
    storage.setItem('jamopop:resume', JSON.stringify({ room, name, mode, at: Date.now() }));
  } catch {}
}
export function readResume(storage) {
  try {
    const d = JSON.parse(storage.getItem('jamopop:resume') || 'null');
    return d && /^[a-f0-9]{24}$/.test(d.room) && Date.now() - d.at < 86400000 ? d : null;
  } catch {
    return null;
  }
}
export async function checkedFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)])
      : AbortSignal.timeout(10000),
  });
}
