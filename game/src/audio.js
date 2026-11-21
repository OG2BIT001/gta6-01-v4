// Neon Tide: Coral Bay — every sound in the game, synthesised.
//
// There are no audio files in Coral Bay. The engine is two detuned
// oscillators whose pitch follows the throttle, the siren is a triangle
// wave sliding between two notes, the rain is filtered noise, and the
// score is a slow synth pad that drifts through a minor progression.
// One-shots (gunfire, crashes, cash, doors, the UI blip) are built on the
// spot. The module is defensive: with no AudioContext — a muted tab, a
// headless harness — every call is a quiet no-op.

/** Create the audio state. Nothing sounds until unlock() runs on a gesture. */
export function createAudio() {
  return {
    ctx: null,
    master: null,
    engine: null,
    engineGain: null,
    siren: null,
    sirenGain: null,
    rainGain: null,
    padTimer: 0,
    padStep: 0,
    muted: false,
  };
}

/** Build the WebAudio graph. Call from the first key press or click. */
export function unlock(audio) {
  if (audio.ctx) {
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    return;
  }
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  if (!AC) return;
  const ctx = new AC();
  audio.ctx = ctx;
  audio.master = ctx.createGain();
  audio.master.gain.value = audio.muted ? 0 : 0.5;
  audio.master.connect(ctx.destination);

  // Engine: a saw and a square an octave apart, pitch set per frame.
  audio.engineGain = ctx.createGain();
  audio.engineGain.gain.value = 0;
  const engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 520;
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = 55;
  const square = ctx.createOscillator();
  square.type = 'square';
  square.frequency.value = 28;
  const squareGain = ctx.createGain();
  squareGain.gain.value = 0.5;
  saw.connect(engineFilter);
  square.connect(squareGain);
  squareGain.connect(engineFilter);
  engineFilter.connect(audio.engineGain);
  audio.engineGain.connect(audio.master);
  saw.start();
  square.start();
  audio.engine = { saw, square, filter: engineFilter };

  // Siren: one triangle wave the update step slides up and down.
  audio.sirenGain = ctx.createGain();
  audio.sirenGain.gain.value = 0;
  const siren = ctx.createOscillator();
  siren.type = 'triangle';
  siren.frequency.value = 700;
  siren.connect(audio.sirenGain);
  audio.sirenGain.connect(audio.master);
  siren.start();
  audio.siren = siren;

  // Rain: a looping buffer of white noise through a lowpass, gain by weather.
  const noiseLength = ctx.sampleRate * 1.2;
  const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseLength; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.value = 900;
  audio.rainGain = ctx.createGain();
  audio.rainGain.gain.value = 0;
  noise.connect(noiseFilter);
  noiseFilter.connect(audio.rainGain);
  audio.rainGain.connect(audio.master);
  noise.start();
}

/** M toggles this; the master gain follows. */
export function setMuted(audio, muted) {
  audio.muted = muted;
  if (audio.master && audio.ctx) audio.master.gain.setTargetAtTime(muted ? 0 : 0.5, audio.ctx.currentTime, 0.03);
}

/**
 * Per-frame sound direction: engine pitch and volume from the car the
 * player is driving (or silence on foot), the siren from the nearest
 * police unit, rain from the weather, and the pad score ticking over.
 */
export function updateAudio(audio, dt, scene) {
  if (!audio.ctx) return;
  const now = audio.ctx.currentTime;
  if (audio.engine) {
    const target = scene.driving ? 0.05 + Math.min(0.1, Math.abs(scene.speed) / 2600) : 0;
    audio.engineGain.gain.setTargetAtTime(target, now, 0.08);
    if (scene.driving) {
      const rpm = 50 + Math.abs(scene.speed) * 0.55 + (scene.throttle ? 14 : 0);
      audio.engine.saw.frequency.setTargetAtTime(rpm, now, 0.06);
      audio.engine.square.frequency.setTargetAtTime(rpm / 2, now, 0.06);
      audio.engine.filter.frequency.setTargetAtTime(380 + Math.abs(scene.speed) * 1.4, now, 0.1);
    }
  }
  if (audio.siren) {
    const near = scene.policeDistance;
    const target = near < 620 ? 0.028 + (1 - near / 620) * 0.05 : 0;
    audio.sirenGain.gain.setTargetAtTime(target, now, 0.15);
    if (target > 0) {
      const phase = (now % 0.84) / 0.84;
      audio.siren.frequency.setTargetAtTime(phase < 0.5 ? 690 : 920, now, 0.05);
    }
  }
  if (audio.rainGain) audio.rainGain.gain.setTargetAtTime(scene.rain * 0.05, now, 0.4);

  // The pad score: a soft two-note chord every few seconds, Am – F – C – G
  // in low, detuned triangles. It only plays while the game is unpaused.
  audio.padTimer -= dt;
  if (audio.padTimer <= 0 && scene.playing) {
    audio.padTimer = 4.6;
    const chords = [
      [110, 164.8, 261.6],
      [87.3, 130.8, 220],
      [98, 146.8, 246.9],
      [82.4, 123.5, 196],
    ];
    const chord = chords[audio.padStep % chords.length];
    audio.padStep += 1;
    for (const freq of chord) {
      const osc = audio.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = audio.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.028, now + 0.7);
      gain.gain.linearRampToValueAtTime(0, now + 4.4);
      osc.connect(gain);
      gain.connect(audio.master);
      osc.start(now);
      osc.stop(now + 4.6);
    }
  }
}

