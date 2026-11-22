let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playNotificationChime(kind: 'message' | 'booking' = 'message'): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = kind === 'booking' ? [587.33, 880, 1174.66] : [659.25, 987.77];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.14, now + idx * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.36);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.38);
    });
  } catch {
    // Ignore autoplay restriction errors before user gesture
  }
}
