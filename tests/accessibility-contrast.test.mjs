import test from 'node:test';
import assert from 'node:assert/strict';
function luminance(hex) {
  const c = hex
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
function contrast(a, b) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
test('clue glyphs and tiny non-color judgment marks have 4.5:1 across light and dark clue surfaces', () => {
  for (const [background, foreground] of [
    ['64af94', '071e15'],
    ['478f76', '071e15'],
    ['ebc65f', '393724'],
    ['d3af50', '292519'],
    ['cbd3df', '43516a'],
    ['465264', 'd5deeb'],
  ])
    assert(contrast(background, foreground) >= 4.5, `${background}/${foreground}`);
});
