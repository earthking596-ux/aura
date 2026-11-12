import { AbilityId, Faction } from './types';

class CosmicAudioEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private masterVolume = 0.65;
  private lastCollectTime = 0;

  private ensureContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setConfig(enabled: boolean, volume: number): void {
    this.enabled = enabled;
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Light event: Pitch-varied harmonic chime when absorbing cosmic energy particles.
   */
  public playCollect(value: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastCollectTime < 0.04) return;
    this.lastCollectTime = now;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const baseFreq = value >= 12 ? 780 : value >= 6 ? 620 : 510;
    const jitter = 1 + (Math.random() * 0.14 - 0.07);

    osc.type = value >= 12 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(baseFreq * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * jitter * 1.45, now + 0.11);

    const vol = this.masterVolume * (value >= 12 ? 0.16 : 0.09);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  /**
   * Medium event: Subtle plasma thruster ignition on boost start.
   */
  public playBoostStart(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.16);

    const vol = this.masterVolume * 0.08;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  /**
   * Distinct synth signature for each of the 6 faction abilities.
   */
  public playAbility(abilityId: AbilityId): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    if (abilityId === 'shield') {
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(320, now);
      osc1.frequency.exponentialRampToValueAtTime(640, now + 0.28);
      osc2.frequency.setValueAtTime(480, now);
      osc2.frequency.exponentialRampToValueAtTime(960, now + 0.28);
    } else if (abilityId === 'surge') {
      osc1.type = 'sawtooth';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(220, now);
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.22);
      osc2.frequency.setValueAtTime(440, now);
      osc2.frequency.exponentialRampToValueAtTime(1120, now + 0.22);
    } else if (abilityId === 'attract') {
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(580, now);
      osc1.frequency.exponentialRampToValueAtTime(360, now + 0.32);
      osc2.frequency.setValueAtTime(870, now);
      osc2.frequency.exponentialRampToValueAtTime(540, now + 0.32);
    } else if (abilityId === 'pulse') {
      osc1.type = 'triangle';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(420, now);
      osc1.frequency.exponentialRampToValueAtTime(75, now + 0.34);
      osc2.frequency.setValueAtTime(210, now);
      osc2.frequency.exponentialRampToValueAtTime(55, now + 0.34);
    } else if (abilityId === 'vortex') {
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(190, now);
      osc1.frequency.exponentialRampToValueAtTime(68, now + 0.38);
      osc2.frequency.setValueAtTime(285, now);
      osc2.frequency.exponentialRampToValueAtTime(102, now + 0.38);
    } else {
      // disrupt
      osc1.type = 'square';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(520, now);
      osc1.frequency.exponentialRampToValueAtTime(160, now + 0.26);
      osc2.frequency.setValueAtTime(390, now);
      osc2.frequency.exponentialRampToValueAtTime(120, now + 0.26);
    }

    const vol = this.masterVolume * 0.14;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.38);
    osc2.stop(now + 0.38);
  }

  /**
   * Heavy event: Deep cosmic sub-drop and harmonic shatter when an entity is eliminated.
   */
  public playElimination(isLocalPlayer: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const sub = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const gain = ctx.createGain();

    sub.type = 'triangle';
    overtone.type = 'sawtooth';

    sub.frequency.setValueAtTime(isLocalPlayer ? 160 : 210, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.42);

    overtone.frequency.setValueAtTime(isLocalPlayer ? 320 : 480, now);
    overtone.frequency.exponentialRampToValueAtTime(85, now + 0.35);

    const vol = this.masterVolume * (isLocalPlayer ? 0.26 : 0.18);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    sub.connect(gain);
    overtone.connect(gain);
    gain.connect(ctx.destination);
    sub.start(now);
    overtone.start(now);
    sub.stop(now + 0.46);
    overtone.stop(now + 0.46);
  }

  /**
   * Round or match victory / defeat chord fanfare.
   */
  public playRoundEnd(victory: boolean, faction?: Faction | 'draw'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = victory
      ? faction === 'purple'
        ? [330, 415.3, 493.88, 659.25]
        : [349.23, 440, 523.25, 698.46]
      : [293.66, 261.63, 220, 174.61];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = victory ? 'triangle' : 'sawtooth';
      const startTime = now + idx * 0.085;
      osc.frequency.setValueAtTime(freq, startTime);

      const vol = this.masterVolume * 0.13;
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.42);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.45);
    });
  }
}

export const cosmicAudio = new CosmicAudioEngine();
