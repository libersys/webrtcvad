import { VAD, SUPPORTED_SAMPLE_RATES } from "../lib/cjs/index";

// The same continuous, band-limited signal (everything under 3.4 kHz, as on a phone call) can be
// sampled at any rate, so the decisions at 8 kHz and at 24 kHz can be compared frame by frame.
// 0.8 s of faint background, then a 120 Hz voice with vibrato in 400 ms bursts.
const bandLimitedSpeech = (() => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  const noise = Array.from({ length: 60 }, () => ({ f: 100 + rnd() * 3300, p: rnd() * 2 * Math.PI }));
  return (t: number): number => {
    let v = 0;
    if (t > 0.8 && Math.floor(t / 0.4) % 2 === 0) {
      const f0 = 120 + 10 * Math.sin(2 * Math.PI * 5 * t);
      const env = Math.sin(Math.PI * ((t % 0.4) / 0.4));
      for (let k = 1; k * 120 < 3400; k++) v += Math.sin(2 * Math.PI * k * f0 * t) / k;
      v *= 0.25 * env;
    }
    let n = 0;
    for (const { f, p } of noise) n += Math.sin(2 * Math.PI * f * t + p);
    return v + 0.002 * n;
  };
})();

const decide = (rate: number, frameMs: number, seconds: number): number[] => {
  const vad = new VAD(rate, 2);
  const frame = (rate * frameMs) / 1000;
  const out: number[] = [];
  for (let start = 0; start + frame <= rate * seconds; start += frame) {
    const buf = Buffer.alloc(frame * 2);
    for (let i = 0; i < frame; i++) {
      const s = Math.max(-1, Math.min(1, bandLimitedSpeech((start + i) / rate)));
      buf.writeInt16LE(Math.round(s * 32767), i * 2);
    }
    out.push(vad.process(buf) ? 1 : 0);
  }
  return out;
};

const agreement = (a: number[], b: number[]) => a.filter((x, i) => x === b[i]).length / a.length;

describe("24 kHz", () => {
  test("lists the supported rates", () => {
    expect(SUPPORTED_SAMPLE_RATES).toEqual([8000, 16000, 24000, 32000, 48000]);
  });

  test("accepts 10, 20 and 30 ms frames and rejects other lengths", () => {
    const vad = new VAD(24000, 3);
    for (const samples of [240, 480, 720]) {
      expect(vad.process(Buffer.alloc(samples * 2))).toBe(false);
    }
    expect(() => vad.process(Buffer.alloc(320))).toThrow();
  });

  test("rejects rates the library does not support", () => {
    expect(() => new VAD(22050, 3)).toThrow(/Unsupported sample rate 22050/);
    expect(() => new VAD(44100, 3)).toThrow(/Unsupported sample rate/);
  });

  test.each([10, 20, 30])("decides like the 8 kHz path on band-limited speech (%i ms frames)", frameMs => {
    const d8 = decide(8000, frameMs, 6);
    const d24 = decide(24000, frameMs, 6);
    expect(d24.length).toBe(d8.length);
    expect(agreement(d24, d8)).toBeGreaterThanOrEqual(0.98);
    // It does detect the bursts, and not the background before them. The VAD starts in the speech
    // state (InitCore sets vad = 1), so at every rate its first ~90 ms read as speech: skip 100 ms.
    expect(d24.filter(x => x === 1).length).toBeGreaterThan(d24.length / 4);
    const settled = Math.ceil(100 / frameMs);
    const backgroundEnd = Math.floor(800 / frameMs) - 1;
    expect(d24.slice(settled, backgroundEnd).every(x => x === 0)).toBe(true);
  });
});

describe("48 kHz", () => {
  // Regression: upstream analysed only the first 10 ms of 20 and 30 ms frames (97% at 30 ms).
  test.each([10, 20, 30])("decides like the 8 kHz path on band-limited speech (%i ms frames)", frameMs => {
    const d8 = decide(8000, frameMs, 6);
    const d48 = decide(48000, frameMs, 6);
    expect(d48.length).toBe(d8.length);
    expect(agreement(d48, d8)).toBeGreaterThanOrEqual(0.98);
  });
});

describe("WebRtcVad Library", () => {
  let vad: VAD;

  beforeAll(() => {
    vad = new VAD(16000, 3); // Create a VAD instance with default values
  });

  test("VAD instance should be created", () => {
    expect(vad).toBeDefined();
  });

  test("VAD should process valid audio buffer", () => {
    const buffer = Buffer.alloc(320, 0); // Create a silent buffer
    const result = vad.process(buffer);
    expect(typeof result).toBe("boolean"); // Should return a boolean
  });

  test("VAD should throw an error for invalid buffer size", () => {
    const invalidBuffer = Buffer.alloc(100); // Wrong size
    expect(() => vad.process(invalidBuffer)).toThrow();
  });

  test("VAD should detect silence correctly", () => {
    const silenceBuffer = Buffer.alloc(320, 0); // A buffer of silence
    const isSpeech = vad.process(silenceBuffer);
    expect(isSpeech).toBe(false); // Silence should not be detected as speech
  });

  //   test("VAD should detect speech (simulate with non-zero buffer)", () => {
  //     const speechBuffer = Buffer.alloc(320, 255); // Simulated speech
  //     const isSpeech = vad.process(speechBuffer);
  //     expect(isSpeech).toBe(true); // Expect it to detect speech
  //   });
});
