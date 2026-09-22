// Short beep for timers. iOS only allows audio after a user gesture, so the
// AudioContext is created (or resumed) on the first tap anywhere in the app.

let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) ctx = new Ctor();
  }
  ctx?.resume().catch(() => {});
}

// Every tap keeps the context alive – iOS suspends it again after a while.
export function installAudioUnlock(): void {
  document.addEventListener('touchend', unlockAudio, { passive: true });
  document.addEventListener('click', unlockAudio);
}

export function beep(): void {
  navigator.vibrate?.(200);
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.36);
}
