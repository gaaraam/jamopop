// Positive-only hint from the public headword list. Missing/failed entries must
// fall back to the server, which always validates the eventual submission.
export function createGuessPreview(load, normalize) {
  let pending, entries;
  async function known(value) {
    if (!pending) {
      const next = Promise.resolve()
        .then(load)
        .then((words) => {
          if (!Array.isArray(words) || !words.every((w) => typeof w === 'string'))
            throw Error('Invalid public dictionary');
          return new Set(words.map(normalize));
        });
      pending = next;
      next.catch(() => {
        if (pending === next) pending = undefined;
      });
    }
    try {
      entries = await pending;
      return entries.has(normalize(value));
    } catch {
      return false;
    }
  }
  known.peek = (value) => entries?.has(normalize(value)) === true;
  known.warm = () => known('');
  return known;
}
