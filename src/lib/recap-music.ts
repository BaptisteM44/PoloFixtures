/**
 * Musique du récap : une petite boucle 8-bit jouée par le navigateur (Web
 * Audio), dans l'esprit pixel du site. Aucun fichier, aucun droit d'auteur.
 * 8 mesures à 118 bpm : Do – Sol – La m – Fa, mélodie carrée, basse
 * triangle, arpège discret, batterie (grosse caisse, caisse claire, charley).
 *
 * Doit être démarrée par un geste (toucher / clic) : règle des navigateurs.
 */

const BPM = 118;
const STEPS_PER_BAR = 16;
const BARS = 8;

// Mélodie : un pas = une double croche ; null = silence. (MIDI : 60 = do 4)
const _ = null;
const LEAD: (number | null)[][] = [
  [76, _, 79, _, 76, _, 72, _, 74, _, 76, _, _, _, 72, _],
  [74, _, 79, _, 74, _, 71, _, 72, _, 74, _, _, _, 67, _],
  [72, _, 76, _, 72, _, 69, _, 71, _, 72, _, _, _, 76, _],
  [77, _, 76, _, 72, _, 69, _, 72, _, 74, _, 76, _, _, _],
  [79, _, 76, _, 79, _, 84, _, 79, _, 76, _, 74, _, 72, _],
  [74, _, 71, _, 74, _, 79, _, 77, _, 74, _, 71, _, 67, _],
  [72, _, 76, _, 81, _, 79, _, 76, _, 72, _, 76, _, 79, _],
  [77, _, 76, _, 74, _, 72, _, 74, _, _, _, 72, _, _, _],
];
// Accords (fondamentale de basse + notes d'arpège), un par mesure.
const CHORDS = [
  { root: 36, arp: [60, 64, 67, 72] }, // Do
  { root: 43, arp: [55, 59, 62, 67] }, // Sol
  { root: 45, arp: [57, 60, 64, 69] }, // La m
  { root: 41, arp: [53, 57, 60, 65] }, // Fa
];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export type RecapMusic = { start: () => void; stop: () => void; setMuted: (muted: boolean) => void };

export function createRecapMusic(volume = 0.14): RecapMusic | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let muted = false;
  let step = 0;
  let nextTime = 0;
  const stepDur = 60 / BPM / 4;

  const tone = (type: OscillatorType, freq: number, t: number, dur: number, vol: number) => {
    if (!ctx || !master) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.03);
  };
  const kick = (t: number) => {
    if (!ctx || !master) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.2);
  };
  const hiss = (t: number, dur: number, vol: number, filter: BiquadFilterType, freq: number) => {
    if (!ctx || !master || !noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  };

  const schedule = (s: number, t: number) => {
    const bar = Math.floor(s / STEPS_PER_BAR);
    const i = s % STEPS_PER_BAR;
    const chord = CHORDS[bar % CHORDS.length];
    const lead = LEAD[bar][i];
    if (lead !== null) tone("square", hz(lead), t, stepDur * 1.8, 0.1);
    if (i % 2 === 0) tone("triangle", hz(chord.root + (i === 4 || i === 12 ? 12 : 0)), t, stepDur * 1.6, 0.32);
    tone("square", hz(chord.arp[i % 4]), t, stepDur * 0.7, 0.025);
    if (i === 0 || i === 8 || (bar >= 4 && i === 10)) kick(t);
    if (i === 4 || i === 12) hiss(t, 0.14, 0.2, "bandpass", 1800);
    if (i % 2 === 0) hiss(t, 0.04, 0.05, "highpass", 7000);
  };

  return {
    start() {
      if (ctx) { void ctx.resume(); return; }
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(muted ? 0.0001 : volume, ctx.currentTime + 1.5);
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let k = 0; k < data.length; k++) data[k] = Math.random() * 2 - 1;
      step = 0;
      nextTime = ctx.currentTime + 0.08;
      timer = setInterval(() => {
        if (!ctx) return;
        while (nextTime < ctx.currentTime + 0.12) {
          schedule(step, nextTime);
          nextTime += stepDur;
          step = (step + 1) % (STEPS_PER_BAR * BARS);
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
    },
    setMuted(m: boolean) {
      muted = m;
      if (ctx && master) master.gain.setTargetAtTime(m ? 0.0001 : volume, ctx.currentTime, 0.12);
    },
  };
}
