import { searchExit } from './kongal-exit.mjs';
self.onmessage = (event) => {
  try {
    const result = searchExit(event.data.pieces, 100000, 3);
    self.postMessage({
      revision: event.data.revision,
      status: result.status,
      step: result.path?.[0],
    });
  } catch {
    self.postMessage({ revision: event.data.revision, status: 'limit' });
  }
};
