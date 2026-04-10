import * as Tone from "tone";
import { ENGINE_CONFIG, calcCrankFreq, calcFiringFreq } from "../utils/engine";

// ─────────────────────────────────────────────────────
// AUDIO ENGINE CLASS
// ─────────────────────────────────────────────────────
class EngineAudio {
  constructor() {
    this.nodes = {};
    this.isRunning = false;
    this.currentRPM = ENGINE_CONFIG.idleRPM;
  }

  async init() {
    await Tone.start();

    // Ensure the AudioContext is truly running before creating nodes
    if (Tone.context.state !== "running") {
      await new Promise((resolve) => {
        const check = () => {
          if (Tone.context.state === "running") resolve();
          else setTimeout(check, 50);
        };
        check();
      });
    }

    const masterGain = new Tone.Gain(0.35).toDestination();

    // LAYER 1: Combustion pulse (sawtooth → lowpass → distortion)
    const combustionOsc = new Tone.Oscillator({
      type: "sawtooth",
      frequency: calcFiringFreq(this.currentRPM),
    });
    const combustionGain = new Tone.Gain(0.5);
    const combustionFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 300,
      rolloff: -24,
    });

    // LAYER 2: Sub-bass rumble (sine → lowpass)
    const subOsc = new Tone.Oscillator({
      type: "sine",
      frequency: calcCrankFreq(this.currentRPM),
    });
    const subGain = new Tone.Gain(0.4);
    const subFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 120,
      rolloff: -12,
    });

    // LAYER 3: Exhaust 2nd harmonic (sawtooth → bandpass)
    const exhaust2ndOsc = new Tone.Oscillator({
      type: "sawtooth",
      frequency: calcFiringFreq(this.currentRPM) * 2,
    });
    const exhaust2ndGain = new Tone.Gain(0.2);
    const exhaust2ndFilter = new Tone.Filter({
      type: "bandpass",
      frequency: 200,
      Q: 1.5,
    });

    // LAYER 4: Mechanical buzz 4th harmonic (square → bandpass)
    const mechOsc = new Tone.Oscillator({
      type: "square",
      frequency: calcFiringFreq(this.currentRPM) * 4,
    });
    const mechGain = new Tone.Gain(0.06);
    const mechFilter = new Tone.Filter({
      type: "bandpass",
      frequency: 600,
      Q: 2,
    });

    // LAYER 5: Intake/exhaust broadband noise
    const noise = new Tone.Noise("pink");
    const noiseGain = new Tone.Gain(0.08);
    const noiseFilter = new Tone.Filter({
      type: "bandpass",
      frequency: 400,
      Q: 0.8,
    });

    // LAYER 6: Idle instability LFO
    const idleLFO = new Tone.LFO({
      frequency: 0.8,
      min: -4,
      max: 4,
    });

    // LAYER 7: Valve train ticking
    const valveNoise = new Tone.Noise("white");
    const valveGain = new Tone.Gain(0.03);
    const valveHP = new Tone.Filter({
      type: "highpass",
      frequency: 2000,
      rolloff: -12,
    });
    const valveBP = new Tone.Filter({
      type: "bandpass",
      frequency: 4000,
      Q: 2,
    });

    // Effects
    const distortion = new Tone.Distortion(0.15);
    const reverb = new Tone.Reverb({ decay: 0.3, wet: 0.08 });

    // ── Routing ──
    combustionOsc.connect(combustionFilter);
    combustionFilter.connect(combustionGain);
    combustionGain.connect(distortion);
    distortion.connect(reverb);
    reverb.connect(masterGain);

    subOsc.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(masterGain);

    exhaust2ndOsc.connect(exhaust2ndFilter);
    exhaust2ndFilter.connect(exhaust2ndGain);
    exhaust2ndGain.connect(masterGain);

    mechOsc.connect(mechFilter);
    mechFilter.connect(mechGain);
    mechGain.connect(masterGain);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);

    idleLFO.connect(combustionOsc.frequency);

    valveNoise.connect(valveHP);
    valveHP.connect(valveBP);
    valveBP.connect(valveGain);
    valveGain.connect(masterGain);

    this.nodes = {
      masterGain,
      combustionOsc, combustionGain, combustionFilter,
      subOsc, subGain, subFilter,
      exhaust2ndOsc, exhaust2ndGain, exhaust2ndFilter,
      mechOsc, mechGain, mechFilter,
      noise, noiseGain, noiseFilter,
      idleLFO,
      valveNoise, valveGain, valveHP, valveBP,
      distortion, reverb,
    };
  }

  start() {
    if (this.isRunning) return;
    const n = this.nodes;
    n.combustionOsc.start();
    n.subOsc.start();
    n.exhaust2ndOsc.start();
    n.mechOsc.start();
    n.noise.start();
    n.idleLFO.start();
    n.valveNoise.start();
    this.isRunning = true;
  }

  stop() {
    if (!this.isRunning) return;
    const n = this.nodes;
    [n.combustionOsc, n.subOsc, n.exhaust2ndOsc, n.mechOsc, n.noise, n.idleLFO, n.valveNoise].forEach((src) => {
      try { src.stop(); } catch (e) { /* already stopped */ }
    });
    this.isRunning = false;
  }

  setRPM(rpm) {
    if (!this.isRunning) return;

    const clampedRPM = Math.max(ENGINE_CONFIG.minRPM, Math.min(ENGINE_CONFIG.maxRPM, rpm));
    this.currentRPM = clampedRPM;

    const firingFreq = calcFiringFreq(clampedRPM);
    const crankFreq = calcCrankFreq(clampedRPM);
    const rampTime = 0.08;
    const n = this.nodes;
    const rpmRatio = (clampedRPM - ENGINE_CONFIG.minRPM) / (ENGINE_CONFIG.maxRPM - ENGINE_CONFIG.minRPM);

    // Frequencies
    n.combustionOsc.frequency.linearRampTo(firingFreq, rampTime);
    n.subOsc.frequency.linearRampTo(crankFreq, rampTime);
    n.exhaust2ndOsc.frequency.linearRampTo(firingFreq * 2, rampTime);
    n.mechOsc.frequency.linearRampTo(firingFreq * 4, rampTime);

    // Filter tracking
    n.combustionFilter.frequency.linearRampTo(200 + rpmRatio * 800, rampTime);
    n.exhaust2ndFilter.frequency.linearRampTo(150 + firingFreq * 2.5, rampTime);
    n.noiseFilter.frequency.linearRampTo(300 + rpmRatio * 2000, rampTime);
    n.mechFilter.frequency.linearRampTo(400 + rpmRatio * 1500, rampTime);

    // Gain curves
    n.subGain.gain.linearRampTo(0.4 - rpmRatio * 0.2, rampTime);
    n.noiseGain.gain.linearRampTo(0.06 + rpmRatio * 0.14, rampTime);
    n.mechGain.gain.linearRampTo(0.04 + rpmRatio * 0.1, rampTime);
    n.valveGain.gain.linearRampTo(0.02 + rpmRatio * 0.06, rampTime);
    n.combustionGain.gain.linearRampTo(0.45 + rpmRatio * 0.25, rampTime);
    n.masterGain.gain.linearRampTo(0.3 + rpmRatio * 0.15, rampTime);

    // Idle instability fades above ~1200 RPM
    const idleAmount = Math.max(0, 1 - (clampedRPM - 600) / 600);
    n.idleLFO.frequency.linearRampTo(0.5 + Math.random() * 1.5, rampTime);
    
    const lfoRange = Math.max(idleAmount * 4, 0.001);

    n.idleLFO.min = -lfoRange;
    n.idleLFO.max = lfoRange;

    n.distortion.distortion = 0.1 + rpmRatio * 0.3;
  }

  dispose() {
    if (this.isRunning) this.stop();
    Object.values(this.nodes).forEach((node) => {
      try { node.dispose(); } catch (e) {}
    });
    this.nodes = {};
  }
}

export default EngineAudio;