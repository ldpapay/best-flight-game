// Synthesised sound only — no audio files, no network. A quiet engine
// hum follows the throttle, a bright chime marks a ring, a low thud
// marks a touchdown and a harsh buzz marks a crash. Everything is
// guarded: if the browser has no audio, the game plays silent.

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let enabled = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      engineOsc = context.createOscillator();
      engineGain = context.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain.gain.value = 0;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(context.destination);
      engineOsc.start();
      enabled = true;
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
  }

  function tone(freq, seconds, type, volume, when = 0) {
    if (!ensure()) return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + when;
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(start);
      osc.stop(start + seconds + 0.05);
    } catch { /* silent */ }
  }

  return {
    unlock,
    /** Engine hum follows throttle 0..1 and speed; call every frame. */
    engine(throttle, speed, flying) {
      if (!enabled || !context) return;
      try {
        engineOsc.frequency.value = 48 + throttle * 70 + speed * 0.25;
        engineGain.gain.value = flying ? 0.015 + throttle * 0.03 : 0.008 + throttle * 0.02;
      } catch { /* silent */ }
    },
    ring() { tone(880, 0.35, 'sine', 0.16); tone(1318, 0.45, 'sine', 0.12, 0.08); },
    land() { tone(180, 0.4, 'triangle', 0.2); tone(90, 0.5, 'sine', 0.18, 0.05); },
    crash() { tone(70, 0.8, 'sawtooth', 0.22); tone(55, 0.9, 'square', 0.12, 0.1); },
    click() { tone(660, 0.08, 'sine', 0.08); },
    stall() { tone(440, 0.25, 'square', 0.06); },
  };
}
