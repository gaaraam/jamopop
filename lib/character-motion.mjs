// Transform only the artwork: the profile button and card retain their hitboxes.
const win = [
  { transform: 'translateY(0) scale(1)', offset: 0 },
  { transform: 'translateY(2px) scale(1.12,.86)', offset: 0.12 },
  { transform: 'translateY(-13px) rotate(-8deg) scale(.94,1.07)', offset: 0.3 },
  { transform: 'translateY(1px) rotate(0) scale(1.1,.9)', offset: 0.46 },
  { transform: 'translateY(-8px) rotate(7deg) scale(.97,1.04)', offset: 0.64 },
  { transform: 'translateY(1px) scale(1.04,.96)', offset: 0.8 },
  { transform: 'translateY(0) scale(1)', offset: 1 },
];
const cheer = [
  { transform: 'translateY(0) rotate(0) scale(1)', offset: 0 },
  { transform: 'translateY(1px) rotate(-10deg) scale(1.06,.94)', offset: 0.18 },
  { transform: 'translateY(-5px) rotate(10deg) scale(.98,1.04)', offset: 0.38 },
  { transform: 'translateY(-2px) rotate(-7deg) scale(1.03,.98)', offset: 0.58 },
  { transform: 'translateY(-1px) rotate(4deg) scale(1)', offset: 0.78 },
  { transform: 'translateY(0) rotate(0) scale(1)', offset: 1 },
];
export function animateCharacterReaction(element, kind) {
  if (!element?.animate || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    return;
  const animation = element.animate(kind === 'win' ? win : cheer, {
    duration: kind === 'win' ? 1050 : 800,
    easing: 'cubic-bezier(.3,.05,.25,1)',
    iterations: 1,
  });
  return () => animation.cancel();
}
