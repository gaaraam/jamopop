export const PUBLIC_ORIGIN = 'https://play.jamopop.workers.dev';
export const INDEXABLE_PATHS = ['/', '/daily', '/how-to-play'];
export function searchPolicy(url, status = 200) {
  const u = new URL(url);
  return status === 200 && !u.search && INDEXABLE_PATHS.includes(u.pathname)
    ? 'index, follow'
    : 'noindex, follow';
}