/** A short shaped blip — the building block under every one-shot. */
function blip(audio, { freq, freqEnd, type, dur, gain, when = 0 }) {
  if (!audio.ctx) return;
  const now = audio.ctx.currentTime + when;
  const osc = audio.ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + dur);
  const g = audio.ctx.createGain();
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.connect(g);
  g.connect(audio.master);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

/** A burst of noise — gunfire, crashes, splashes of static. */
function noiseBurst(audio, { dur, gain, freq, when = 0 }) {
  if (!audio.ctx) return;
  const now = audio.ctx.currentTime + when;
  const length = Math.max(1, Math.floor(audio.ctx.sampleRate * dur));
  const buffer = audio.ctx.createBuffer(1, length, audio.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = audio.ctx.createBufferSource();
  src.buffer = buffer;
  const filter = audio.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  const g = audio.ctx.createGain();
  g.gain.value = gain;
  src.connect(filter);
  filter.connect(g);
  g.connect(audio.master);
  src.start(now);
}

/** The named one-shots the game calls: playSound(audio, 'shot' | 'cash' | ...). */
export function playSound(audio, name) {
  if (!audio.ctx || audio.muted) return;
  switch (name) {
    case 'shot':
      noiseBurst(audio, { dur: 0.11, gain: 0.22, freq: 2600 });
      blip(audio, { freq: 190, freqEnd: 60, type: 'square', dur: 0.09, gain: 0.1 });
      break;
    case 'hit':
      blip(audio, { freq: 130, freqEnd: 70, type: 'sawtooth', dur: 0.12, gain: 0.14 });
      break;
    case 'crash':
      noiseBurst(audio, { dur: 0.3, gain: 0.3, freq: 700 });
      blip(audio, { freq: 90, freqEnd: 40, type: 'sawtooth', dur: 0.28, gain: 0.16 });
      break;
    case 'cash':
      blip(audio, { freq: 880, type: 'sine', dur: 0.09, gain: 0.12 });
      blip(audio, { freq: 1318, type: 'sine', dur: 0.16, gain: 0.12, when: 0.07 });
      break;
    case 'pickup':
      blip(audio, { freq: 520, freqEnd: 780, type: 'sine', dur: 0.12, gain: 0.12 });
      break;
    case 'door':
      blip(audio, { freq: 240, freqEnd: 150, type: 'triangle', dur: 0.1, gain: 0.12 });
      break;
    case 'ui':
      blip(audio, { freq: 660, type: 'sine', dur: 0.05, gain: 0.07 });
      break;
    case 'star':
      blip(audio, { freq: 1174, type: 'triangle', dur: 0.14, gain: 0.1 });
      blip(audio, { freq: 1568, type: 'triangle', dur: 0.2, gain: 0.09, when: 0.08 });
      break;
    case 'busted':
      blip(audio, { freq: 392, freqEnd: 196, type: 'triangle', dur: 0.5, gain: 0.14 });
      break;
    case 'wasted':
      blip(audio, { freq: 220, freqEnd: 55, type: 'sawtooth', dur: 0.8, gain: 0.14 });
      break;
    case 'mission':
      blip(audio, { freq: 523, type: 'triangle', dur: 0.11, gain: 0.11 });
      blip(audio, { freq: 659, type: 'triangle', dur: 0.11, gain: 0.11, when: 0.1 });
      blip(audio, { freq: 784, type: 'triangle', dur: 0.22, gain: 0.11, when: 0.2 });
      break;
    case 'spray':
      noiseBurst(audio, { dur: 0.7, gain: 0.1, freq: 3800 });
      break;
    default:
      break;
  }
}
