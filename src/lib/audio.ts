import type { SfxPreset } from "./types";

/**
 * Zero-dependency sound design. Everything here is synthesised in the browser
 * (16-bit PCM WAV), so sound effects and a music bed cost nothing and need no
 * API key. It is intentionally simple DSP — pads, noise sweeps and impacts.
 */

export function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const channelCount = Math.max(1, channels.length);
  const frames = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channelCount; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function noise(): number {
  return Math.random() * 2 - 1;
}

function env(t: number, duration: number, attack = 0.05, release = 0.4): number {
  const a = Math.min(1, t / Math.max(0.0001, attack));
  const r = Math.min(1, Math.max(0, (duration - t) / Math.max(0.0001, release)));
  return Math.min(a, r);
}

const SR = 44100;

export function renderSfxSamples(kind: SfxPreset, durationSec = 1.8, sampleRate = SR): Float32Array {
  const sr = sampleRate;
  const length = Math.floor(sr * durationSec);
  const data = new Float32Array(length);
  let lp = 0;
  let lp2 = 0;

  for (let i = 0; i < length; i++) {
    const t = i / sr;
    const p = t / durationSec;
    let sample = 0;

    switch (kind) {
      case "whoosh": {
        const cutoff = 0.02 + Math.sin(Math.PI * Math.min(1, p * 1.15)) * 0.16;
        lp += (noise() - lp) * cutoff;
        lp2 += (lp - lp2) * 0.4;
        sample = lp2 * Math.pow(Math.sin(Math.PI * p), 1.6) * 1.8;
        break;
      }
      case "impact": {
        const freq = 110 * Math.exp(-t * 5.5) + 34;
        const body = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 3.4);
        const crack = noise() * Math.exp(-t * 38) * 0.55;
        sample = (body * 0.85 + crack) * 0.9;
        break;
      }
      case "riser": {
        const freq = 180 + Math.pow(p, 2) * 1100;
        const tone = Math.sin(2 * Math.PI * freq * t) * 0.25;
        lp += (noise() - lp) * (0.03 + p * 0.22);
        sample = (tone + lp * 0.75) * Math.pow(p, 1.8) * env(t, durationSec, 0.8, 0.06);
        break;
      }
      case "heartbeat": {
        const beat = (offset: number) => {
          const local = t - offset;
          if (local < 0) return 0;
          const freq = 62 * Math.exp(-local * 8) + 32;
          return Math.sin(2 * Math.PI * freq * local) * Math.exp(-local * 9);
        };
        sample = (beat(0) + beat(durationSec * 0.38) * 0.75) * 0.9;
        break;
      }
      case "rain": {
        lp += (noise() - lp) * 0.35;
        lp2 += (lp - lp2) * 0.08;
        const drop = Math.random() < 0.0006 ? noise() * 0.5 : 0;
        sample = (lp - lp2) * 0.5 + drop;
        break;
      }
      case "sparkle": {
        const noteIndex = Math.floor(p * 6);
        const local = (p * 6 - noteIndex) * (durationSec / 6);
        const freq = [1318, 1568, 1760, 2093, 2637, 3136][noteIndex % 6];
        sample = Math.sin(2 * Math.PI * freq * local) * Math.exp(-local * 5.5) * 0.35;
        break;
      }
      case "drone": {
        const tremolo = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.18 * t);
        sample =
          (Math.sin(2 * Math.PI * 55 * t) * 0.22 +
            Math.sin(2 * Math.PI * 82.5 * t) * 0.14 +
            Math.sin(2 * Math.PI * 110.3 * t) * 0.08) *
          tremolo *
          env(t, durationSec, 0.9, 1.1);
        break;
      }
    }
    data[i] = Math.max(-1, Math.min(1, sample));
  }
  return data;
}

export function renderSfx(kind: SfxPreset, durationSec = 1.8): Blob {
  return encodeWav([renderSfxSamples(kind, durationSec, SR)], SR);
}

const MOODS: Record<string, number[]> = {
  cinematic: [110.0, 130.81, 164.81],
  tense: [73.42, 77.78, 110.0],
  warm: [130.81, 164.81, 196.0],
  uplifting: [98.0, 123.47, 146.83],
};

export function renderAmbientMusic(durationSec: number, mood: string): Blob {
  const sampleRate = 22050;
  const length = Math.floor(sampleRate * durationSec);
  const data = new Float32Array(length);
  const chord = MOODS[mood] || MOODS.cinematic;
  const chordSeconds = 8;
  const fadeIn = Math.min(2, durationSec * 0.1);
  const fadeOut = Math.min(3, durationSec * 0.15);
  let wash = 0;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const chordIndex = Math.floor(t / chordSeconds) % 4;
    const root = chord[chordIndex % chord.length] * (chordIndex === 3 ? 0.8909 : 1);
    const local = t % chordSeconds;
    const padEnv = Math.min(1, local / 2.2) * Math.min(1, (chordSeconds - local) / 2.2);
    const lfo = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.07 * t);

    let sample = 0;
    for (let v = 0; v < 3; v++) {
      const freq = root * [1, 1.5, 2][v] * (v === 2 ? 1.0015 : 1);
      sample += Math.sin(2 * Math.PI * freq * t) * [0.16, 0.09, 0.05][v];
    }
    wash += (Math.random() * 2 - 1 - wash) * 0.02;
    sample += wash * 0.05;

    const fade = Math.min(1, t / fadeIn) * Math.min(1, Math.max(0, (durationSec - t) / fadeOut));
    data[i] = sample * padEnv * lfo * fade * 0.9;
  }
  return encodeWav([data], sampleRate);
}

export interface SfxEvent {
  at: number;
  kind: SfxPreset;
  gain: number;
}

export function renderSfxBed(events: SfxEvent[], durationSec: number): Blob | null {
  if (!events.length) return null;
  const sampleRate = 22050;
  const bed = new Float32Array(Math.floor(sampleRate * durationSec));
  for (const event of events) {
    const samples = renderSfxSamples(event.kind, 1.6, sampleRate);
    const start = Math.floor(event.at * sampleRate);
    for (let i = 0; i < samples.length; i++) {
      const index = start + i;
      if (index >= bed.length) break;
      bed[index] = Math.max(-1, Math.min(1, bed[index] + samples[i] * event.gain));
    }
  }
  return encodeWav([bed], sampleRate);
}

const SFX_HINTS: [SfxPreset, RegExp][] = [
  ["impact", /impact|thud|slam|boom|punch|gun|door/i],
  ["riser", /riser|build|rise|tension|swell/i],
  ["heartbeat", /heart|pulse|breath/i],
  ["rain", /rain|water|storm|wind|waves/i],
  ["sparkle", /sparkle|magic|chime|reveal|light/i],
  ["drone", /drone|hum|ambient|rumble/i],
  ["whoosh", /whoosh|transition|swoosh|movement/i],
];

export function inferSfxPreset(text: string): SfxPreset {
  for (const [kind, pattern] of SFX_HINTS) if (pattern.test(text || "")) return kind;
  return "whoosh";
}
