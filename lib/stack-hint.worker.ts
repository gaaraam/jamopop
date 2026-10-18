import { searchStack } from './jamo-stack.mjs';
self.onmessage = (event) => {
  try {
    const result = searchStack(event.data.cols, event.data.tray, 240000);
    self.postMessage({
      revision: event.data.revision,
      status: result.status,
      col: result.path?.[0],
    });
  } catch {
    self.postMessage({ revision: event.data.revision, status: 'limit' });
  }
};
