// A pinch zoom is not a software keyboard. Never lift the chat above a zoomed visual viewport.
export function chatViewport({ innerHeight, height, offsetTop = 0, scale = 1, focused = false }) {
  const valid =
    Number.isFinite(innerHeight) &&
    Number.isFinite(height) &&
    height > 0 &&
    Number.isFinite(offsetTop);
  if (!valid || Math.abs(scale - 1) > 0.01) return { bottom: 0, height: 0 };
  return {
    bottom: focused ? Math.max(0, Math.round(innerHeight - height - offsetTop)) : 0,
    height: Math.round(height),
  };
}
