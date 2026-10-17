export function isChatToggleKey(e) {
  return (
    (e.code === 'Backquote' || e.key === '`') &&
    !e.shiftKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !e.repeat &&
    !e.isComposing &&
    e.keyCode !== 229
  );
}
