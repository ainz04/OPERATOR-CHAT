'use strict';
/**
 * FDI SYNTHETIC AUDIO ENGINE (Web Audio API)
 * Recreates mechanical switch typing clicks, retro terminal beeps,
 * teletype incoming chirps, and interface chimes without any external audio files.
 */
class FDIAudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = localStorage.getItem('fdi_audio') !== '0';
    this.lastTypeTime = 0;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('fdi_audio', this.enabled ? '1' : '0');
    if (this.enabled) {
      this.init();
      this.chimeSuccess();
    }
    return this.enabled;
  }

  /**
   * Mechanical typewriter / keyboard switch click
   * Modeled after tactical heavy mechanical key switches like in The Operator:
   * Combines high-frequency snap click + mid-frequency wooden/plastic body resonance.
   */
  typeKey(key = '') {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Debounce extremely rapid key repeats to keep audio crisp
    if (now - this.lastTypeTime < 0.035) return;
    this.lastTypeTime = now;

    const isSpace = key === ' ';
    const isEnter = key === 'Enter';
    const isBackspace = key === 'Backspace';

    // 1. Click impulse (initial transient burst)
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.008);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(isSpace ? 1400 : isEnter ? 950 : 2800 + (Math.random() * 600 - 300), now);
    noiseFilter.Q.setValueAtTime(4.0, now);

    const noiseGain = this.ctx.createGain();
    const snapVolume = isEnter ? 0.35 : isSpace ? 0.25 : 0.28;
    noiseGain.gain.setValueAtTime(snapVolume, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.012);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noiseSource.start(now);

    // 2. Body resonance thump (mechanical tactile housing bottom-out)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    
    osc.type = isEnter ? 'triangle' : 'sine';
    const baseFreq = isEnter ? 120 : isSpace ? 160 : 210 + (Math.random() * 40 - 20);
    osc.frequency.setValueAtTime(baseFreq * 1.5, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.03);

    const bodyVolume = isEnter ? 0.30 : isSpace ? 0.22 : 0.16;
    oscGain.gain.setValueAtTime(bodyVolume, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + (isEnter ? 0.07 : 0.04));

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);

    // 3. Enter key special typewriter carriage ring accent
    if (isEnter) {
      const ring = this.ctx.createOscillator();
      const ringGain = this.ctx.createGain();
      ring.type = 'sine';
      ring.frequency.setValueAtTime(1760, now); // A6 bell
      ringGain.gain.setValueAtTime(0.08, now);
      ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      ring.connect(ringGain);
      ringGain.connect(this.ctx.destination);
      ring.start(now);
      ring.stop(now + 0.26);
    }
  }

  /** Retro CRT Terminal Command Prompt Beep */
  beep(freq = 880, duration = 0.06, type = 'square') {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  /** Incoming teletype message chirp (two quick frequency shifts) */
  chirpIncoming() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.setValueAtTime(1800, now + 0.04);
    osc.frequency.setValueAtTime(2400, now + 0.08);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /** Access Code accepted / Clearance granted chime */
  chimeSuccess() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = now + idx * 0.05;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.25);
    });
  }

  /** Access Denied / Critical Alert warning buzz */
  alertDenied() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.setValueAtTime(110, now + 0.1);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  /** Subtle transmission burst static */
  staticBurst() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.05);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.15;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start(now);
  }
}

window.fdiAudio = new FDIAudioEngine();
