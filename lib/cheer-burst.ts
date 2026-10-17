// One shared canvas keeps simultaneous 100-emoji bursts out of layout and hit testing.
type Particle = {
  batch: number;
  start: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  fall: number;
  drift: number;
  size: number;
  spin: number;
  life: number;
  sprite: HTMLCanvasElement;
};
let canvas: HTMLCanvasElement | null = null,
  context: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [],
  frame = 0,
  sequence = 0;
const sprites = new Map<string, HTMLCanvasElement>();
function resize() {
  if (!canvas || !context) return;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = innerWidth * ratio;
  canvas.height = innerHeight * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}
function stop() {
  cancelAnimationFrame(frame);
  frame = 0;
  particles = [];
  canvas?.remove();
  canvas = null;
  context = null;
  window.removeEventListener('resize', resize);
  document.removeEventListener('visibilitychange', onVisibility);
}
function onVisibility() {
  if (document.hidden) stop();
}
function draw(now: number) {
  if (!context || !canvas) return;
  context.clearRect(0, 0, innerWidth, innerHeight);
  particles = particles.filter((p) => now - p.start < p.life);
  for (const p of particles) {
    const age = Math.max(0, now - p.start),
      launch = Math.min(age / 170, 1),
      ease = 1 - Math.pow(1 - launch, 3);
    const fall = Math.max(0, (age - 170) / (p.life - 170));
    const x = p.x + p.dx * ease + p.drift * fall,
      y = p.y + p.dy * ease + p.fall * fall * fall;
    const fade = fall < 0.65 ? 1 : Math.max(0, (1 - fall) / 0.35);
    context.globalAlpha = fade * Math.min(1, age / 35);
    context.save();
    context.translate(x, y);
    context.rotate(p.spin * (launch * 0.2 + fall));
    const size = p.size * (0.55 + 0.45 * ease);
    context.drawImage(p.sprite, -size / 2, -size / 2, size, size);
    context.restore();
  }
  if (particles.length) frame = requestAnimationFrame(draw);
  else stop();
}
export function launchCheerBurst(anchor: HTMLElement, emoji: string, confetti = false) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const rect = anchor.getBoundingClientRect();
  if (rect.bottom < 0 || rect.top > innerHeight || document.hidden) return () => {};
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'cheer-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    context = canvas.getContext('2d');
    if (!context) {
      stop();
      return () => {};
    }
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
  }
  let sprite = sprites.get(emoji);
  if (!sprite) {
    sprite = document.createElement('canvas');
    sprite.width = 96;
    sprite.height = 96;
    const ctx = sprite.getContext('2d');
    if (!ctx) return () => {};
    ctx.font = '64px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 48, 52);
    sprites.set(emoji, sprite);
  }
  const papers: HTMLCanvasElement[] = [];
  if (confetti)
    for (const color of ['#f4cf58', '#ef8ab4', '#77cdb5', '#8dbbff', '#c39af0', '#ffac75']) {
      const cacheKey = `paper:${color}`;
      let paper = sprites.get(cacheKey);
      if (!paper) {
        paper = document.createElement('canvas');
        paper.width = 96;
        paper.height = 96;
        const ctx = paper.getContext('2d');
        if (ctx) {
          ctx.fillStyle = color;
          ctx.fillRect(8, 24, 80, 48);
        }
        sprites.set(cacheKey, paper);
      }
      papers.push(paper);
    }
  const batch = ++sequence,
    start = performance.now(),
    x = rect.left + rect.width / 2,
    y = rect.top + rect.height / 2;
  const spread = Math.min(310, innerWidth * 0.65);
  for (let i = 0; i < 100; i++) {
    // Golden-angle distribution avoids identical rays or conspicuous rows.
    const angle = i * 2.399963229728653,
      radial = Math.sqrt((i + 0.5) / 100);
    particles.push({
      batch,
      start,
      x,
      y,
      dx: Math.cos(angle) * spread * radial,
      dy: -55 - Math.abs(Math.sin(angle)) * 210 * radial + (i % 7 === 0 ? 100 : 0),
      fall: 200 + (i % 9) * 27,
      drift: Math.sin(i * 7.13) * 65,
      size: confetti ? 10 + (i % 7) * 2 : 20 + (i % 7) * 3,
      spin: Math.sin(i * 3.1) * 2.5,
      life: 2600 + (i % 11) * 90,
      sprite: confetti ? papers[i % papers.length] : sprite,
    });
  }
  // Bounded across the room, including rapid simultaneous reactions.
  particles = particles.slice(-1600);
  if (!frame) frame = requestAnimationFrame(draw);
  return () => {
    particles = particles.filter((p) => p.batch !== batch);
    if (!particles.length) stop();
  };
}
