/**
 * Sons du jeu, synthétisés avec Web Audio : aucun fichier à télécharger.
 * Le son ne démarre qu'après une action du joueur (règle des navigateurs) : appeler `deverrouiller()`
 * dans un gestionnaire de clic ou de touche.
 */
import type { Evenement } from "../sim/types";

export interface Sons {
  deverrouiller(): void;
  /** Joue le son d'un événement de la simulation. */
  evenement(ev: Evenement): void;
  /** Signaux du match : compte à rebours, coup de sifflet, fin. */
  signal(type: "compte" | "sifflet" | "fin" | "butEnOr"): void;
  /** Son de tension pendant qu'on remplit la jauge (0 = arrêt). */
  charge(force: number): void;
  basculerMuet(): boolean;
  estMuet(): boolean;
  detruire(): void;
}

const CLE = "poloperator-jeu-muet";

export function creerSons(): Sons {
  let ac: AudioContext | null = null, maitre: GainNode | null = null, bruit: AudioBuffer | null = null;
  let muet = false;
  try { muet = localStorage.getItem(CLE) === "1"; } catch { /* stockage indisponible */ }
  let chargeOsc: OscillatorNode | null = null, chargeGain: GainNode | null = null;

  function pret(): AudioContext | null {
    if (!ac || muet || ac.state !== "running") return null;
    return ac;
  }
  function env(g: GainNode, t: number, pic: number, attaque: number, duree: number) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, pic), t + attaque); g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  }
  function souffle(t: number, duree: number, pic: number, filtre: BiquadFilterType, freq: number, q = 1, attaque = 0.004) {
    const a = ac!, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = bruit; f.type = filtre; f.frequency.value = freq; f.Q.value = q;
    env(g, t, pic, attaque, duree); src.connect(f).connect(g).connect(maitre!); src.start(t, Math.random() * 1.5); src.stop(t + duree + 0.05);
  }
  function ton(t: number, type: OscillatorType, f0: number, f1: number, duree: number, pic: number, attaque = 0.003) {
    const a = ac!, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + duree);
    env(g, t, pic, attaque, duree); o.connect(g).connect(maitre!); o.start(t); o.stop(t + duree + 0.05);
  }

  const sons: Sons = {
    deverrouiller() {
      try {
        if (!ac) {
          const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          ac = new C(); maitre = ac.createGain(); maitre.gain.value = 0.8; maitre.connect(ac.destination);
          bruit = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
          const d = bruit.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        if (ac.state === "suspended") void ac.resume();
      } catch { ac = null; }
    },
    evenement(ev) {
      const a = pret(); if (!a) return; const t = a.currentTime;
      switch (ev.type) {
        case "tir": { // claquement du maillet : plus sec et plus grave quand on frappe fort
          const f = ev.force;
          souffle(t, 0.04 + f * 0.03, 0.25 + f * 0.55, "bandpass", 1800 + f * 1400, 1.2);
          ton(t, "triangle", 520 + f * 380, 180, 0.07 + f * 0.05, 0.25 + f * 0.35);
          if (f > 0.55) ton(t, "sine", 110, 55, 0.16, (f - 0.55) * 1.2);
          break;
        }
        case "passe": ton(t, "sine", 660 + Math.min(3, ev.passes) * 110, 660 + Math.min(3, ev.passes) * 110, 0.12, 0.12); break;
        case "tirCombo": ton(t, "triangle", 523, 1046, 0.35, 0.22); ton(t + 0.08, "sine", 784, 1568, 0.3, 0.16); break;
        case "frappeDansLeVide": souffle(t, 0.18, 0.12, "bandpass", 700, 0.6, 0.06); break;
        case "rebond": { const k = Math.min(1, ev.force / 18); souffle(t, 0.16, 0.12 + k * 0.45, "lowpass", 500 + k * 500); ton(t, "sine", 120, 70, 0.14, 0.1 + k * 0.3); break; }
        case "poteau": { const k = Math.min(1, ev.force / 15); ton(t, "sine", 1480, 1380, 0.55, 0.12 + k * 0.25); ton(t, "sine", 2230, 2100, 0.35, 0.06 + k * 0.12); souffle(t, 0.03, 0.2, "highpass", 3000); break; }
        case "plot": { const k = Math.min(1, ev.force / 12); ton(t, "triangle", 640, 380, 0.07, 0.12 + k * 0.25); break; }
        case "collision": ton(t, "sine", 85, 48, 0.16, 0.45); souffle(t, 0.12, 0.25, "lowpass", 600); break;
        case "chute": souffle(t, 0.4, 0.5, "lowpass", 1400); ton(t, "triangle", 620, 180, 0.3, 0.18); break;
        case "tapIn": ton(t, "square", 1250, 1150, 0.025, 0.12); ton(t + 0.09, "square", 1250, 1150, 0.025, 0.1); souffle(t, 0.05, 0.12, "highpass", 2500); break;
        case "but": { // corne + public
          souffle(t, 2.2, 0.35, "bandpass", 950, 0.6, 0.35);
          for (const [f, d] of [[233, 0], [294, 0], [349, 0.12]] as [number, number][]) ton(t + d, "sawtooth", f, f * 0.99, 0.75, 0.07, 0.03);
          break;
        }
        case "butRefuse": ton(t, "square", 220, 150, 0.32, 0.1); break;
        case "vol": ton(t, "triangle", 900, 500, 0.06, 0.18); souffle(t, 0.05, 0.15, "bandpass", 1600, 1.5); break;
        case "corps": { const k = Math.min(1, ev.force / 15); ton(t, "sine", 200, 120, 0.09, 0.12 + k * 0.25); souffle(t, 0.06, 0.1 + k * 0.2, "lowpass", 900); break; }
      }
    },
    signal(type) {
      const a = pret(); if (!a) return; const t = a.currentTime;
      const sifflet = (t0: number, duree: number) => {
        const o = a.createOscillator(), lfo = a.createOscillator(), lg = a.createGain(), g = a.createGain();
        o.type = "sine"; o.frequency.value = 2350; lfo.frequency.value = 38; lg.gain.value = 90;
        lfo.connect(lg).connect(o.frequency); env(g, t0, 0.22, 0.01, duree); o.connect(g).connect(maitre!);
        o.start(t0); lfo.start(t0); o.stop(t0 + duree + 0.05); lfo.stop(t0 + duree + 0.05);
        souffle(t0, duree, 0.05, "bandpass", 2400, 3);
      };
      if (type === "compte") ton(t, "square", 660, 660, 0.12, 0.12);
      else if (type === "sifflet") sifflet(t, 0.55);
      else if (type === "fin") { sifflet(t, 0.35); sifflet(t + 0.45, 0.35); sifflet(t + 0.9, 0.9); }
      else if (type === "butEnOr") for (const [f, d] of [[392, 0], [523, 0.15], [659, 0.3]] as [number, number][]) ton(t + d, "sawtooth", f, f, 0.4, 0.08, 0.02);
    },
    charge(f) {
      const a = pret();
      if (!a || f <= 0) { if (chargeGain && ac) { chargeGain.gain.setTargetAtTime(0.0001, ac.currentTime, 0.02); const o = chargeOsc; setTimeout(() => { try { o?.stop(); } catch { /* déjà arrêté */ } }, 120); } chargeOsc = null; chargeGain = null; return; }
      if (!chargeOsc) {
        chargeOsc = a.createOscillator(); chargeGain = a.createGain(); chargeOsc.type = "triangle";
        chargeGain.gain.value = 0.0001; chargeOsc.connect(chargeGain).connect(maitre!); chargeOsc.start();
      }
      chargeOsc.frequency.setTargetAtTime(160 + f * 420 + (f >= 1 ? Math.sin(a.currentTime * 60) * 18 : 0), a.currentTime, 0.02);
      chargeGain!.gain.setTargetAtTime(0.025 + f * 0.05, a.currentTime, 0.03);
    },
    basculerMuet() { muet = !muet; try { localStorage.setItem(CLE, muet ? "1" : "0"); } catch { /* sans gravité */ } if (muet) sons.charge(0); return muet; },
    estMuet: () => muet,
    detruire() { sons.charge(0); try { void ac?.close(); } catch { /* sans gravité */ } ac = null; },
  };
  return sons;
}
