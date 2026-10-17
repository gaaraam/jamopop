// Caller supplies only the redacted result grid, never account or answer data.
export async function shareResult(text, platform, copyOnly = false) {
  if (!copyOnly && typeof platform.share === 'function') {
    try {
      await platform.share({ title: '자음모음팝 · 오늘의 단어', text });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await platform.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'manual';
  }
}
