// Shared choreography: confirmed judgment first, victory accents afterwards.
export function judgmentTiming(width) {
  const columns = Math.max(1, Math.min(10, Number(width) || 5));
  return { stagger: 55, flip: 280, end: (columns - 1) * 55 + 280 };
}
export function playWordCue(audio, kind, delay = 0) {
  const start = audio.currentTime + Math.max(0, delay);
  const notes = kind === 'win' ? [659.25, 830.61, 987.77] : [kind === 'type' ? 440 : 330];
  for (const [index, frequency] of notes.entries()) {
    const oscillator = audio.createOscillator(),
      gain = audio.createGain();
    const at = start + index * 0.075;
    const duration = kind === 'type' ? 0.045 : kind === 'win' ? 0.22 : 0.095;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, at);
    if (kind !== 'win')
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.65, at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(kind === 'type' ? 0.018 : 0.035, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
}
