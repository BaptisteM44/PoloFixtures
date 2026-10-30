/**
 * Musique du récap : un morceau 8-bit ORIGINAL dans l'esprit de la French
 * touch (Daft Punk & co) — les codes du genre, pas leurs mélodies (droits
 * d'auteur) : 123 bpm, grosse caisse à chaque temps, charley ouvert à
 * contretemps, basse disco en octaves, accords funky, « pompe » à chaque coup
 * de grosse caisse, filtre qui s'ouvre au démarrage, puis un solo en arpèges
 * rapides façon guitare. Joué par le navigateur (Web Audio) : aucun fichier.
 *
 * 16 mesures en boucle (~31 s) : 8 de riff, 8 de solo.
 * Doit être démarrée par un geste (toucher / clic) : règle des navigateurs.
 */

export const BPM = 123;
export const STEPS_PER_BAR = 16;
export const BARS = 16;
export const STEPS = STEPS_PER_BAR * BARS;

export type Instrument = "lead" | "bass" | "stab" | "shred" | "kick" | "clap" | "ohat" | "chat";
/** Une note : pas de départ (double croche), hauteur MIDI (60 = do 4), durée en pas, volume. */
export type NoteEvent = { step: number; inst: Instrument; midi?: number; len: number; vol: number };

// Ré m7 – Sol 7 – Do maj7 – La m7 : grille funk classique.
const CHORDS = [
  { root: 38, tones: [62, 65, 69, 72] }, // Ré m7
  { root: 43, tones: [55, 59, 62, 65] }, // Sol 7
  { root: 36, tones: [60, 64, 67, 71] }, // Do maj7
  { root: 45, tones: [57, 60, 64, 67] }, // La m7
];

// Riff (mesures 1 à 8) : [pas, note, durée]
const RIFF: [number, number, number][][] = [
  [[0, 69, 2], [3, 72, 2], [6, 74, 2], [8, 72, 1], [10, 69, 2], [14, 67, 2]],
  [[0, 71, 2], [3, 74, 2], [6, 77, 2], [8, 74, 1], [10, 71, 2], [14, 69, 2]],
  [[0, 67, 2], [3, 71, 2], [6, 76, 2], [8, 74, 1], [10, 71, 2], [12, 67, 1], [14, 64, 2]],
  [[0, 69, 1], [2, 72, 1], [4, 76, 1], [6, 79, 2], [8, 76, 1], [11, 74, 2], [14, 72, 2]],
];
// Relance vers le solo (mesure 8)
const PICKUP: [number, number, number][] = [[0, 69, 1], [2, 72, 1], [4, 76, 1], [6, 79, 1], [8, 81, 2], [10, 79, 1], [12, 76, 1], [13, 74, 1], [14, 72, 1], [15, 71, 1]];

