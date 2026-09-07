// Tiny WebAudio sound helpers — no audio assets, generated at runtime. Used for
// UI clicks and emergency alerts. Silently no-ops if the AudioContext is blocked
// or sounds are disabled (soundOn in the UI store).

export function click(): void {
  beep(620, 0.04, 0.06);
}

export function alertSiren(): void {
  beep(880, 0.4, 0.12, 3);
}

let ctx: AudioContext | null = null;

function beep(freq: number, dur: number, vol: number, repeat = 1): void {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx || new AC();
    if (ctx.state === "suspended") void ctx.resume();
    for (let i = 0; i < repeat; i++) {
      const t = ctx.currentTime + i * (dur + 0.02);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  } catch {
    /* no audio context (blocked / unsupported) — ignore */
  }
}