/** La partition d'une boucle, note par note. */
export function songEvents(): NoteEvent[] {
  const ev: NoteEvent[] = [];
  for (let bar = 0; bar < BARS; bar++) {
    const at = bar * STEPS_PER_BAR;
    const chord = CHORDS[bar % CHORDS.length];
    const solo = bar >= 8;

    // Batterie : grosse caisse à chaque temps, claps sur 2 et 4, charley ouvert à contretemps.
    for (const s of [0, 4, 8, 12]) ev.push({ step: at + s, inst: "kick", len: 1, vol: 0.75 });
    for (const s of [4, 12]) ev.push({ step: at + s, inst: "clap", len: 1, vol: 0.22 });
    for (const s of [2, 6, 10, 14]) ev.push({ step: at + s, inst: "ohat", len: 1, vol: 0.08 });
    if (bar >= 4) for (let s = 1; s < 16; s += 2) ev.push({ step: at + s, inst: "chat", len: 1, vol: 0.03 });

    // Basse disco : la fondamentale qui saute d'octave à chaque croche.
    for (let k = 0; k < 8; k++) ev.push({ step: at + k * 2, inst: "bass", midi: chord.root + (k % 2 ? 12 : 0), len: 2, vol: 0.34 });

    // Accords funky, en coups brefs et décalés (plus discrets pendant le solo).
    for (const s of solo ? [2, 6, 10, 14] : [2, 5, 10, 13]) {
      for (const m of chord.tones.slice(1)) ev.push({ step: at + s, inst: "stab", midi: m, len: 1, vol: solo ? 0.022 : 0.035 });
    }

    if (!solo) {
      // Riff
      for (const [s, m, len] of bar === 7 ? PICKUP : RIFF[bar % 4]) ev.push({ step: at + s, inst: "lead", midi: m, len, vol: 0.08 });
    } else {
      // Solo : arpèges montants puis descendants sur deux octaves, à la double croche.
      const up = [...chord.tones, ...chord.tones.map((m) => m + 12)];
      const shift = bar >= 12 && bar < 15 ? 12 : 0;
      // Dernière mesure : on monte, on ondule en haut, puis on se pose sur la fondamentale (tenue).
      const run = bar === 15 ? [...up, up[6], up[5], up[4], up[5], up[6], up[7], up[6], up[4]] : [...up, ...[...up].reverse()];
      for (let s = 0; s < 16; s++) {
        const last = bar === 15 && s === 15;
        ev.push({ step: at + s, inst: "shred", midi: run[s] + shift, len: last ? 8 : 1, vol: 0.05 });
      }
    }
  }
  return ev;
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export type RecapMusic = { start: () => void; stop: () => void; setMuted: (muted: boolean) => void };

export function createRecapMusic(volume = 0.16): RecapMusic | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;

  const byStep: NoteEvent[][] = Array.from({ length: STEPS }, () => []);
  for (const e of songEvents()) byStep[e.step].push(e);

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let pump: GainNode | null = null; // bus « pompé » à chaque grosse caisse
  let shredBus: BiquadFilterNode | null = null;
  let noise: AudioBuffer | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let muted = false;
  let step = 0;
  let nextTime = 0;
  const stepDur = 60 / BPM / 4;

  const tone = (type: OscillatorType, freq: number, t: number, dur: number, vol: number, dest: AudioNode) => {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.03);
  };
  const hiss = (t: number, dur: number, vol: number, type: BiquadFilterType, freq: number) => {
    if (!ctx || !master || !noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  };
  const play = (e: NoteEvent, t: number) => {
    if (!ctx || !master || !pump || !shredBus) return;
    const dur = e.len * stepDur;
    switch (e.inst) {
      case "kick": {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        g.gain.setValueAtTime(e.vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + 0.22);
        // La « pompe » : le reste s'efface à chaque coup puis revient.
        pump.gain.cancelScheduledValues(t);
        pump.gain.setValueAtTime(0.3, t);
        pump.gain.linearRampToValueAtTime(1, t + 0.2);
        break;
      }
      case "clap": hiss(t, 0.15, e.vol, "bandpass", 1500); break;
      case "ohat": hiss(t, 0.12, e.vol, "highpass", 7000); break;
      case "chat": hiss(t, 0.03, e.vol, "highpass", 9000); break;
      case "bass": tone("triangle", hz(e.midi!), t, dur * 0.85, e.vol, pump); break;
      case "stab": tone("square", hz(e.midi!), t, dur * 0.8, e.vol, pump); break;
      case "lead": tone("square", hz(e.midi!), t, dur * 0.9, e.vol, master); break;
      case "shred": tone("sawtooth", hz(e.midi!), t, Math.max(dur * 0.95, 0.09), e.vol, shredBus); break;
    }
  };

  return {
    start() {
      if (ctx) { void ctx.resume(); return; }
      ctx = new Ctx();
      // Adoucit les ondes carrées, et s'ouvre progressivement au démarrage (« filter house »).
      const tone8bit = ctx.createBiquadFilter();
      tone8bit.type = "lowpass";
      tone8bit.frequency.setValueAtTime(400, ctx.currentTime);
      tone8bit.frequency.exponentialRampToValueAtTime(9000, ctx.currentTime + 8);
      tone8bit.connect(ctx.destination);
      master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(muted ? 0.0001 : volume, ctx.currentTime + 1.2);
      master.connect(tone8bit);
      pump = ctx.createGain();
      pump.connect(master);
      shredBus = ctx.createBiquadFilter();
      shredBus.type = "lowpass";
      shredBus.frequency.value = 3200;
      shredBus.Q.value = 4;
      shredBus.connect(pump);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let k = 0; k < data.length; k++) data[k] = Math.random() * 2 - 1;
      step = 0;
      nextTime = ctx.currentTime + 0.08;
      timer = setInterval(() => {
        if (!ctx) return;
        while (nextTime < ctx.currentTime + 0.12) {
          for (const e of byStep[step]) play(e, nextTime);
          nextTime += stepDur;
          step = (step + 1) % STEPS;
        }
      }, 25);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      const c = ctx;
      ctx = null;
      if (c && master) {
        master.gain.setTargetAtTime(0.0001, c.currentTime, 0.15);
        setTimeout(() => void c.close(), 600);
      }
      master = null;
      pump = null;
      shredBus = null;
    },
    setMuted(m: boolean) {
      muted = m;
      if (ctx && master) master.gain.setTargetAtTime(m ? 0.0001 : volume, ctx.currentTime, 0.12);
    },
  };
}
